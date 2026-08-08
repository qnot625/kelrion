import { randomUUID } from "node:crypto";
import type { AuditLog } from "@adminops/audit";
import { ServiceDeskCatalogItem } from "./catalog-item.js";
import { ServiceDeskCatalogItemNotFoundError, ServiceDeskValidationError } from "./errors.js";
import type { ServiceDeskCatalogRepository } from "./repositories.js";
import type { ServiceDeskCatalogItemData } from "./types.js";

export class ServiceDeskCatalogService {
  constructor(private readonly repository: ServiceDeskCatalogRepository, private readonly auditLog?: AuditLog) {}

  async create(input: {
    tenantId: string;
    actorUserId: string;
    id?: string;
    key: string;
    name: string;
    description?: string;
    intakeMode?: ServiceDeskCatalogItemData["intakeMode"];
    formDefinitionId?: string | null;
    workflowDefinitionId?: string | null;
    approvalPolicyId?: string | null;
    defaultTicketType?: ServiceDeskCatalogItemData["defaultTicketType"];
    defaultPriority?: ServiceDeskCatalogItemData["defaultPriority"];
    categoryKey?: string | null;
    assignmentGroupId?: string | null;
    tags?: readonly string[];
  }) {
    const id = input.id?.trim() || randomUUID();
    if (await this.repository.findById(input.tenantId, id)) throw new ServiceDeskValidationError(`Catalogue item '${id}' already exists`);
    if (await this.repository.findByKey(input.tenantId, input.key)) throw new ServiceDeskValidationError(`Catalogue key '${input.key}' already exists`);
    let item: ServiceDeskCatalogItem;
    try { item = ServiceDeskCatalogItem.create({ ...input, id }); }
    catch (error) { throw this.validation(error); }
    await this.repository.save(item);
    await this.audit("service_desk.catalog_created", item, input.actorUserId);
    return item;
  }

  async update(input: { tenantId: string; id: string; actorUserId: string } & Partial<Pick<ServiceDeskCatalogItemData,
    "key" | "name" | "description" | "intakeMode" | "formDefinitionId" | "workflowDefinitionId" | "approvalPolicyId" | "defaultTicketType" | "defaultPriority" | "categoryKey" | "assignmentGroupId" | "tags"
  >>) {
    const item = await this.require(input.tenantId, input.id);
    if (input.key && input.key.trim().toLowerCase() !== item.key) {
      const duplicate = await this.repository.findByKey(input.tenantId, input.key);
      if (duplicate && duplicate.id !== item.id) throw new ServiceDeskValidationError(`Catalogue key '${input.key}' already exists`);
    }
    try { item.prepareDraftRevision(); item.updateDraft(input); }
    catch (error) { throw this.validation(error); }
    await this.repository.save(item);
    await this.audit("service_desk.catalog_updated", item, input.actorUserId);
    return item;
  }

  async publish(tenantId: string, id: string, actorUserId: string) {
    const item = await this.require(tenantId, id);
    try { item.publish(); } catch (error) { throw this.validation(error); }
    await this.repository.save(item);
    await this.repository.savePublishedVersion(item);
    await this.audit("service_desk.catalog_published", item, actorUserId);
    return item;
  }

  async archive(tenantId: string, id: string, actorUserId: string) {
    const item = await this.require(tenantId, id);
    item.archive();
    await this.repository.save(item);
    await this.audit("service_desk.catalog_archived", item, actorUserId);
    return item;
  }

  list(tenantId: string) { return this.repository.listByTenant(tenantId); }
  async listPublished(tenantId: string) {
    const current = await this.repository.listByTenant(tenantId);
    const result: ServiceDeskCatalogItem[] = [];
    for (const item of current) {
      if (item.status === "ARCHIVED") continue;
      const published = await this.repository.findLatestPublishedVersion(tenantId, item.id);
      if (published) result.push(published);
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }
  get(tenantId: string, id: string) { return this.require(tenantId, id); }
  async getPublished(tenantId: string, id: string, version?: number) {
    const current = await this.require(tenantId, id);
    if (current.status === "ARCHIVED") throw new ServiceDeskCatalogItemNotFoundError(id);
    const item = version === undefined ? await this.repository.findLatestPublishedVersion(tenantId, id) : await this.repository.findPublishedVersion(tenantId, id, version);
    if (!item) throw new ServiceDeskCatalogItemNotFoundError(id);
    return item;
  }
  async listVersions(tenantId: string, id: string) { await this.require(tenantId, id); return this.repository.listPublishedVersions(tenantId, id); }

  private async require(tenantId: string, id: string) {
    const item = await this.repository.findById(tenantId, id);
    if (!item) throw new ServiceDeskCatalogItemNotFoundError(id);
    return item;
  }
  private validation(error: unknown) { return new ServiceDeskValidationError(error instanceof Error ? error.message : "Invalid Service Desk catalogue item"); }
  private async audit(action: string, item: ServiceDeskCatalogItem, actorUserId: string) {
    if (!this.auditLog) return;
    await this.auditLog.record({ tenantId: item.tenantId, actorUserId, action, targetType: "service_desk_catalog_item", targetId: item.id, metadata: { key: item.key, version: item.version, status: item.status } });
  }
}
