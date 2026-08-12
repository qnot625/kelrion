import { and, desc, eq } from "drizzle-orm";
import {
  ServiceDeskCatalogItem,
  type ServiceDeskCatalogItemData,
  type ServiceDeskCatalogRepository,
  type ServiceDeskIntakeMode,
  type ServiceDeskPriority,
  type ServiceDeskTicketType,
} from "../../index.js";
import type { Database } from "@adminops/persistence";
import { catalogItems, catalogVersions } from "./schema.js";

type CurrentRow = typeof catalogItems.$inferSelect;
type VersionRow = typeof catalogVersions.$inferSelect;

function current(row: CurrentRow): ServiceDeskCatalogItem {
  return new ServiceDeskCatalogItem({
    id: row.id,
    tenantId: row.tenantId,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status as ServiceDeskCatalogItemData["status"],
    version: row.currentVersion,
    intakeMode: row.intakeMode as ServiceDeskIntakeMode,
    formDefinitionId: row.formDefinitionId,
    workflowDefinitionId: row.workflowDefinitionId,
    approvalPolicyId: row.approvalPolicyId,
    defaultTicketType: row.defaultTicketType as ServiceDeskTicketType,
    defaultPriority: row.defaultPriority as ServiceDeskPriority,
    categoryKey: row.categoryKey,
    assignmentGroupId: row.assignmentGroupId,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
  });
}

function published(row: VersionRow): ServiceDeskCatalogItem {
  return new ServiceDeskCatalogItem({
    id: row.catalogItemId,
    tenantId: row.tenantId,
    key: row.key,
    name: row.name,
    description: row.description,
    status: "PUBLISHED",
    version: row.version,
    intakeMode: row.intakeMode as ServiceDeskIntakeMode,
    formDefinitionId: row.formDefinitionId,
    workflowDefinitionId: row.workflowDefinitionId,
    approvalPolicyId: row.approvalPolicyId,
    defaultTicketType: row.defaultTicketType as ServiceDeskTicketType,
    defaultPriority: row.defaultPriority as ServiceDeskPriority,
    categoryKey: row.categoryKey,
    assignmentGroupId: row.assignmentGroupId,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.publishedAt,
    publishedAt: row.publishedAt,
    archivedAt: null,
  });
}

export class PostgresServiceDeskCatalogRepository implements ServiceDeskCatalogRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(catalogItems).where(and(eq(catalogItems.tenantId, tenantId), eq(catalogItems.id, id))).limit(1);
    return row ? current(row) : null;
  }

  async findByKey(tenantId: string, key: string) {
    const [row] = await this.db.select().from(catalogItems).where(and(eq(catalogItems.tenantId, tenantId), eq(catalogItems.key, key.trim().toLowerCase()))).limit(1);
    return row ? current(row) : null;
  }

  async listByTenant(tenantId: string) {
    return (await this.db.select().from(catalogItems).where(eq(catalogItems.tenantId, tenantId)).orderBy(desc(catalogItems.updatedAt))).map(current);
  }

  async findPublishedVersion(tenantId: string, id: string, version: number) {
    const [row] = await this.db.select().from(catalogVersions).where(and(eq(catalogVersions.tenantId, tenantId), eq(catalogVersions.catalogItemId, id), eq(catalogVersions.version, version))).limit(1);
    return row ? published(row) : null;
  }

  async findLatestPublishedVersion(tenantId: string, id: string) {
    const [row] = await this.db.select().from(catalogVersions).where(and(eq(catalogVersions.tenantId, tenantId), eq(catalogVersions.catalogItemId, id))).orderBy(desc(catalogVersions.version)).limit(1);
    return row ? published(row) : null;
  }

  async listPublishedVersions(tenantId: string, id: string) {
    return (await this.db.select().from(catalogVersions).where(and(eq(catalogVersions.tenantId, tenantId), eq(catalogVersions.catalogItemId, id))).orderBy(desc(catalogVersions.version))).map(published);
  }

  async save(item: ServiceDeskCatalogItem) {
    const data = item.toPersistence();
    await this.db.insert(catalogItems).values({
      id: data.id,
      tenantId: data.tenantId,
      key: data.key,
      name: data.name,
      description: data.description,
      status: data.status,
      currentVersion: data.version,
      intakeMode: data.intakeMode,
      formDefinitionId: data.formDefinitionId,
      workflowDefinitionId: data.workflowDefinitionId,
      approvalPolicyId: data.approvalPolicyId,
      defaultTicketType: data.defaultTicketType,
      defaultPriority: data.defaultPriority,
      categoryKey: data.categoryKey,
      assignmentGroupId: data.assignmentGroupId,
      tags: [...data.tags],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      publishedAt: data.publishedAt,
      archivedAt: data.archivedAt,
    }).onConflictDoUpdate({
      target: catalogItems.id,
      set: {
        key: data.key,
        name: data.name,
        description: data.description,
        status: data.status,
        currentVersion: data.version,
        intakeMode: data.intakeMode,
        formDefinitionId: data.formDefinitionId,
        workflowDefinitionId: data.workflowDefinitionId,
        approvalPolicyId: data.approvalPolicyId,
        defaultTicketType: data.defaultTicketType,
        defaultPriority: data.defaultPriority,
        categoryKey: data.categoryKey,
        assignmentGroupId: data.assignmentGroupId,
        tags: [...data.tags],
        updatedAt: data.updatedAt,
        publishedAt: data.publishedAt,
        archivedAt: data.archivedAt,
      },
    });
  }

  async savePublishedVersion(item: ServiceDeskCatalogItem) {
    const data = item.toPersistence();
    if (data.status !== "PUBLISHED" || !data.publishedAt) throw new Error("Published catalogue item snapshot required");
    await this.db.insert(catalogVersions).values({
      tenantId: data.tenantId,
      catalogItemId: data.id,
      version: data.version,
      key: data.key,
      name: data.name,
      description: data.description,
      intakeMode: data.intakeMode,
      formDefinitionId: data.formDefinitionId,
      workflowDefinitionId: data.workflowDefinitionId,
      approvalPolicyId: data.approvalPolicyId,
      defaultTicketType: data.defaultTicketType,
      defaultPriority: data.defaultPriority,
      categoryKey: data.categoryKey,
      assignmentGroupId: data.assignmentGroupId,
      tags: [...data.tags],
      publishedAt: data.publishedAt,
      createdAt: data.createdAt,
    }).onConflictDoNothing();
  }
}
