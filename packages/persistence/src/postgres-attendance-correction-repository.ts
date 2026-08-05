import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type {
  AttendanceCorrection,
  AttendanceCorrectionFilterOptions,
  AttendanceCorrectionRepository,
  RequestAttendanceCorrectionInput,
} from "@adminops/workforce-core";
import type { Database } from "./database.js";
import { attendanceCorrections } from "./schema.js";

type CorrectionRow = typeof attendanceCorrections.$inferSelect;

function toDomain(row: CorrectionRow): AttendanceCorrection {
  return {
    id: row.id,
    tenantId: row.tenantId,
    employeeId: row.employeeId,
    targetEventId: row.targetEventId ?? null,
    requestedEventType: row.requestedEventType as AttendanceCorrection["requestedEventType"],
    requestedTimestamp:
      row.requestedTimestamp instanceof Date
        ? row.requestedTimestamp.toISOString()
        : new Date(row.requestedTimestamp).toISOString(),
    reason: row.reason,
    status: row.status as AttendanceCorrection["status"],
    reviewedByUserId: row.reviewedByUserId ?? null,
    reviewNotes: row.reviewNotes ?? null,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
  };
}

export class PostgresAttendanceCorrectionRepository implements AttendanceCorrectionRepository {
  constructor(private readonly db: Database) {}

  public async create(input: RequestAttendanceCorrectionInput): Promise<AttendanceCorrection> {
    const now = new Date();
    const rows = await this.db
      .insert(attendanceCorrections)
      .values({
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        targetEventId: input.targetEventId ?? null,
        requestedEventType: input.requestedEventType,
        requestedTimestamp: new Date(input.requestedTimestamp),
        reason: input.reason,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const created = rows[0];
    if (!created) {
      throw new Error("Failed to insert attendance correction record");
    }

    return toDomain(created);
  }

  public async findById(tenantId: string, id: string): Promise<AttendanceCorrection | null> {
    const rows = await this.db
      .select()
      .from(attendanceCorrections)
      .where(and(eq(attendanceCorrections.id, id), eq(attendanceCorrections.tenantId, tenantId)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return toDomain(row);
  }

  public async list(
    tenantId: string,
    options?: AttendanceCorrectionFilterOptions,
  ): Promise<AttendanceCorrection[]> {
    const conditions: SQL[] = [eq(attendanceCorrections.tenantId, tenantId)];

    if (options?.employeeId) {
      conditions.push(eq(attendanceCorrections.employeeId, options.employeeId));
    }
    if (options?.status) {
      conditions.push(eq(attendanceCorrections.status, options.status));
    }

    const query = this.db
      .select()
      .from(attendanceCorrections)
      .where(and(...conditions))
      .orderBy(desc(attendanceCorrections.createdAt));

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;

    const rows = await query.limit(limit).offset(offset);
    return rows.map(toDomain);
  }

  public async count(
    tenantId: string,
    options?: AttendanceCorrectionFilterOptions,
  ): Promise<number> {
    const conditions: SQL[] = [eq(attendanceCorrections.tenantId, tenantId)];

    if (options?.employeeId) {
      conditions.push(eq(attendanceCorrections.employeeId, options.employeeId));
    }
    if (options?.status) {
      conditions.push(eq(attendanceCorrections.status, options.status));
    }

    const rows = await this.db
      .select({ val: count() })
      .from(attendanceCorrections)
      .where(and(...conditions));

    return Number(rows[0]?.val ?? 0);
  }

  public async updateStatus(
    tenantId: string,
    id: string,
    status: "approved" | "rejected",
    reviewedByUserId: string,
    reviewNotes?: string,
  ): Promise<AttendanceCorrection> {
    const now = new Date();
    const rows = await this.db
      .update(attendanceCorrections)
      .set({
        status,
        reviewedByUserId,
        reviewNotes: reviewNotes ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(attendanceCorrections.id, id),
          eq(attendanceCorrections.tenantId, tenantId),
          eq(attendanceCorrections.status, "pending"),
        ),
      )
      .returning();

    const updated = rows[0];
    if (!updated) {
      // Check if item exists to throw specific error
      const existing = await this.findById(tenantId, id);
      if (!existing) {
        throw new Error(`Attendance correction [${id}] not found`);
      }
      throw new Error(`Attendance correction [${id}] is already ${existing.status}`);
    }

    return toDomain(updated);
  }
}
