import type { ServiceDeskCatalogItem } from "./catalog-item.js";
import type { ServiceDeskSlaPolicy } from "./sla-policy.js";
import type { ServiceDeskTicket } from "./ticket.js";
import type { ServiceDeskTicketStatus } from "./types.js";

export interface ServiceDeskCatalogRepository {
  findById(tenantId: string, id: string): Promise<ServiceDeskCatalogItem | null>;
  findByKey(tenantId: string, key: string): Promise<ServiceDeskCatalogItem | null>;
  listByTenant(tenantId: string): Promise<ServiceDeskCatalogItem[]>;
  findPublishedVersion(tenantId: string, id: string, version: number): Promise<ServiceDeskCatalogItem | null>;
  findLatestPublishedVersion(tenantId: string, id: string): Promise<ServiceDeskCatalogItem | null>;
  listPublishedVersions(tenantId: string, id: string): Promise<ServiceDeskCatalogItem[]>;
  save(item: ServiceDeskCatalogItem): Promise<void>;
  savePublishedVersion(item: ServiceDeskCatalogItem): Promise<void>;
}

export interface ServiceDeskTicketRepository {
  findById(tenantId: string, id: string): Promise<ServiceDeskTicket | null>;
  findByReference(tenantId: string, reference: string): Promise<ServiceDeskTicket | null>;
  listByTenant(tenantId: string, status?: ServiceDeskTicketStatus): Promise<ServiceDeskTicket[]>;
  listByRequester(tenantId: string, userId: string): Promise<ServiceDeskTicket[]>;
  listByAssignee(tenantId: string, userId: string): Promise<ServiceDeskTicket[]>;
  save(ticket: ServiceDeskTicket): Promise<void>;
}

export interface ServiceDeskSlaPolicyRepository {
  findById(tenantId: string, id: string): Promise<ServiceDeskSlaPolicy | null>;
  listByTenant(tenantId: string): Promise<ServiceDeskSlaPolicy[]>;
  save(policy: ServiceDeskSlaPolicy): Promise<void>;
  delete(tenantId: string, id: string): Promise<void>;
}
