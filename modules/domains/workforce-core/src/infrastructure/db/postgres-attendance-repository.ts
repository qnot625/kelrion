import { sql, type SQL } from "drizzle-orm";
import type {
  AttendanceCorrection,
  AttendanceCorrectionFilterOptions,
  AttendanceCorrectionRepository,
  AttendanceException,
  AttendanceIdempotencyRecord,
  AttendanceRecordFilterOptions,
  AttendanceRecordState,
  AttendanceRepository,
  BreakInterval,
  CreateAttendanceCorrectionInput,
  CorrectionStatus,
} from "../../index.js";
import { AttendanceCorrectionNotFoundError } from "../../index.js";
import type { Database } from "@adminops/persistence";

async function queryRows<T>(db: Database, statement: SQL): Promise<T[]> {
  const result = await db.execute(statement);
  return (result as unknown as { rows: T[] }).rows;
}

interface AttendanceRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  work_date: string | Date;
  status: AttendanceRecordState["status"];
  clock_in_at: Date | string | null;
  clock_out_at: Date | string | null;
  breaks: unknown;
  active_duration_minutes: number;
  total_break_minutes: number;
  exceptions: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CorrectionRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  requested_action: AttendanceCorrection["requestedAction"];
  requested_at: Date | string;
  reason: string;
  status: CorrectionStatus;
  reviewed_by_user_id: string | null;
  review_notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  }
  return [];
}

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toAttendance(row: AttendanceRow): AttendanceRecordState {
  const breaks = parseJsonArray<Record<string, unknown>>(row.breaks).map((item): BreakInterval => ({
    id: String(item.id ?? ""),
    startedAt: new Date(String(item.startedAt ?? item.started_at ?? "")),
    endedAt: item.endedAt || item.ended_at ? new Date(String(item.endedAt ?? item.ended_at)) : null,
    durationMinutes: item.durationMinutes == null && item.duration_minutes == null
      ? null
      : Number(item.durationMinutes ?? item.duration_minutes),
  }));
  const exceptions = parseJsonArray<Record<string, unknown>>(row.exceptions).map((item): AttendanceException => ({
    id: String(item.id ?? ""),
    type: item.type as AttendanceException["type"],
    message: String(item.message ?? ""),
    detectedAt: new Date(String(item.detectedAt ?? item.detected_at ?? "")),
    resolvedAt: item.resolvedAt || item.resolved_at ? new Date(String(item.resolvedAt ?? item.resolved_at)) : null,
  }));
  return {
    id: row.id,
    tenantId: row.tenant_id,
    employeeId: row.employee_id,
    workDate: dateOnly(row.work_date),
    status: row.status,
    clockInAt: row.clock_in_at ? new Date(row.clock_in_at) : null,
    clockOutAt: row.clock_out_at ? new Date(row.clock_out_at) : null,
    breaks,
    activeDurationMinutes: Number(row.active_duration_minutes),
    totalBreakMinutes: Number(row.total_break_minutes),
    exceptions,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toCorrection(row: CorrectionRow): AttendanceCorrection {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    employeeId: row.employee_id,
    requestedAction: row.requested_action,
    requestedAt: new Date(row.requested_at),
    reason: row.reason,
    status: row.status,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewNotes: row.review_notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const ATTENDANCE_COLUMNS = sql.raw(`
  r.id, r.tenant_id, r.employee_id, r.work_date, r.status, r.clock_in_at,
  r.clock_out_at, r.breaks, r.active_duration_minutes, r.total_break_minutes,
  r.exceptions, r.created_at, r.updated_at
`);

export class PostgresAttendanceRepository implements AttendanceRepository {
  constructor(private readonly db: Database) {}

  async saveRecord(record: AttendanceRecordState): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO attendance_records (
        id, tenant_id, employee_id, work_date, status, clock_in_at, clock_out_at,
        breaks, active_duration_minutes, total_break_minutes, exceptions, created_at, updated_at
      ) VALUES (
        ${record.id}::uuid, ${record.tenantId}::uuid, ${record.employeeId}::uuid, ${record.workDate}::date,
        ${record.status}, ${record.clockInAt}, ${record.clockOutAt},
        ${JSON.stringify(record.breaks)}::jsonb, ${record.activeDurationMinutes}, ${record.totalBreakMinutes},
        ${JSON.stringify(record.exceptions)}::jsonb, ${record.createdAt}, ${record.updatedAt}
      )
      ON CONFLICT (tenant_id, employee_id, work_date) DO UPDATE SET
        status = EXCLUDED.status,
        clock_in_at = EXCLUDED.clock_in_at,
        clock_out_at = EXCLUDED.clock_out_at,
        breaks = EXCLUDED.breaks,
        active_duration_minutes = EXCLUDED.active_duration_minutes,
        total_break_minutes = EXCLUDED.total_break_minutes,
        exceptions = EXCLUDED.exceptions,
        updated_at = EXCLUDED.updated_at
    `);
  }

  async getRecord(tenantId: string, employeeId: string, workDate: string): Promise<AttendanceRecordState | null> {
    const rows = await queryRows<AttendanceRow>(this.db, sql`
      SELECT ${ATTENDANCE_COLUMNS} FROM attendance_records r
      WHERE r.tenant_id = ${tenantId}::uuid AND r.employee_id = ${employeeId}::uuid AND r.work_date = ${workDate}::date
      LIMIT 1
    `);
    return rows[0] ? toAttendance(rows[0]) : null;
  }

  async getRecordById(tenantId: string, id: string): Promise<AttendanceRecordState | null> {
    const rows = await queryRows<AttendanceRow>(this.db, sql`
      SELECT ${ATTENDANCE_COLUMNS} FROM attendance_records r
      WHERE r.tenant_id = ${tenantId}::uuid AND r.id = ${id}::uuid LIMIT 1
    `);
    return rows[0] ? toAttendance(rows[0]) : null;
  }

  async listRecords(tenantId: string, options: AttendanceRecordFilterOptions = {}): Promise<AttendanceRecordState[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const rows = await queryRows<AttendanceRow>(this.db, sql`
      SELECT ${ATTENDANCE_COLUMNS}
      FROM attendance_records r
      INNER JOIN employees e ON e.id = r.employee_id AND e.tenant_id = r.tenant_id
      WHERE r.tenant_id = ${tenantId}::uuid
        AND (${options.employeeId ?? null}::uuid IS NULL OR r.employee_id = ${options.employeeId ?? null}::uuid)
        AND (${options.branchId ?? null}::uuid IS NULL OR e.branch_id = ${options.branchId ?? null}::uuid)
        AND (${options.startDate ?? null}::date IS NULL OR r.work_date >= ${options.startDate ?? null}::date)
        AND (${options.endDate ?? null}::date IS NULL OR r.work_date <= ${options.endDate ?? null}::date)
      ORDER BY r.work_date DESC, r.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return rows.map(toAttendance);
  }

  async findIdempotency(tenantId: string, key: string): Promise<AttendanceIdempotencyRecord | null> {
    const rows = await queryRows<{
      tenant_id: string;
      idempotency_key: string;
      payload_hash: string;
      record_id: string;
      created_at: Date | string;
    }>(this.db, sql`
      SELECT tenant_id, idempotency_key, payload_hash, record_id, created_at
      FROM attendance_idempotency
      WHERE tenant_id = ${tenantId}::uuid AND idempotency_key = ${key}
      LIMIT 1
    `);
    const row = rows[0];
    return row ? {
      tenantId: row.tenant_id,
      key: row.idempotency_key,
      payloadHash: row.payload_hash,
      recordId: row.record_id,
      createdAt: new Date(row.created_at),
    } : null;
  }

  async saveIdempotency(record: AttendanceIdempotencyRecord): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO attendance_idempotency (tenant_id, idempotency_key, payload_hash, record_id, created_at)
      VALUES (${record.tenantId}::uuid, ${record.key}, ${record.payloadHash}, ${record.recordId}::uuid, ${record.createdAt})
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
    `);
  }
}

export class PostgresAttendanceCorrectionRepository implements AttendanceCorrectionRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateAttendanceCorrectionInput): Promise<AttendanceCorrection> {
    const id = crypto.randomUUID();
    const rows = await queryRows<CorrectionRow>(this.db, sql`
      INSERT INTO attendance_corrections (
        id, tenant_id, employee_id, requested_action, requested_at, reason, status
      ) VALUES (
        ${id}::uuid, ${input.tenantId}::uuid, ${input.employeeId}::uuid,
        ${input.requestedAction}, ${input.requestedAt}, ${input.reason}, 'pending'
      )
      RETURNING *
    `);
    return toCorrection(rows[0]!);
  }

  async findById(tenantId: string, id: string): Promise<AttendanceCorrection | null> {
    const rows = await queryRows<CorrectionRow>(this.db, sql`
      SELECT * FROM attendance_corrections WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid LIMIT 1
    `);
    return rows[0] ? toCorrection(rows[0]) : null;
  }

  async list(tenantId: string, options: AttendanceCorrectionFilterOptions = {}): Promise<AttendanceCorrection[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const rows = await queryRows<CorrectionRow>(this.db, sql`
      SELECT * FROM attendance_corrections
      WHERE tenant_id = ${tenantId}::uuid
        AND (${options.employeeId ?? null}::uuid IS NULL OR employee_id = ${options.employeeId ?? null}::uuid)
        AND (${options.status ?? null}::text IS NULL OR status = ${options.status ?? null})
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return rows.map(toCorrection);
  }

  async count(tenantId: string, options: AttendanceCorrectionFilterOptions = {}): Promise<number> {
    const rows = await queryRows<{ count: string | number }>(this.db, sql`
      SELECT count(*) AS count FROM attendance_corrections
      WHERE tenant_id = ${tenantId}::uuid
        AND (${options.employeeId ?? null}::uuid IS NULL OR employee_id = ${options.employeeId ?? null}::uuid)
        AND (${options.status ?? null}::text IS NULL OR status = ${options.status ?? null})
    `);
    return Number(rows[0]?.count ?? 0);
  }

  async review(
    tenantId: string,
    id: string,
    status: "approved" | "rejected",
    reviewedByUserId: string,
    reviewNotes?: string,
  ): Promise<AttendanceCorrection> {
    const rows = await queryRows<CorrectionRow>(this.db, sql`
      UPDATE attendance_corrections
      SET status = ${status}, reviewed_by_user_id = ${reviewedByUserId}::uuid,
          review_notes = ${reviewNotes ?? null}, updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND status = 'pending'
      RETURNING *
    `);
    if (!rows[0]) throw new AttendanceCorrectionNotFoundError(id);
    return toCorrection(rows[0]);
  }
}
