import type { ServiceDeskCatalogRepository, ServiceDeskSlaPolicyRepository, ServiceDeskTicketRepository } from "./repositories.js";
import type { ServiceDeskCatalogItem } from "./catalog-item.js";
import type { ServiceDeskSlaPolicy } from "./sla-policy.js";
import type { ServiceDeskTicket } from "./ticket.js";
import type { ServiceDeskTicketStatus } from "./types.js";

export class InMemoryServiceDeskCatalogRepository implements ServiceDeskCatalogRepository {
  private readonly current = new Map<string, ServiceDeskCatalogItem>();
  private readonly versions = new Map<string, ServiceDeskCatalogItem>();

  async findById(tenantId: string, id: string) { return this.current.get(this.key(tenantId, id))?.clone() ?? null; }
  async findByKey(tenantId: string, key: string) {
    const normalized = key.trim().toLowerCase();
    return [...this.current.values()].find((item) => item.tenantId === tenantId && item.key === normalized)?.clone() ?? null;
  }
  async listByTenant(tenantId: string) { return [...this.current.values()].filter((item) => item.tenantId === tenantId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.clone()); }
  async findPublishedVersion(tenantId: string, id: string, version: number) { return this.versions.get(this.versionKey(tenantId, id, version))?.clone() ?? null; }
  async findLatestPublishedVersion(tenantId: string, id: string) { return (await this.listPublishedVersions(tenantId, id))[0] ?? null; }
  async listPublishedVersions(tenantId: string, id: string) { return [...this.versions.values()].filter((item) => item.tenantId === tenantId && item.id === id).sort((a, b) => b.version - a.version).map((item) => item.clone()); }
  async save(item: ServiceDeskCatalogItem) { this.current.set(this.key(item.tenantId, item.id), item.clone()); }
  async savePublishedVersion(item: ServiceDeskCatalogItem) {
    if (item.status !== "PUBLISHED") throw new Error("Only published catalogue items can be version snapshots");
    this.versions.set(this.versionKey(item.tenantId, item.id, item.version), item.clone());
  }
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private versionKey(tenantId: string, id: string, version: number) { return `${tenantId}:${id}:${version}`; }
}

export class InMemoryServiceDeskTicketRepository implements ServiceDeskTicketRepository {
  private readonly items = new Map<string, ServiceDeskTicket>();

  async findById(tenantId: string, id: string) {
    const item = this.items.get(this.key(tenantId, id));
    return item?.tenantId === tenantId ? item.clone() : null;
  }

  async findByReference(tenantId: string, reference: string) {
    const normalized = reference.trim().toUpperCase();
    const item = [...this.items.values()].find((ticket) => ticket.tenantId === tenantId && ticket.reference.toUpperCase() === normalized);
    return item?.clone() ?? null;
  }

  async listByTenant(tenantId: string, status?: ServiceDeskTicketStatus) {
    return this.list((item) => item.tenantId === tenantId && (!status || item.status === status));
  }

  async listByRequester(tenantId: string, userId: string) {
    return this.list((item) => item.tenantId === tenantId && item.isRequester(userId));
  }

  async listByAssignee(tenantId: string, userId: string) {
    return this.list((item) => item.tenantId === tenantId && item.assigneeUserId === userId);
  }

  async save(ticket: ServiceDeskTicket) {
    this.items.set(this.key(ticket.tenantId, ticket.id), ticket.clone());
  }

  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private list(predicate: (item: ServiceDeskTicket) => boolean) {
    return [...this.items.values()].filter(predicate).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.clone());
  }
}

export class InMemoryServiceDeskSlaPolicyRepository implements ServiceDeskSlaPolicyRepository {
  private readonly items = new Map<string, ServiceDeskSlaPolicy>();

  async findById(tenantId: string, id: string) {
    const item = this.items.get(this.key(tenantId, id));
    return item?.tenantId === tenantId ? item.clone() : null;
  }

  async listByTenant(tenantId: string) {
    return [...this.items.values()].filter((item) => item.tenantId === tenantId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.clone());
  }

  async save(policy: ServiceDeskSlaPolicy) {
    this.items.set(this.key(policy.tenantId, policy.id), policy.clone());
  }

  async delete(tenantId: string, id: string) {
    this.items.delete(this.key(tenantId, id));
  }

  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
}
