import {
  AttendanceDomainError,
  AttendanceRecord,
} from "./attendance.js";
import {
  type AttendanceSyncBatchRequest,
  type AttendanceSyncBatchResponse,
  type AttendanceSyncItem,
  AttendanceSyncBatchRequestSchema,
  type SyncItemResult,
  type SyncItemStatus,
} from "./contracts.js";

export interface IdempotencyRegistryEntry {
  tenantId: string;
  idempotencyKey: string;
  employeeId: string;
  eventType: string;
  processedAt: string;
  recordId: string;
  resultStatus: SyncItemStatus;
}

export interface IdempotencyRegistryStore {
  has(tenantId: string, idempotencyKey: string): Promise<boolean>;
  get(tenantId: string, idempotencyKey: string): Promise<IdempotencyRegistryEntry | null>;
  save(entry: IdempotencyRegistryEntry): Promise<void>;
  clear(): void;
}

export class InMemoryIdempotencyRegistry implements IdempotencyRegistryStore {
  private entries = new Map<string, IdempotencyRegistryEntry>();

  private makeKey(tenantId: string, idempotencyKey: string): string {
    return `${tenantId}:${idempotencyKey}`;
  }

  public async has(tenantId: string, idempotencyKey: string): Promise<boolean> {
    return this.entries.has(this.makeKey(tenantId, idempotencyKey));
  }

  public async get(tenantId: string, idempotencyKey: string): Promise<IdempotencyRegistryEntry | null> {
    return this.entries.get(this.makeKey(tenantId, idempotencyKey)) ?? null;
  }

  public async save(entry: IdempotencyRegistryEntry): Promise<void> {
    this.entries.set(this.makeKey(entry.tenantId, entry.idempotencyKey), { ...entry });
  }

  public clear(): void {
    this.entries.clear();
  }
}

export interface AttendanceRecordStore {
  getRecord(tenantId: string, employeeId: string, workDate: string): Promise<AttendanceRecord | null>;
  saveRecord(record: AttendanceRecord): Promise<void>;
}

export class InMemoryAttendanceRecordStore implements AttendanceRecordStore {
  private records = new Map<string, AttendanceRecord>();

  private makeKey(tenantId: string, employeeId: string, workDate: string): string {
    return `${tenantId}:${employeeId}:${workDate}`;
  }

  public async getRecord(tenantId: string, employeeId: string, workDate: string): Promise<AttendanceRecord | null> {
    return this.records.get(this.makeKey(tenantId, employeeId, workDate)) ?? null;
  }

  public async saveRecord(record: AttendanceRecord): Promise<void> {
    this.records.set(this.makeKey(record.tenantId, record.employeeId, record.workDate), record);
  }

  public clear(): void {
    this.records.clear();
  }
}

export interface AttendanceSyncEngineOptions {
  idempotencyRegistry?: IdempotencyRegistryStore;
  recordStore?: AttendanceRecordStore;
  clockDriftThresholdMs?: number; // Default 15 minutes = 900,000ms
}

const EVENT_PRIORITY: Record<string, number> = {
  clock_in: 1,
  break_start: 2,
  break_end: 3,
  clock_out: 4,
};

export class AttendanceSyncEngine {
  private idempotencyRegistry: IdempotencyRegistryStore;
  private recordStore: AttendanceRecordStore;
  private clockDriftThresholdMs: number;

  constructor(options?: AttendanceSyncEngineOptions) {
    this.idempotencyRegistry = options?.idempotencyRegistry ?? new InMemoryIdempotencyRegistry();
    this.recordStore = options?.recordStore ?? new InMemoryAttendanceRecordStore();
    this.clockDriftThresholdMs = options?.clockDriftThresholdMs ?? 15 * 60 * 1000; // 15 mins
  }

