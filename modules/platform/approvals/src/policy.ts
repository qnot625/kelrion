import type { ApprovalPolicyData, ApprovalPolicyMetadata, ApprovalStage } from "./types.js";

function clone<T>(value: T): T { return structuredClone(value); }

export class ApprovalPolicy {
  private data: ApprovalPolicyData;

  constructor(data: ApprovalPolicyData) {
    this.data = {
      ...data,
      name: data.name.trim(),
      description: data.description.trim(),
      stages: clone(data.stages),
      metadata: clone(data.metadata),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
      archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
    };
    if (!this.data.id.trim()) throw new Error("Approval policy ID is required");
    if (!this.data.tenantId.trim()) throw new Error("Tenant ID is required");
    if (!this.data.name) throw new Error("Approval policy name is required");
    if (!Number.isInteger(this.data.version) || this.data.version < 1) throw new Error("Approval policy version must be >= 1");
  }

  static create(input: {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    stages?: readonly ApprovalStage[];
    metadata?: ApprovalPolicyMetadata;
  }): ApprovalPolicy {
    const now = new Date();
    return new ApprovalPolicy({
      id: input.id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? "",
      version: 1,
      status: "DRAFT",
      stages: clone(input.stages ?? []),
      metadata: clone(input.metadata ?? {}),
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      archivedAt: null,
    });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get name() { return this.data.name; }
  get description() { return this.data.description; }
  get version() { return this.data.version; }
  get status() { return this.data.status; }
  get stages(): readonly ApprovalStage[] { return clone(this.data.stages); }
  get metadata(): ApprovalPolicyMetadata { return clone(this.data.metadata); }
  get createdAt() { return new Date(this.data.createdAt); }
  get updatedAt() { return new Date(this.data.updatedAt); }
  get publishedAt() { return this.data.publishedAt ? new Date(this.data.publishedAt) : null; }
  get archivedAt() { return this.data.archivedAt ? new Date(this.data.archivedAt) : null; }

  prepareDraftRevision(): void {
    if (this.data.status === "ARCHIVED") throw new Error("Archived approval policies cannot be edited");
    if (this.data.status === "PUBLISHED") {
      this.data = { ...this.data, version: this.data.version + 1, status: "DRAFT", publishedAt: null, updatedAt: new Date() };
    }
  }

  updateDraft(input: { name?: string; description?: string; stages?: readonly ApprovalStage[]; metadata?: ApprovalPolicyMetadata }): void {
    if (this.data.status !== "DRAFT") throw new Error("Only draft approval policies can be edited");
    const name = input.name === undefined ? this.data.name : input.name.trim();
    if (!name) throw new Error("Approval policy name cannot be empty");
    this.data = {
      ...this.data,
      name,
      description: input.description === undefined ? this.data.description : input.description.trim(),
      stages: clone(input.stages ?? this.data.stages),
      metadata: clone(input.metadata ?? this.data.metadata),
      updatedAt: new Date(),
    };
  }

  publish(): void {
    if (this.data.status !== "DRAFT") throw new Error("Only draft approval policies can be published");
    this.validate();
    const now = new Date();
    this.data = { ...this.data, status: "PUBLISHED", publishedAt: now, archivedAt: null, updatedAt: now };
  }

  archive(): void {
    if (this.data.status === "ARCHIVED") return;
    const now = new Date();
    this.data = { ...this.data, status: "ARCHIVED", archivedAt: now, updatedAt: now };
  }

  validate(): void {
    if (this.data.stages.length === 0) throw new Error("Approval policy requires at least one stage");
    const ids = new Set<string>();
    for (const stage of this.data.stages) {
      if (!stage.id.trim() || !stage.name.trim()) throw new Error("Every approval stage requires an ID and name");
      if (ids.has(stage.id)) throw new Error(`Duplicate approval stage '${stage.id}'`);
      ids.add(stage.id);
      const named = [...new Set(stage.approverUserIds.filter(Boolean))];
      const roles = [...new Set(stage.approverRoles.filter(Boolean))];
      if (named.length === 0 && roles.length === 0) throw new Error(`Approval stage '${stage.id}' requires approver users or roles`);
      if (stage.dueInMinutes !== undefined && stage.dueInMinutes !== null && (!Number.isInteger(stage.dueInMinutes) || stage.dueInMinutes <= 0)) {
        throw new Error(`Approval stage '${stage.id}' dueInMinutes must be a positive integer`);
      }
      if (stage.mode === "ALL_NAMED") {
        if (named.length === 0) throw new Error(`ALL_NAMED stage '${stage.id}' requires named approvers`);
        if (roles.length > 0) throw new Error(`ALL_NAMED stage '${stage.id}' cannot use role approvers`);
      }
      if (stage.mode === "QUORUM") {
        const required = stage.requiredApprovals ?? 0;
        if (!Number.isInteger(required) || required < 1) throw new Error(`QUORUM stage '${stage.id}' requires requiredApprovals >= 1`);
        if (roles.length === 0 && required > named.length) throw new Error(`QUORUM stage '${stage.id}' requires more approvals than named approvers`);
      }
    }
  }

  clone() { return new ApprovalPolicy(this.toPersistence()); }
  toPersistence(): ApprovalPolicyData { return clone(this.data); }
  toJSON() {
    const data = this.toPersistence();
    return { ...data, createdAt: data.createdAt.toISOString(), updatedAt: data.updatedAt.toISOString(), publishedAt: data.publishedAt?.toISOString() ?? null, archivedAt: data.archivedAt?.toISOString() ?? null };
  }
}
