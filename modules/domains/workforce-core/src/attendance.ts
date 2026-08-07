import {
  AttendanceCorrectionNotFoundError,
  AttendanceIdempotencyConflictError,
  AttendanceStateError,
  EmployeeNotFoundError,
  WorkforceValidationError,
  type AttendanceCorrectionRepository,
  type AttendanceRepository,
  type AuditRecorder,
  type EmployeeRepository,
} from "./contracts.js";
import type {
  AttendanceAction,
  AttendanceCorrection,
  AttendanceCorrectionFilterOptions,
  AttendanceOperationInput,
  AttendanceRecordFilterOptions,
  AttendanceRecordState,
  AttendanceSyncItem,
  AttendanceSyncResult,
  BreakInterval,
} from "./types.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function workDate(timestamp: Date): string {
  if (Number.isNaN(timestamp.getTime())) throw new WorkforceValidationError("Attendance timestamp must be a valid date");
  return timestamp.toISOString().slice(0, 10);
}

function cloneBreaks(breaks: readonly BreakInterval[]): BreakInterval[] {
  return breaks.map((item) => ({
    ...item,
    startedAt: new Date(item.startedAt),
    endedAt: item.endedAt ? new Date(item.endedAt) : null,
  }));
}

export class AttendanceRecord {
  private state: AttendanceRecordState;

  private constructor(state: AttendanceRecordState) {
    this.state = {
      ...state,
      clockInAt: state.clockInAt ? new Date(state.clockInAt) : null,
      clockOutAt: state.clockOutAt ? new Date(state.clockOutAt) : null,
      breaks: cloneBreaks(state.breaks),
      exceptions: state.exceptions.map((item) => ({
        ...item,
        detectedAt: new Date(item.detectedAt),
        resolvedAt: item.resolvedAt ? new Date(item.resolvedAt) : null,
      })),
      createdAt: new Date(state.createdAt),
      updatedAt: new Date(state.updatedAt),
    };
  }

