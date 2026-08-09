import type { QueueConfiguration } from "./configuration.js";
import type { QueueEntry } from "./entry.js";
import type { QueueEventData } from "./types.js";

export interface QueueConfigurationRepository {
  findById(tenantId: string, id: string): Promise<QueueConfiguration | null>;
  findForQueue(tenantId: string, branchId: string, serviceId: string, departmentId?: string | null): Promise<QueueConfiguration | null>;
  listByTenant(tenantId: string): Promise<QueueConfiguration[]>;
  listByBranch(tenantId: string, branchId: string): Promise<QueueConfiguration[]>;
  save(configuration: QueueConfiguration): Promise<void>;
}
export interface QueueEntryRepository {
  findById(tenantId: string, id: string): Promise<QueueEntry | null>;
  findByPublicToken(tenantId: string, publicToken: string): Promise<QueueEntry | null>;
  findActiveByAppointment(tenantId: string, appointmentId: string): Promise<QueueEntry | null>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<QueueEntry | null>;
  listForQueue(tenantId: string, branchId: string, serviceId: string): Promise<QueueEntry[]>;
  listByBranch(tenantId: string, branchId: string): Promise<QueueEntry[]>;
  save(entry: QueueEntry): Promise<void>;
  nextTicketNumber(tenantId: string, branchId: string, serviceId: string, prefix: string, businessDate: string): Promise<string>;
}
export interface QueueEventRepository {
  append(event: Omit<QueueEventData, "sequence">): Promise<QueueEventData>;
  listAfter(tenantId: string, afterSequence: number, options?: { branchId?: string; serviceId?: string; limit?: number }): Promise<QueueEventData[]>;
  listForEntry(tenantId: string, entryId: string): Promise<QueueEventData[]>;
}