  /**
   * Process a batch of attendance synchronization items idempotently.
   */
  public async processBatch(
    rawRequest: AttendanceSyncBatchRequest,
    options?: { now?: Date }
  ): Promise<AttendanceSyncBatchResponse> {
    const parseResult = AttendanceSyncBatchRequestSchema.safeParse(rawRequest);
    if (!parseResult.success) {
      throw new AttendanceDomainError(`Invalid sync batch request payload: ${parseResult.error.message}`);
    }

    const request = parseResult.data;
    const serverNow = options?.now ?? new Date();
    const serverNowMs = serverNow.getTime();
    const processedAt = serverNow.toISOString();

    const results: SyncItemResult[] = [];
    const validItemsToProcess: AttendanceSyncItem[] = [];

    let processedCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;

    // 1. First pass: Tenant validation, clock drift validation, idempotency checks
    for (const item of request.events) {
      // Tenant Isolation check
      if (item.tenantId !== request.tenantId) {
        rejectedCount++;
        results.push({
          eventId: item.eventId,
          idempotencyKey: item.idempotencyKey,
          status: "REJECTED_TENANT_MISMATCH",
          message: `Event tenantId (${item.tenantId}) does not match batch tenantId (${request.tenantId})`,
        });
        continue;
      }

      // Future Timestamp Clock Drift check
      const eventMs = new Date(item.timestamp).getTime();
      if (isNaN(eventMs)) {
        rejectedCount++;
        results.push({
          eventId: item.eventId,
          idempotencyKey: item.idempotencyKey,
          status: "REJECTED_INVALID_STATE",
          message: `Invalid ISO 8601 timestamp: ${item.timestamp}`,
        });
        continue;
      }

      if (eventMs > serverNowMs + this.clockDriftThresholdMs) {
        rejectedCount++;
        results.push({
          eventId: item.eventId,
          idempotencyKey: item.idempotencyKey,
          status: "REJECTED_FUTURE_TIMESTAMP",
          message: `Timestamp is in the future beyond threshold (${this.clockDriftThresholdMs / 60000} mins)`,
        });
        continue;
      }

      // Idempotency check against registry
      const existingEntry = await this.idempotencyRegistry.get(item.tenantId, item.idempotencyKey);
      if (existingEntry) {
        if (existingEntry.employeeId === item.employeeId && existingEntry.eventType === item.eventType) {
          duplicateCount++;
          results.push({
            eventId: item.eventId,
            idempotencyKey: item.idempotencyKey,
            status: "PROCESSED_DUPLICATE",
            message: "Event already processed idempotently",
            recordId: existingEntry.recordId,
          });
        } else {
          rejectedCount++;
          results.push({
            eventId: item.eventId,
            idempotencyKey: item.idempotencyKey,
            status: "REJECTED_PAYLOAD_MISMATCH",
            message: "Conflicting payload for existing idempotency key",
          });
        }
        continue;
      }

      validItemsToProcess.push(item);
    }

    // 2. Chronological Sorting & Sequence Reordering
    // Group valid items by employeeId + workDate
    const groupedByEmployeeAndDate = new Map<string, AttendanceSyncItem[]>();
    for (const item of validItemsToProcess) {
      const groupKey = `${item.employeeId}:${item.workDate}`;
      const group = groupedByEmployeeAndDate.get(groupKey) ?? [];
      group.push(item);
      groupedByEmployeeAndDate.set(groupKey, group);
    }

    // Sort each group chronologically ascending
    for (const items of groupedByEmployeeAndDate.values()) {
      items.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (timeA !== timeB) {
          return timeA - timeB;
        }
        const prioA = EVENT_PRIORITY[a.eventType] ?? 99;
        const prioB = EVENT_PRIORITY[b.eventType] ?? 99;
        return prioA - prioB;
      });
    }

    // 3. Sequential Aggregate Replay
    for (const items of groupedByEmployeeAndDate.values()) {
      for (const item of items) {
        let record = await this.recordStore.getRecord(item.tenantId, item.employeeId, item.workDate);
        if (!record) {
          record = AttendanceRecord.create({
            tenantId: item.tenantId,
            employeeId: item.employeeId,
            workDate: item.workDate,
          });
        }

        try {
          const opts = {
            source: item.source,
            location: item.location ?? null,
            notes: item.notes ?? undefined,
            idempotencyKey: item.idempotencyKey,
          };

          switch (item.eventType) {
            case "clock_in":
              record.clockIn(item.timestamp, opts);
              break;
            case "break_start":
              record.startBreak(item.timestamp, opts);
              break;
            case "break_end":
              record.endBreak(item.timestamp, opts);
              break;
            case "clock_out":
              record.clockOut(item.timestamp, opts);
              break;
            default:
              throw new AttendanceDomainError(`Unsupported event type: ${item.eventType}`);
          }

          await this.recordStore.saveRecord(record);

          const registryEntry: IdempotencyRegistryEntry = {
            tenantId: item.tenantId,
            idempotencyKey: item.idempotencyKey,
            employeeId: item.employeeId,
            eventType: item.eventType,
            processedAt,
            recordId: record.id,
            resultStatus: "PROCESSED_SUCCESS",
          };

          await this.idempotencyRegistry.save(registryEntry);

          processedCount++;
          results.push({
            eventId: item.eventId,
            idempotencyKey: item.idempotencyKey,
            status: "PROCESSED_SUCCESS",
            recordId: record.id,
          });
        } catch (err) {
          rejectedCount++;
          const message = err instanceof Error ? err.message : "Failed to process attendance event";
          results.push({
            eventId: item.eventId,
            idempotencyKey: item.idempotencyKey,
            status: "REJECTED_INVALID_STATE",
            message,
            recordId: record.id,
          });
        }
      }
    }

    return {
      batchId: request.batchId,
      tenantId: request.tenantId,
      processedAt,
      totalReceived: request.events.length,
      processedCount,
      duplicateCount,
      rejectedCount,
      results,
    };
  }
}