  static create(tenantId: string, employeeId: string, date: string): AttendanceRecord {
    if (!DATE_PATTERN.test(date)) throw new WorkforceValidationError("workDate must use YYYY-MM-DD format");
    const now = new Date();
    return new AttendanceRecord({
      id: crypto.randomUUID(),
      tenantId,
      employeeId,
      workDate: date,
      status: "idle",
      clockInAt: null,
      clockOutAt: null,
      breaks: [],
      activeDurationMinutes: 0,
      totalBreakMinutes: 0,
      exceptions: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(state: AttendanceRecordState): AttendanceRecord {
    return new AttendanceRecord(state);
  }

  get id(): string { return this.state.id; }
  get tenantId(): string { return this.state.tenantId; }
  get employeeId(): string { return this.state.employeeId; }
  get date(): string { return this.state.workDate; }
  get status(): AttendanceRecordState["status"] { return this.state.status; }

  apply(action: AttendanceAction, timestamp: Date): void {
    if (Number.isNaN(timestamp.getTime())) throw new WorkforceValidationError("Attendance timestamp must be valid");
    if (workDate(timestamp) !== this.state.workDate) {
      throw new AttendanceStateError("Attendance event must belong to the record work date");
    }

    switch (action) {
      case "clock_in":
        this.clockIn(timestamp);
        break;
      case "break_start":
        this.startBreak(timestamp);
        break;
      case "break_end":
        this.endBreak(timestamp);
        break;
      case "clock_out":
        this.clockOut(timestamp);
        break;
    }
  }

  toState(): AttendanceRecordState {
    return {
      ...this.state,
      clockInAt: this.state.clockInAt ? new Date(this.state.clockInAt) : null,
      clockOutAt: this.state.clockOutAt ? new Date(this.state.clockOutAt) : null,
      breaks: cloneBreaks(this.state.breaks),
      exceptions: this.state.exceptions.map((item) => ({
        ...item,
        detectedAt: new Date(item.detectedAt),
        resolvedAt: item.resolvedAt ? new Date(item.resolvedAt) : null,
      })),
      createdAt: new Date(this.state.createdAt),
      updatedAt: new Date(this.state.updatedAt),
    };
  }

  private clockIn(timestamp: Date): void {
    if (this.state.status !== "idle") throw new AttendanceStateError("Employee is already clocked in for this work date");
    this.state = { ...this.state, status: "clocked_in", clockInAt: timestamp, updatedAt: new Date() };
  }

  private startBreak(timestamp: Date): void {
    if (this.state.status !== "clocked_in") throw new AttendanceStateError("A break can only start while clocked in");
    if (this.state.clockInAt && timestamp < this.state.clockInAt) throw new AttendanceStateError("Break cannot start before clock in");
    this.state = {
      ...this.state,
      status: "on_break",
      breaks: [...this.state.breaks, { id: crypto.randomUUID(), startedAt: timestamp, endedAt: null, durationMinutes: null }],
      updatedAt: new Date(),
    };
  }

  private endBreak(timestamp: Date): void {
    if (this.state.status !== "on_break") throw new AttendanceStateError("Employee is not currently on break");
    const openIndex = [...this.state.breaks]
      .map((item, index) => ({ item, index }))
      .reverse()
      .find(({ item }) => item.endedAt === null)?.index;
    if (openIndex === undefined) throw new AttendanceStateError("No open break exists");
    const open = this.state.breaks[openIndex]!;
    if (timestamp < open.startedAt) throw new AttendanceStateError("Break cannot end before it starts");
    const breaks = this.state.breaks.map((item, index) => index === openIndex
      ? {
          ...item,
          endedAt: timestamp,
          durationMinutes: Math.floor((timestamp.getTime() - item.startedAt.getTime()) / 60_000),
        }
      : { ...item });
    this.state = { ...this.state, status: "clocked_in", breaks, updatedAt: new Date() };
    this.recalculate();
  }

  private clockOut(timestamp: Date): void {
    if (this.state.status !== "clocked_in" && this.state.status !== "on_break") {
      throw new AttendanceStateError("Employee must be clocked in before clocking out");
    }
    if (!this.state.clockInAt || timestamp < this.state.clockInAt) {
      throw new AttendanceStateError("Clock out cannot be before clock in");
    }
    if (this.state.status === "on_break") {
      const openIndex = [...this.state.breaks]
        .map((item, index) => ({ item, index }))
        .reverse()
        .find(({ item }) => item.endedAt === null)?.index;
      const breaks = this.state.breaks.map((item, index) => {
        if (index !== openIndex) return { ...item };
        if (timestamp < item.startedAt) throw new AttendanceStateError("Clock out cannot be before the active break started");
        return {
          ...item,
          endedAt: timestamp,
          durationMinutes: Math.floor((timestamp.getTime() - item.startedAt.getTime()) / 60_000),
        };
      });
      this.state = { ...this.state, breaks };
    }
    this.state = { ...this.state, status: "clocked_out", clockOutAt: timestamp, updatedAt: new Date() };
    this.recalculate();
  }

  private recalculate(): void {
    const totalBreakMinutes = this.state.breaks.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
    let activeDurationMinutes = this.state.activeDurationMinutes;
    if (this.state.clockInAt && this.state.clockOutAt) {
      const elapsed = Math.max(0, Math.floor((this.state.clockOutAt.getTime() - this.state.clockInAt.getTime()) / 60_000));
      activeDurationMinutes = Math.max(0, elapsed - totalBreakMinutes);
    }
    this.state = { ...this.state, totalBreakMinutes, activeDurationMinutes };
  }
}

function canonicalPayload(input: AttendanceOperationInput): string {
  return JSON.stringify({
    employeeId: input.employeeId,
    action: input.action,
    timestamp: input.timestamp.toISOString(),
    source: input.source ?? "web",
    location: input.location ?? null,
    notes: input.notes ?? null,
  });
}

export class AttendanceService {
  constructor(
    private readonly employees: EmployeeRepository,
    private readonly attendance: AttendanceRepository,
    private readonly corrections: AttendanceCorrectionRepository,
    private readonly audit?: AuditRecorder,
  ) {}

  async getForUser(tenantId: string, userId: string, date = new Date().toISOString().slice(0, 10)): Promise<AttendanceRecordState | null> {
    const employee = await this.employees.findByUserId(tenantId, userId);
    if (!employee) return null;
    return this.attendance.getRecord(tenantId, employee.id, date);
  }

  async getEmployeeForUser(tenantId: string, userId: string) {
    return (await this.employees.findByUserId(tenantId, userId))?.toState() ?? null;
  }

  async apply(input: AttendanceOperationInput, actorUserId: string | null = null): Promise<AttendanceRecordState> {
    const employee = await this.employees.findById(input.tenantId, input.employeeId);
    if (!employee) throw new EmployeeNotFoundError(input.employeeId);
    if (employee.employmentStatus === "terminated" || employee.employmentStatus === "suspended") {
      throw new AttendanceStateError(`Cannot record attendance for an employee with status ${employee.employmentStatus}`);
    }

    const payloadHash = canonicalPayload(input);
    if (input.idempotencyKey) {
      const existing = await this.attendance.findIdempotency(input.tenantId, input.idempotencyKey);
      if (existing) {
        if (existing.payloadHash !== payloadHash) throw new AttendanceIdempotencyConflictError();
        const record = await this.attendance.getRecordById(input.tenantId, existing.recordId);
        if (!record) throw new AttendanceStateError("Idempotency record references a missing attendance record");
        return record;
      }
    }

    const date = workDate(input.timestamp);
    const existing = await this.attendance.getRecord(input.tenantId, input.employeeId, date);
    const aggregate = existing ? AttendanceRecord.reconstitute(existing) : AttendanceRecord.create(input.tenantId, input.employeeId, date);
    aggregate.apply(input.action, input.timestamp);
    const state = aggregate.toState();
    await this.attendance.saveRecord(state);

    if (input.idempotencyKey) {
      await this.attendance.saveIdempotency({
        tenantId: input.tenantId,
        key: input.idempotencyKey,
        payloadHash,
        recordId: state.id,
        createdAt: new Date(),
      });
    }

    await this.record(input.tenantId, actorUserId, `attendance.${input.action}`, state.id, {
      employeeId: input.employeeId,
      workDate: date,
      timestamp: input.timestamp.toISOString(),
      source: input.source ?? "web",
      location: input.location ?? null,
      notes: input.notes ?? null,
    });
    return state;
  }

  async sync(tenantId: string, items: readonly AttendanceSyncItem[], actorUserId: string | null = null): Promise<AttendanceSyncResult[]> {
    const results: AttendanceSyncResult[] = [];
    for (const item of items) {
      const existing = await this.attendance.findIdempotency(tenantId, item.idempotencyKey);
      try {
        const state = await this.apply({ tenantId, ...item }, actorUserId);
        results.push({ idempotencyKey: item.idempotencyKey, status: existing ? "duplicate" : "processed", recordId: state.id });
      } catch (error) {
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: "rejected",
          message: error instanceof Error ? error.message : "Attendance sync failed",
        });
      }
    }
    return results;
  }

  async list(tenantId: string, options?: AttendanceRecordFilterOptions): Promise<AttendanceRecordState[]> {
    return this.attendance.listRecords(tenantId, options);
  }

  async requestCorrection(
    tenantId: string,
    actorUserId: string | null,
    input: { employeeId: string; requestedAction: AttendanceAction; requestedAt: Date; reason: string },
  ): Promise<AttendanceCorrection> {
    if (!input.reason.trim()) throw new WorkforceValidationError("Correction reason is required");
    if (!await this.employees.findById(tenantId, input.employeeId)) throw new EmployeeNotFoundError(input.employeeId);
    const correction = await this.corrections.create({ tenantId, ...input, reason: input.reason.trim() });
    await this.record(tenantId, actorUserId, "attendance.correction_requested", correction.id, {
      employeeId: correction.employeeId,
      requestedAction: correction.requestedAction,
      requestedAt: correction.requestedAt.toISOString(),
    });
    return correction;
  }

  async listCorrections(tenantId: string, options?: AttendanceCorrectionFilterOptions): Promise<{ data: AttendanceCorrection[]; total: number }> {
    const [data, total] = await Promise.all([
      this.corrections.list(tenantId, options),
      this.corrections.count(tenantId, options),
    ]);
    return { data, total };
  }

  async reviewCorrection(
    tenantId: string,
    actorUserId: string,
    id: string,
    approved: boolean,
    reviewNotes?: string,
  ): Promise<AttendanceCorrection> {
    const correction = await this.corrections.findById(tenantId, id);
    if (!correction) throw new AttendanceCorrectionNotFoundError(id);
    if (correction.status !== "pending") throw new AttendanceStateError("Attendance correction has already been reviewed");
    if (approved) {
      await this.apply({
        tenantId,
        employeeId: correction.employeeId,
        action: correction.requestedAction,
        timestamp: correction.requestedAt,
        idempotencyKey: `attendance-correction:${correction.id}`,
        source: "manual",
        notes: correction.reason,
      }, actorUserId);
    }
    const reviewed = await this.corrections.review(
      tenantId,
      id,
      approved ? "approved" : "rejected",
      actorUserId,
      reviewNotes,
    );
    await this.record(tenantId, actorUserId, approved ? "attendance.correction_approved" : "attendance.correction_rejected", id, {
      employeeId: correction.employeeId,
      reviewNotes: reviewNotes ?? null,
    });
    return reviewed;
  }

  private async record(
    tenantId: string,
    actorUserId: string | null,
    action: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.audit) return;
    await this.audit.record({ tenantId, actorUserId, action, targetType: "attendance", targetId, metadata });
  }
}
