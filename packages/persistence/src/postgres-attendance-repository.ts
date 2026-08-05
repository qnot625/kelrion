import { and, asc, eq } from "drizzle-orm";
import {
  AttendanceRecord,
  type AttendanceRecordState,
  type AttendanceStatus,
  type BreakInterval,
  type AttendanceException,
  type AttendanceRecordStore,
  type IdempotencyRegistryStore,
  type IdempotencyRegistryEntry,
  type SyncItemStatus,
  WORKFORCE_EVENT_TYPES,
} from "@adminops/workforce-core";
import type { Database } from "./database.js";
import { attendanceSummaries, attendanceEvents } from "./schema.js";

type AttendanceSummaryRow = typeof attendanceSummaries.$inferSelect;
type AttendanceEventRow = typeof attendanceEvents.$inferSelect;

export class PostgresAttendanceRepository implements AttendanceRecordStore, IdempotencyRegistryStore {
  constructor(private readonly db: Database) {}

  // ---------------------------------------------------------------------------
  // AttendanceRecord / AttendanceRecordStore Methods
  // ---------------------------------------------------------------------------

  public async save(input: AttendanceRecord | IdempotencyRegistryEntry): Promise<void> {
    if (input && typeof (input as AttendanceRecord).toState === "function") {
      await this.saveRecord(input as AttendanceRecord);
    } else {
      await this.saveIdempotencyEntry(input as IdempotencyRegistryEntry);
    }
  }

  public async saveRecord(record: AttendanceRecord): Promise<void> {
    const summary = record.toSummary();
    const state = record.toState();
    const uncommitted = record.getUncommittedEvents();

    try {
      await this.db.transaction(async (tx) => {
        // 1. Upsert attendance_summaries row
        await tx
          .insert(attendanceSummaries)
          .values({
            id: summary.id,
            tenantId: summary.tenantId,
            employeeId: summary.employeeId,
            workDate: summary.workDate,
            firstClockIn: summary.firstClockIn ? new Date(summary.firstClockIn) : null,
            lastClockOut: summary.lastClockOut ? new Date(summary.lastClockOut) : null,
            totalWorkMinutes: summary.totalWorkMinutes,
            totalBreakMinutes: summary.totalBreakMinutes,
            overtimeMinutes: summary.overtimeMinutes,
            status: state.status,
            createdAt: new Date(summary.createdAt),
            updatedAt: new Date(summary.updatedAt),
          })
          .onConflictDoUpdate({
            target: [
              attendanceSummaries.tenantId,
              attendanceSummaries.employeeId,
              attendanceSummaries.workDate,
            ],
            set: {
              firstClockIn: summary.firstClockIn ? new Date(summary.firstClockIn) : null,
              lastClockOut: summary.lastClockOut ? new Date(summary.lastClockOut) : null,
              totalWorkMinutes: summary.totalWorkMinutes,
              totalBreakMinutes: summary.totalBreakMinutes,
              overtimeMinutes: summary.overtimeMinutes,
              status: state.status,
              updatedAt: new Date(summary.updatedAt),
            },
          });

        // 2. Insert uncommitted domain events into attendance_events
        for (const event of uncommitted) {
          const payload = (event.payload as Record<string, unknown>) || {};
          const eventTypeStr = event.eventType;
          const ts = new Date(event.occurredAt);
          const idempotencyKey = (payload.idempotencyKey as string) || `evt_${event.eventId}`;
          const source = (payload.source as string) || "web";
          const location = (payload.location as Record<string, unknown>) || null;
          const notes = JSON.stringify(payload);

          await tx
            .insert(attendanceEvents)
            .values({
              id: event.eventId,
              tenantId: event.tenantId,
              employeeId: (payload.employeeId as string) || record.employeeId,
              eventType: eventTypeStr,
              timestamp: ts,
              idempotencyKey,
              source,
              location,
              notes,
              createdAt: new Date(event.occurredAt),
            })
            .onConflictDoNothing();
        }
      });

      record.clearUncommittedEvents();
    } catch (err) {
      throw err;
    }
  }

