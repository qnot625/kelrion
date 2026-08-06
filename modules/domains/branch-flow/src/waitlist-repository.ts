import type { WaitlistEntry } from "./waitlist.js";

export interface WaitlistRepository {
  save(entry: WaitlistEntry): Promise<void>;
  findById(tenantId: string, id: string): Promise<WaitlistEntry | undefined>;
  listByTenant(tenantId: string): Promise<WaitlistEntry[]>;
  listQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry[]>;
  getNextInQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry | undefined>;
  getNextPosition(tenantId: string, branchId: string, serviceId: string): Promise<number>;
}
