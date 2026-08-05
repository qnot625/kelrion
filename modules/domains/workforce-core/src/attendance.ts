import {
  type AttendanceLocation,
  type AttendanceSummary,
} from "./types.js";
import {
  createWorkforceDomainEvent,
  WORKFORCE_EVENT_TYPES,
  type WorkforceDomainEvent,
} from "./events.js";

export class AttendanceDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceDomainError";
  }
}

export type AttendanceStatus = "IDLE" | "CLOCKED_IN" | "ON_BREAK" | "CLOCKED_OUT";

export interface BreakInterval {
  breakId: string;
  startTime: string; // ISO 8601
  endTime: string | null; // ISO 8601 or null if active
  durationMinutes: number | null;
}

export interface AttendanceException {
  exceptionId: string;
  type: "LATE_ARRIVAL" | "EARLY_DEPARTURE" | "EXCESSIVE_BREAK" | "MISSING_CLOCK_OUT";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  detectedAt: string; // ISO 8601
  resolved: boolean;
}

export interface AttendanceRecordState {
  id: string; // UUID
  tenantId: string;
  employeeId: string;
  workDate: string; // YYYY-MM-DD
  status: AttendanceStatus;
  clockInTime: string | null;
  clockOutTime: string | null;
  breaks: BreakInterval[];
  activeDurationMinutes: number;
  totalBreakMinutes: number;
  exceptions: AttendanceException[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAttendanceRecordProps {
  id?: string;
  tenantId: string;
  employeeId: string;
  workDate: string; // YYYY-MM-DD
  clockInTime?: string;
}

export interface AttendanceOperationOptions {
  source?: "web" | "mobile" | "kiosk" | "manual" | "system";
  location?: AttendanceLocation | null;
  notes?: string;
  idempotencyKey?: string;
}

const UuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WorkDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export class AttendanceRecord {
  private props: AttendanceRecordState;
  private _uncommittedEvents: WorkforceDomainEvent[] = [];

  private constructor(state: AttendanceRecordState) {
    this.props = {
      ...state,
      breaks: state.breaks.map((b) => ({ ...b })),
      exceptions: state.exceptions.map((e) => ({ ...e })),
    };
  }

  // ---------------------------------------------------------------------------
  // Factory Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new AttendanceRecord aggregate root instance.
   */
  public static create(input: CreateAttendanceRecordProps): AttendanceRecord {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    if (!UuidRegex.test(id)) {
      throw new AttendanceDomainError("Record ID must be a valid UUID");
    }
    if (!UuidRegex.test(input.tenantId)) {
      throw new AttendanceDomainError("Tenant ID must be a valid UUID");
    }
    if (!UuidRegex.test(input.employeeId)) {
      throw new AttendanceDomainError("Employee ID must be a valid UUID");
    }
    if (!WorkDateRegex.test(input.workDate)) {
      throw new AttendanceDomainError("Work date must be in YYYY-MM-DD format");
    }

    const state: AttendanceRecordState = {
      id,
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      status: "IDLE",
      clockInTime: null,
      clockOutTime: null,
      breaks: [],
      activeDurationMinutes: 0,
      totalBreakMinutes: 0,
      exceptions: [],
      createdAt: now,
      updatedAt: now,
    };

    const record = new AttendanceRecord(state);

    if (input.clockInTime) {
      record.clockIn(input.clockInTime);
    }

    return record;
  }

  /**
   * Reconstitute an existing AttendanceRecord aggregate from state without emitting events.
   */
  public static reconstitute(state: AttendanceRecordState): AttendanceRecord {
    if (!UuidRegex.test(state.id)) {
      throw new AttendanceDomainError("Record ID must be a valid UUID");
    }
    if (!UuidRegex.test(state.tenantId)) {
      throw new AttendanceDomainError("Tenant ID must be a valid UUID");
    }
    if (!UuidRegex.test(state.employeeId)) {
      throw new AttendanceDomainError("Employee ID must be a valid UUID");
    }
    if (!WorkDateRegex.test(state.workDate)) {
      throw new AttendanceDomainError("Work date must be in YYYY-MM-DD format");
    }

    return new AttendanceRecord(state);
  }

  // ---------------------------------------------------------------------------
  // Domain Operations
  // ---------------------------------------------------------------------------

  /**
   * Clock in employee for shift.
   */
  public clockIn(timestamp: string, options?: AttendanceOperationOptions): void {
    if (this.props.status === "CLOCKED_IN" || this.props.status === "ON_BREAK") {
      throw new AttendanceDomainError("Employee is already clocked in");
    }
    if (this.props.status === "CLOCKED_OUT") {
      throw new AttendanceDomainError("Cannot clock in on a record that is already clocked out");
    }

    this.validateIsoTimestamp(timestamp, "Clock-in timestamp");

    const source = options?.source ?? "web";
    const idempotencyKey = options?.idempotencyKey ?? `clk_in_${this.props.id}_${Date.now()}`;

    this.props.status = "CLOCKED_IN";
    this.props.clockInTime = timestamp;
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_IN,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: timestamp,
      payload: {
        attendanceEventId: crypto.randomUUID(),
        tenantId: this.props.tenantId,
        employeeId: this.props.employeeId,
        timestamp,
        idempotencyKey,
        source,
        location: options?.location ?? null,
        notes: options?.notes ?? null,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Start a break for the employee.
   */
  public startBreak(timestamp: string, options?: AttendanceOperationOptions & { breakId?: string }): void {
    if (this.props.status !== "CLOCKED_IN") {
      throw new AttendanceDomainError("Cannot start break unless clocked in");
    }

    const openBreak = this.props.breaks.find((b) => b.endTime === null);
    if (openBreak) {
      throw new AttendanceDomainError("Employee already has an active open break");
    }

    this.validateIsoTimestamp(timestamp, "Break start timestamp");

    if (this.props.clockInTime && new Date(timestamp).getTime() < new Date(this.props.clockInTime).getTime()) {
      throw new AttendanceDomainError("Break start timestamp cannot be before clock-in time");
    }

    const breakId = options?.breakId ?? crypto.randomUUID();
    const source = options?.source ?? "web";
    const idempotencyKey = options?.idempotencyKey ?? `brk_start_${breakId}_${Date.now()}`;

    const newBreak: BreakInterval = {
      breakId,
      startTime: timestamp,
      endTime: null,
      durationMinutes: null,
    };

    this.props.breaks.push(newBreak);
    this.props.status = "ON_BREAK";
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.BREAK_STARTED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: timestamp,
      payload: {
        attendanceEventId: crypto.randomUUID(),
        tenantId: this.props.tenantId,
        employeeId: this.props.employeeId,
        timestamp,
        idempotencyKey,
        source,
        location: options?.location ?? null,
        notes: options?.notes ?? null,
      },
    });

    this.recordEvent(event);
  }

  /**
   * End the current open break.
   */
  public endBreak(timestamp: string, options?: AttendanceOperationOptions): void {
    if (this.props.status !== "ON_BREAK") {
      throw new AttendanceDomainError("Employee is not currently on break");
    }

    const activeBreak = this.props.breaks.find((b) => b.endTime === null);
    if (!activeBreak) {
      throw new AttendanceDomainError("No active open break found");
    }

    this.validateIsoTimestamp(timestamp, "Break end timestamp");

    const startTimeMs = new Date(activeBreak.startTime).getTime();
    const endTimeMs = new Date(timestamp).getTime();

    if (endTimeMs < startTimeMs) {
      throw new AttendanceDomainError("Break end timestamp cannot be before break start timestamp");
    }

    const durationMinutes = Math.max(0, Math.floor((endTimeMs - startTimeMs) / 60000));

    activeBreak.endTime = timestamp;
    activeBreak.durationMinutes = durationMinutes;

    this.recalculateBreaksAndDuration();

    this.props.status = "CLOCKED_IN";
    this.props.updatedAt = new Date().toISOString();

    const source = options?.source ?? "web";
    const idempotencyKey = options?.idempotencyKey ?? `brk_end_${activeBreak.breakId}_${Date.now()}`;

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.BREAK_ENDED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: timestamp,
      payload: {
        attendanceEventId: crypto.randomUUID(),
        tenantId: this.props.tenantId,
        employeeId: this.props.employeeId,
        timestamp,
        idempotencyKey,
        source,
        location: options?.location ?? null,
        notes: options?.notes ?? null,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Clock out employee for shift.
   */
  public clockOut(timestamp: string, options?: AttendanceOperationOptions): void {
    if (this.props.status === "IDLE" || this.props.status === "CLOCKED_OUT") {
      throw new AttendanceDomainError("Cannot clock out when not clocked in");
    }

    this.validateIsoTimestamp(timestamp, "Clock-out timestamp");

    if (this.props.clockInTime && new Date(timestamp).getTime() < new Date(this.props.clockInTime).getTime()) {
      throw new AttendanceDomainError("Clock-out timestamp cannot be before clock-in time");
    }

    // Auto-close active break if currently on break
    if (this.props.status === "ON_BREAK") {
      const activeBreak = this.props.breaks.find((b) => b.endTime === null);
      if (activeBreak) {
        const startTimeMs = new Date(activeBreak.startTime).getTime();
        const endTimeMs = new Date(timestamp).getTime();
        activeBreak.endTime = timestamp;
        activeBreak.durationMinutes = Math.max(0, Math.floor((endTimeMs - startTimeMs) / 60000));
      }
    }

    this.props.status = "CLOCKED_OUT";
    this.props.clockOutTime = timestamp;

    this.recalculateBreaksAndDuration();

    this.props.updatedAt = new Date().toISOString();

    const source = options?.source ?? "web";
    const idempotencyKey = options?.idempotencyKey ?? `clk_out_${this.props.id}_${Date.now()}`;

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_OUT,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: timestamp,
      payload: {
        attendanceEventId: crypto.randomUUID(),
        tenantId: this.props.tenantId,
        employeeId: this.props.employeeId,
        timestamp,
        idempotencyKey,
        source,
        location: options?.location ?? null,
        notes: options?.notes ?? null,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Detect attendance exceptions (late arrival, early departure, excessive break, missing clock out).
   */
  public detectExceptions(
    expectedShiftStart?: string,
    expectedShiftEnd?: string,
    maxBreakMinutes = 60
  ): AttendanceException[] {
    const newlyDetected: AttendanceException[] = [];
    const nowIso = new Date().toISOString();

    // 1. Late Arrival Exception
    if (expectedShiftStart && this.props.clockInTime) {
      const clockInMs = new Date(this.props.clockInTime).getTime();
      const shiftStartMs = new Date(expectedShiftStart).getTime();
      if (clockInMs > shiftStartMs) {
        const lateMinutes = Math.floor((clockInMs - shiftStartMs) / 60000);
        if (!this.hasExceptionType("LATE_ARRIVAL")) {
          const exc: AttendanceException = {
            exceptionId: crypto.randomUUID(),
            type: "LATE_ARRIVAL",
            severity: lateMinutes > 30 ? "high" : "medium",
            message: `Clocked in ${lateMinutes} minutes past expected shift start time`,
            detectedAt: nowIso,
            resolved: false,
          };
          newlyDetected.push(exc);
        }
      }
    }

    // 2. Early Departure Exception
    if (expectedShiftEnd && this.props.clockOutTime) {
      const clockOutMs = new Date(this.props.clockOutTime).getTime();
      const shiftEndMs = new Date(expectedShiftEnd).getTime();
      if (clockOutMs < shiftEndMs) {
        const earlyMinutes = Math.floor((shiftEndMs - clockOutMs) / 60000);
        if (!this.hasExceptionType("EARLY_DEPARTURE")) {
          const exc: AttendanceException = {
            exceptionId: crypto.randomUUID(),
            type: "EARLY_DEPARTURE",
            severity: earlyMinutes > 30 ? "high" : "medium",
            message: `Clocked out ${earlyMinutes} minutes prior to expected shift end time`,
            detectedAt: nowIso,
            resolved: false,
          };
          newlyDetected.push(exc);
        }
      }
    }

    // 3. Excessive Break Exception
    if (this.props.totalBreakMinutes > maxBreakMinutes) {
      if (!this.hasExceptionType("EXCESSIVE_BREAK")) {
        const excess = this.props.totalBreakMinutes - maxBreakMinutes;
        const exc: AttendanceException = {
          exceptionId: crypto.randomUUID(),
          type: "EXCESSIVE_BREAK",
          severity: excess > 30 ? "high" : "medium",
          message: `Total break time of ${this.props.totalBreakMinutes} mins exceeds threshold of ${maxBreakMinutes} mins`,
          detectedAt: nowIso,
          resolved: false,
        };
        newlyDetected.push(exc);
      }
    }

    // 4. Missing Clock Out Exception
    if (this.props.status !== "CLOCKED_OUT" && expectedShiftEnd) {
      const currentMs = Date.now();
      const shiftEndMs = new Date(expectedShiftEnd).getTime();
      if (currentMs > shiftEndMs + 2 * 3600 * 1000) { // 2 hours past shift end
        if (!this.hasExceptionType("MISSING_CLOCK_OUT")) {
          const exc: AttendanceException = {
            exceptionId: crypto.randomUUID(),
            type: "MISSING_CLOCK_OUT",
            severity: "high",
            message: "Missing clock-out past expected shift end window",
            detectedAt: nowIso,
            resolved: false,
          };
          newlyDetected.push(exc);
        }
      }
    }

    for (const exc of newlyDetected) {
      this.props.exceptions.push(exc);

      const event = createWorkforceDomainEvent({
        eventType: WORKFORCE_EVENT_TYPES.ATTENDANCE_EXCEPTION_DETECTED,
        tenantId: this.props.tenantId,
        aggregateId: this.props.id,
        occurredAt: nowIso,
        payload: {
          recordId: this.props.id,
          tenantId: this.props.tenantId,
          employeeId: this.props.employeeId,
          exception: { ...exc },
        },
      });

      this.recordEvent(event);
    }

    return newlyDetected;
  }

  // ---------------------------------------------------------------------------
  // Getters & Immutable Expositions
  // ---------------------------------------------------------------------------

  public get id(): string {
    return this.props.id;
  }

  public get tenantId(): string {
    return this.props.tenantId;
  }

  public get employeeId(): string {
    return this.props.employeeId;
  }

  public get workDate(): string {
    return this.props.workDate;
  }

  public get status(): AttendanceStatus {
    return this.props.status;
  }

  public get clockInTime(): string | null {
    return this.props.clockInTime;
  }

  public get clockOutTime(): string | null {
    return this.props.clockOutTime;
  }

  public get breaks(): ReadonlyArray<BreakInterval> {
    return this.props.breaks.map((b) => ({ ...b }));
  }

  public get activeDurationMinutes(): number {
    return this.props.activeDurationMinutes;
  }

  public get totalBreakMinutes(): number {
    return this.props.totalBreakMinutes;
  }

  public get exceptions(): ReadonlyArray<AttendanceException> {
    return this.props.exceptions.map((e) => ({ ...e }));
  }

  public get createdAt(): string {
    return this.props.createdAt;
  }

  public get updatedAt(): string {
    return this.props.updatedAt;
  }

  public get uncommittedEvents(): ReadonlyArray<WorkforceDomainEvent> {
    return [...this._uncommittedEvents];
  }

  public getUncommittedEvents(): WorkforceDomainEvent[] {
    return [...this._uncommittedEvents];
  }

  public clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }

  public toState(): AttendanceRecordState {
    return {
      ...this.props,
      breaks: this.props.breaks.map((b) => ({ ...b })),
      exceptions: this.props.exceptions.map((e) => ({ ...e })),
    };
  }

  public toSummary(): AttendanceSummary {
    let summaryStatus: "present" | "absent" | "late" | "half_day" | "on_leave" | "holiday" = "absent";
    if (this.props.status === "CLOCKED_IN" || this.props.status === "ON_BREAK" || this.props.status === "CLOCKED_OUT") {
      const hasLateExc = this.hasExceptionType("LATE_ARRIVAL");
      summaryStatus = hasLateExc ? "late" : "present";
    }

    return {
      id: this.props.id,
      tenantId: this.props.tenantId,
      employeeId: this.props.employeeId,
      workDate: this.props.workDate,
      firstClockIn: this.props.clockInTime,
      lastClockOut: this.props.clockOutTime,
      totalWorkMinutes: this.props.activeDurationMinutes,
      totalBreakMinutes: this.props.totalBreakMinutes,
      overtimeMinutes: Math.max(0, this.props.activeDurationMinutes - 480), // Standard 8hr = 480 mins
      status: summaryStatus,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal Helper Methods
  // ---------------------------------------------------------------------------

  private validateIsoTimestamp(timestamp: string, label: string): void {
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) {
      throw new AttendanceDomainError(`${label} must be a valid ISO 8601 date-time string`);
    }
  }

  private recalculateBreaksAndDuration(): void {
    let totalBreaks = 0;
    for (const b of this.props.breaks) {
      if (b.durationMinutes !== null) {
        totalBreaks += b.durationMinutes;
      }
    }
    this.props.totalBreakMinutes = totalBreaks;

    if (this.props.clockInTime && this.props.clockOutTime) {
      const startMs = new Date(this.props.clockInTime).getTime();
      const endMs = new Date(this.props.clockOutTime).getTime();
      const totalElapsed = Math.max(0, Math.floor((endMs - startMs) / 60000));
      this.props.activeDurationMinutes = Math.max(0, totalElapsed - totalBreaks);
    }
  }

  private hasExceptionType(type: AttendanceException["type"]): boolean {
    return this.props.exceptions.some((e) => e.type === type && !e.resolved);
  }

  private recordEvent(event: WorkforceDomainEvent): void {
    this._uncommittedEvents.push(event);
  }
}