  public async findById(tenantId: string, id: string): Promise<AttendanceRecord | null> {
    try {
      const summaryRows = await this.db
        .select()
        .from(attendanceSummaries)
        .where(
          and(
            eq(attendanceSummaries.tenantId, tenantId),
            eq(attendanceSummaries.id, id)
          )
        )
        .limit(1);

      const summaryRow = summaryRows[0];
      if (!summaryRow) return null;

      const events = await this.db
        .select()
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.tenantId, tenantId),
            eq(attendanceEvents.employeeId, summaryRow.employeeId)
          )
        )
        .orderBy(asc(attendanceEvents.timestamp));

      return this.reconstituteFromRowAndEvents(summaryRow, events);
    } catch (err) {
      throw err;
    }
  }

  public async findByEmployeeAndDate(
    tenantId: string,
    employeeId: string,
    workDate: string
  ): Promise<AttendanceRecord | null> {
    try {
      const summaryRows = await this.db
        .select()
        .from(attendanceSummaries)
        .where(
          and(
            eq(attendanceSummaries.tenantId, tenantId),
            eq(attendanceSummaries.employeeId, employeeId),
            eq(attendanceSummaries.workDate, workDate)
          )
        )
        .limit(1);

      const summaryRow = summaryRows[0];
      if (!summaryRow) return null;

      const events = await this.db
        .select()
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.tenantId, tenantId),
            eq(attendanceEvents.employeeId, employeeId)
          )
        )
        .orderBy(asc(attendanceEvents.timestamp));

      return this.reconstituteFromRowAndEvents(summaryRow, events);
    } catch (err) {
      throw err;
    }
  }

  public async getRecord(
    tenantId: string,
    employeeId: string,
    workDate: string
  ): Promise<AttendanceRecord | null> {
    return this.findByEmployeeAndDate(tenantId, employeeId, workDate);
  }

  // ---------------------------------------------------------------------------
  // IdempotencyRegistryStore Methods
  // ---------------------------------------------------------------------------

  public async has(tenantId: string, idempotencyKey: string): Promise<boolean> {
    try {
      const rows = await this.db
        .select({ id: attendanceEvents.id })
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.tenantId, tenantId),
            eq(attendanceEvents.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      return rows.length > 0;
    } catch (err) {
      throw err;
    }
  }

  public async get(tenantId: string, idempotencyKey: string): Promise<IdempotencyRegistryEntry | null> {
    try {
      const rows = await this.db
        .select()
        .from(attendanceEvents)
        .where(
          and(
            eq(attendanceEvents.tenantId, tenantId),
            eq(attendanceEvents.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      let resultStatus: SyncItemStatus = "PROCESSED_SUCCESS";
      let employeeId = row.employeeId;
      let recordId = row.id;

      if (row.notes) {
        try {
          const parsed = JSON.parse(row.notes);
          if (parsed.resultStatus) resultStatus = parsed.resultStatus;
          if (parsed.employeeId) employeeId = parsed.employeeId;
          if (parsed.recordId) recordId = parsed.recordId;
        } catch {
          // Fallback to row default values
        }
      }

      const rawEvt = row.eventType;
      let eventType: IdempotencyRegistryEntry["eventType"] = "clock_in";
      if (rawEvt === "attendance.clocked_in" || rawEvt === "attendance.clock_in" || rawEvt === "clock_in") {
        eventType = "clock_in";
      } else if (rawEvt === "attendance.clocked_out" || rawEvt === "attendance.clock_out" || rawEvt === "clock_out") {
        eventType = "clock_out";
      } else if (rawEvt === "attendance.break_started" || rawEvt === "attendance.break_start" || rawEvt === "break_start") {
        eventType = "break_start";
      } else if (rawEvt === "attendance.break_ended" || rawEvt === "attendance.break_end" || rawEvt === "break_end") {
        eventType = "break_end";
      }

      return {
        tenantId: row.tenantId,
        idempotencyKey: row.idempotencyKey,
        employeeId,
        eventType,
        processedAt: row.createdAt.toISOString(),
        recordId,
        resultStatus,
      };
    } catch (err) {
      throw err;
    }
  }

  public async saveIdempotencyEntry(entry: IdempotencyRegistryEntry): Promise<void> {
    try {
      await this.db
        .insert(attendanceEvents)
        .values({
          id: entry.recordId,
          tenantId: entry.tenantId,
          employeeId: entry.employeeId,
          eventType: entry.eventType,
          timestamp: new Date(entry.processedAt),
          idempotencyKey: entry.idempotencyKey,
          source: "sync_engine",
          notes: JSON.stringify({
            recordId: entry.recordId,
            employeeId: entry.employeeId,
            resultStatus: entry.resultStatus,
          }),
          createdAt: new Date(entry.processedAt),
        })
        .onConflictDoNothing();
    } catch (err) {
      throw err;
    }
  }

  public clear(): void {
    // No-op for persistent database store
  }

  // ---------------------------------------------------------------------------
  // Internal Reconstitution Helper
  // ---------------------------------------------------------------------------

  private reconstituteFromRowAndEvents(
    summaryRow: AttendanceSummaryRow,
    events: AttendanceEventRow[]
  ): AttendanceRecord {
    const breaks: BreakInterval[] = [];
    const exceptions: AttendanceException[] = [];

    for (const e of events) {
      let payload: Record<string, unknown> = {};
      if (e.notes) {
        try {
          payload = JSON.parse(e.notes);
        } catch {
          // ignore non-json notes
        }
      }

      if (
        e.eventType === WORKFORCE_EVENT_TYPES.BREAK_STARTED ||
        e.eventType === "attendance.break_started"
      ) {
        const breakId = (payload.breakId as string) || e.id;
        breaks.push({
          breakId,
          startTime: e.timestamp.toISOString(),
          endTime: null,
          durationMinutes: null,
        });
      } else if (
        e.eventType === WORKFORCE_EVENT_TYPES.BREAK_ENDED ||
        e.eventType === "attendance.break_ended"
      ) {
        const activeBreak = breaks.find((b) => b.endTime === null);
        if (activeBreak) {
          const endTimeIso = e.timestamp.toISOString();
          const startMs = new Date(activeBreak.startTime).getTime();
          const endMs = new Date(endTimeIso).getTime();
          activeBreak.endTime = endTimeIso;
          activeBreak.durationMinutes = Math.max(0, Math.floor((endMs - startMs) / 60000));
        }
      } else if (
        e.eventType === WORKFORCE_EVENT_TYPES.ATTENDANCE_EXCEPTION_DETECTED ||
        e.eventType === "attendance.exception_detected"
      ) {
        if (payload.exception && typeof payload.exception === "object") {
          const exc = payload.exception as AttendanceException;
          if (!exceptions.some((ex) => ex.exceptionId === exc.exceptionId)) {
            exceptions.push(exc);
          }
        }
      }
    }

    // Determine status from row status string or fallback
    let status: AttendanceStatus = "IDLE";
    if (
      summaryRow.status === "CLOCKED_IN" ||
      summaryRow.status === "ON_BREAK" ||
      summaryRow.status === "CLOCKED_OUT" ||
      summaryRow.status === "IDLE"
    ) {
      status = summaryRow.status as AttendanceStatus;
    } else if (summaryRow.lastClockOut) {
      status = "CLOCKED_OUT";
    } else if (breaks.some((b) => b.endTime === null)) {
      status = "ON_BREAK";
    } else if (summaryRow.firstClockIn) {
      status = "CLOCKED_IN";
    }

    const state: AttendanceRecordState = {
      id: summaryRow.id,
      tenantId: summaryRow.tenantId,
      employeeId: summaryRow.employeeId,
      workDate: summaryRow.workDate,
      status,
      clockInTime: summaryRow.firstClockIn ? summaryRow.firstClockIn.toISOString() : null,
      clockOutTime: summaryRow.lastClockOut ? summaryRow.lastClockOut.toISOString() : null,
      breaks,
      activeDurationMinutes: summaryRow.totalWorkMinutes,
      totalBreakMinutes: summaryRow.totalBreakMinutes,
      exceptions,
      createdAt: summaryRow.createdAt.toISOString(),
      updatedAt: summaryRow.updatedAt.toISOString(),
    };

    return AttendanceRecord.reconstitute(state);
  }
}
