import { QueueId, TenantId, BranchId } from "../value-objects/identifiers.js";
import { Queue } from "../aggregates/queue.js";

export interface IQueueRepository {
  findById(tenantId: TenantId, queueId: QueueId): Promise<Queue | null>;
  findByTenant(tenantId: TenantId): Promise<Queue[]>;
  findByBranch(tenantId: TenantId, branchId: BranchId): Promise<Queue[]>;
  findActive(tenantId: TenantId): Promise<Queue[]>;
  save(queue: Queue): Promise<void>;
  delete(tenantId: TenantId, queueId: QueueId): Promise<void>;
}
