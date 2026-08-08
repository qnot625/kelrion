import type { ServiceDeskCatalogItemData, ServiceDeskIntakeMode, ServiceDeskPriority, ServiceDeskTicketType } from "./types.js";

function clone<T>(value: T): T { return structuredClone(value); }
function tags(values: readonly string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }

export class ServiceDeskCatalogItem {
  private data: ServiceDeskCatalogItemData;

  constructor(data: ServiceDeskCatalogItemData) {
    this.data = {
      ...data,
      key: data.key.trim().toLowerCase(),
      name: data.name.trim(),
      description: data.description.trim(),
      formDefinitionId: data.formDefinitionId?.trim() || null,
      workflowDefinitionId: data.workflowDefinitionId?.trim() || null,
      approvalPolicyId: data.approvalPolicyId?.trim() || null,
      categoryKey: data.categoryKey?.trim() || null,
      assignmentGroupId: data.assignmentGroupId?.trim() || null,
      tags: tags(data.tags),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
      archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
    };
    this.validateIdentity();
  }

  static create(input: {
    id: string;
    tenantId: string;
    key: string;
    name: string;
    description?: string;
    intakeMode?: ServiceDeskIntakeMode;
    formDefinitionId?: string | null;
    workflowDefinitionId?: string | null;
    approvalPolicyId?: string | null;
    defaultTicketType?: ServiceDeskTicketType;
    defaultPriority?: ServiceDeskPriority;
    categoryKey?: string | null;
    assignmentGroupId?: string | null;
    tags?: readonly string[];
  }) {
    const now = new Date();
    return new ServiceDeskCatalogItem({
      id: input.id,
      tenantId: input.tenantId,
      key: input.key,
      name: input.name,
      description: input.description ?? "",
      status: "DRAFT",
      version: 1,
      intakeMode: input.intakeMode ?? (input.formDefinitionId ? "FORM" : "FREEFORM"),
      formDefinitionId: input.formDefinitionId ?? null,
      workflowDefinitionId: input.workflowDefinitionId ?? null,
      approvalPolicyId: input.approvalPolicyId ?? null,
      defaultTicketType: input.defaultTicketType ?? "SERVICE_REQUEST",
      defaultPriority: input.defaultPriority ?? "MEDIUM",
      categoryKey: input.categoryKey ?? null,
      assignmentGroupId: input.assignmentGroupId ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      archivedAt: null,
    });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get key() { return this.data.key; }
  get name() { return this.data.name; }
  get description() { return this.data.description; }
  get status() { return this.data.status; }
  get version() { return this.data.version; }
  get intakeMode() { return this.data.intakeMode; }
  get formDefinitionId() { return this.data.formDefinitionId; }
  get workflowDefinitionId() { return this.data.workflowDefinitionId; }
  get approvalPolicyId() { return this.data.approvalPolicyId; }
  get defaultTicketType() { return this.data.defaultTicketType; }
  get defaultPriority() { return this.data.defaultPriority; }
  get categoryKey() { return this.data.categoryKey; }
  get assignmentGroupId() { return this.data.assignmentGroupId; }
  get tags() { return [...this.data.tags]; }
  get updatedAt() { return new Date(this.data.updatedAt); }

  prepareDraftRevision() {
    if (this.data.status === "ARCHIVED") throw new Error("Archived catalogue items cannot be edited");
    if (this.data.status === "PUBLISHED") {
      this.data = { ...this.data, status: "DRAFT", version: this.data.version + 1, publishedAt: null, updatedAt: new Date() };
    }
  }

  updateDraft(input: Partial<Pick<ServiceDeskCatalogItemData,
    "key" | "name" | "description" | "intakeMode" | "formDefinitionId" | "workflowDefinitionId" | "approvalPolicyId" | "defaultTicketType" | "defaultPriority" | "categoryKey" | "assignmentGroupId" | "tags"
  >>) {
    if (this.data.status !== "DRAFT") throw new Error("Only draft catalogue items can be edited");
    this.data = {
      ...this.data,
      ...clone(input),
      key: input.key === undefined ? this.data.key : input.key.trim().toLowerCase(),
      name: input.name === undefined ? this.data.name : input.name.trim(),
      description: input.description === undefined ? this.data.description : input.description.trim(),
      formDefinitionId: input.formDefinitionId === undefined ? this.data.formDefinitionId : input.formDefinitionId?.trim() || null,
      workflowDefinitionId: input.workflowDefinitionId === undefined ? this.data.workflowDefinitionId : input.workflowDefinitionId?.trim() || null,
      approvalPolicyId: input.approvalPolicyId === undefined ? this.data.approvalPolicyId : input.approvalPolicyId?.trim() || null,
      categoryKey: input.categoryKey === undefined ? this.data.categoryKey : input.categoryKey?.trim() || null,
      assignmentGroupId: input.assignmentGroupId === undefined ? this.data.assignmentGroupId : input.assignmentGroupId?.trim() || null,
      tags: input.tags === undefined ? this.data.tags : tags(input.tags),
      updatedAt: new Date(),
    };
    this.validateIdentity();
  }

  publish() {
    if (this.data.status !== "DRAFT") throw new Error("Only draft catalogue items can be published");
    this.validatePublishable();
    const now = new Date();
    this.data = { ...this.data, status: "PUBLISHED", publishedAt: now, archivedAt: null, updatedAt: now };
  }

  archive() {
    if (this.data.status === "ARCHIVED") return;
    const now = new Date();
    this.data = { ...this.data, status: "ARCHIVED", archivedAt: now, updatedAt: now };
  }

  clone() { return new ServiceDeskCatalogItem(this.toPersistence()); }
  toPersistence(): ServiceDeskCatalogItemData { return clone(this.data); }
  toJSON() {
    const data = this.toPersistence();
    return { ...data, createdAt: data.createdAt.toISOString(), updatedAt: data.updatedAt.toISOString(), publishedAt: data.publishedAt?.toISOString() ?? null, archivedAt: data.archivedAt?.toISOString() ?? null };
  }

  private validateIdentity() {
    if (!this.data.id.trim() || !this.data.tenantId.trim()) throw new Error("Catalogue item ID and tenant ID are required");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(this.data.key)) throw new Error("Catalogue key must be lowercase words separated by single hyphens");
    if (!this.data.name) throw new Error("Catalogue item name is required");
    if (!Number.isInteger(this.data.version) || this.data.version < 1) throw new Error("Catalogue item version must be >= 1");
  }

  private validatePublishable() {
    this.validateIdentity();
    if (this.data.intakeMode === "FORM" && !this.data.formDefinitionId) throw new Error("FORM intake requires formDefinitionId");
  }
}
