import type { WaitlistEntry } from "./waitlist.js";
import type { WaitlistRepository } from "./waitlist-repository.js";

export class InMemoryWaitlistRepository implements WaitlistRepository {
  private readonly byId = new Map<string, WaitlistEntry>();

  async save(entry: WaitlistEntry): Promise<void> {
    this.byId.set(entry.id, entry);
  }

  async findById(tenantId: string, id: string): Promise<WaitlistEntry | undefined> {
    const entry = this.byId.get(id);
    return entry && entry.tenantId === tenantId ? entry : undefined;
  }

  async listByTenant(tenantId: string): Promise<WaitlistEntry[]> {
    return [...this.byId.values()]
      .filter((entry) => entry.tenantId === tenantId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry[]> {
    return [...this.byId.values()]
      .filter((entry) =>
        entry.tenantId === tenantId &&
        entry.branchId === branchId &&
        entry.serviceId === serviceId &&
        entry.status === "waiting")
      .sort((a, b) => a.queuePosition - b.queuePosition || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getNextInQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry | undefined> {
    return (await this.listQueue(tenantId, branchId, serviceId))[0];
  }

  async getNextPosition(tenantId: string, branchId: string, serviceId: string): Promise<number> {
    const queue = await this.listQueue(tenantId, branchId, serviceId);
    return queue.length ? Math.max(...queue.map((entry) => entry.queuePosition)) + 1 : 1;
  }
}
