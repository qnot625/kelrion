import { randomUUID } from "node:crypto";
import type {
  AttendanceCorrection,
  AttendanceCorrectionFilterOptions,
  AttendanceCorrectionRepository,
  RequestAttendanceCorrectionInput,
} from "./contracts.js";

export class InMemoryAttendanceCorrectionRepository implements AttendanceCorrectionRepository {
  private corrections = new Map<string, AttendanceCorrection>();

  public async create(input: RequestAttendanceCorrectionInput): Promise<AttendanceCorrection> {
    const now = new Date().toISOString();
    const correction: AttendanceCorrection = {
      id: randomUUID(),
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      targetEventId: input.targetEventId ?? null,
      requestedEventType: input.requestedEventType,
      requestedTimestamp: input.requestedTimestamp,
      reason: input.reason,
      status: "pending",
      reviewedByUserId: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
    };
    this.corrections.set(correction.id, correction);
    return correction;
  }

  public async findById(tenantId: string, id: string): Promise<AttendanceCorrection | null> {
    const item = this.corrections.get(id);
    if (!item || item.tenantId !== tenantId) {
      return null;
    }
    return item;
  }

  public async list(
    tenantId: string,
    options?: AttendanceCorrectionFilterOptions,
  ): Promise<AttendanceCorrection[]> {
    const result: AttendanceCorrection[] = [];

    for (const item of this.corrections.values()) {
      if (item.tenantId !== tenantId) {
        continue;
      }
      if (options?.employeeId && item.employeeId !== options.employeeId) {
        continue;
      }
      if (options?.status && item.status !== options.status) {
        continue;
      }
      result.push(item);
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    return result.slice(offset, offset + limit);
  }

  public async count(
    tenantId: string,
    options?: AttendanceCorrectionFilterOptions,
  ): Promise<number> {
    const list = await this.list(tenantId, { ...options, offset: 0, limit: Number.MAX_SAFE_INTEGER });
    return list.length;
  }

  public async updateStatus(
    tenantId: string,
    id: string,
    status: "approved" | "rejected",
    reviewedByUserId: string,
    reviewNotes?: string,
  ): Promise<AttendanceCorrection> {
    const item = await this.findById(tenantId, id);
    if (!item) {
      throw new Error(`Attendance correction [${id}] not found`);
    }
    if (item.status !== "pending") {
      throw new Error(`Attendance correction [${id}] is already ${item.status}`);
    }

    const updated: AttendanceCorrection = {
      ...item,
      status,
      reviewedByUserId,
      reviewNotes: reviewNotes ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.corrections.set(id, updated);
    return updated;
  }
}
