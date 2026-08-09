import type { QueueConfigurationRepository, QueueEntryRepository, QueueEventRepository } from "./repositories.js";
import type { QueueConfiguration } from "./configuration.js";
import type { QueueEntry } from "./entry.js";
import type { QueueEventData } from "./types.js";

export class InMemoryQueueConfigurationRepository implements QueueConfigurationRepository {
  private readonly items = new Map<string, QueueConfiguration>();
  async findById(tenantId: string, id: string) { const item = this.items.get(`${tenantId}:${id}`); return item?.tenantId === tenantId ? item.clone() : null; }
  async findForQueue(tenantId: string, branchId: string, serviceId: string, departmentId?: string | null) {
    const candidates = [...this.items.values()].filter((item) => item.tenantId === tenantId && item.branchId === branchId && item.serviceId === serviceId);
    const exact = departmentId ? candidates.find((item) => item.departmentId === departmentId) : undefined;
    return (exact ?? candidates.find((item) => item.departmentId === null))?.clone() ?? null;
  }
  async listByTenant(tenantId: string) { return [...this.items.values()].filter((item) => item.tenantId === tenantId).sort((a,b) => b.updatedAt.getTime()-a.updatedAt.getTime()).map((item) => item.clone()); }
  async listByBranch(tenantId: string, branchId: string) { return [...this.items.values()].filter((item) => item.tenantId === tenantId && item.branchId === branchId).sort((a,b) => b.updatedAt.getTime()-a.updatedAt.getTime()).map((item) => item.clone()); }
  async save(item: QueueConfiguration) { this.items.set(`${item.tenantId}:${item.id}`, item.clone()); }
}
export class InMemoryQueueEntryRepository implements QueueEntryRepository {
  private readonly items = new Map<string, QueueEntry>();
  private readonly sequences = new Map<string, number>();
  async findById(tenantId: string, id: string) { const item = this.items.get(`${tenantId}:${id}`); return item?.tenantId === tenantId ? item.clone() : null; }
  async findByPublicToken(tenantId: string, publicToken: string) { return [...this.items.values()].find((item) => item.tenantId === tenantId && item.publicToken === publicToken)?.clone() ?? null; }
  async findActiveByAppointment(tenantId: string, appointmentId: string) { return [...this.items.values()].find((item) => item.tenantId === tenantId && item.appointmentId === appointmentId && !item.isTerminal)?.clone() ?? null; }
  async findByIdempotencyKey(tenantId: string, key: string) { return [...this.items.values()].find((item) => item.tenantId === tenantId && item.idempotencyKey === key)?.clone() ?? null; }
  async listForQueue(tenantId: string, branchId: string, serviceId: string) { return this.sorted([...this.items.values()].filter((item) => item.tenantId === tenantId && item.branchId === branchId && item.serviceId === serviceId)); }
  async listByBranch(tenantId: string, branchId: string) { return this.sorted([...this.items.values()].filter((item) => item.tenantId === tenantId && item.branchId === branchId)); }
  async save(item: QueueEntry) { this.items.set(`${item.tenantId}:${item.id}`, item.clone()); }
  async nextTicketNumber(tenantId: string, branchId: string, serviceId: string, prefix: string, businessDate: string) { const key = `${tenantId}:${branchId}:${serviceId}:${businessDate}`; const next=(this.sequences.get(key)??0)+1; this.sequences.set(key,next); return `${prefix}${String(next).padStart(3,"0")}`; }
  private sorted(values: QueueEntry[]) { return values.sort((a,b) => b.priorityScore-a.priorityScore || a.checkedInAt.getTime()-b.checkedInAt.getTime()).map((item) => item.clone()); }
}
export class InMemoryQueueEventRepository implements QueueEventRepository {
  private readonly events: QueueEventData[] = [];
  private readonly sequences = new Map<string, number>();
  async append(value: Omit<QueueEventData,"sequence">) { const sequence=(this.sequences.get(value.tenantId)??0)+1; this.sequences.set(value.tenantId,sequence); const event={...structuredClone(value),sequence,createdAt:new Date(value.createdAt)}; this.events.push(event); return structuredClone(event); }
  async listAfter(tenantId: string, afterSequence: number, options?: { branchId?: string; serviceId?: string; limit?: number }) { return this.events.filter((event)=>event.tenantId===tenantId && event.sequence>afterSequence && (!options?.branchId || event.branchId===options.branchId) && (!options?.serviceId || event.serviceId===options.serviceId)).sort((a,b)=>a.sequence-b.sequence).slice(0,Math.min(Math.max(options?.limit??200,1),1000)).map((event)=>structuredClone(event)); }
  async listForEntry(tenantId: string, entryId: string) { return this.events.filter((event)=>event.tenantId===tenantId && event.entryId===entryId).sort((a,b)=>a.sequence-b.sequence).map((event)=>structuredClone(event)); }
}
