import type { ApprovalPolicy } from "./policy.js";
import type { ApprovalPolicyRepository, ApprovalRequestRepository } from "./repositories.js";
import type { ApprovalRequest } from "./request.js";
import type { ApprovalRequestStatus, ApprovalSourceType } from "./types.js";

export class InMemoryApprovalPolicyRepository implements ApprovalPolicyRepository {
  private readonly current = new Map<string, ApprovalPolicy>();
  private readonly versions = new Map<string, ApprovalPolicy>();

  async findById(tenantId: string, id: string) { return this.current.get(this.key(tenantId, id))?.clone() ?? null; }
  async listByTenant(tenantId: string) { return [...this.current.values()].filter((item) => item.tenantId === tenantId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.clone()); }
  async findPublishedVersion(tenantId: string, id: string, version: number) { return this.versions.get(this.versionKey(tenantId, id, version))?.clone() ?? null; }
  async findLatestPublishedVersion(tenantId: string, id: string) { return (await this.listPublishedVersions(tenantId, id))[0] ?? null; }
  async listPublishedVersions(tenantId: string, id: string) { return [...this.versions.values()].filter((item) => item.tenantId === tenantId && item.id === id).sort((a, b) => b.version - a.version).map((item) => item.clone()); }
  async save(policy: ApprovalPolicy) { this.current.set(this.key(policy.tenantId, policy.id), policy.clone()); }
  async savePublishedVersion(policy: ApprovalPolicy) {
    if (policy.status !== "PUBLISHED") throw new Error("Only published approval policies can be version snapshots");
    this.versions.set(this.versionKey(policy.tenantId, policy.id, policy.version), policy.clone());
  }
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private versionKey(tenantId: string, id: string, version: number) { return `${tenantId}:${id}:${version}`; }
}

export class InMemoryApprovalRequestRepository implements ApprovalRequestRepository {
  private readonly items = new Map<string, ApprovalRequest>();
  async findById(tenantId: string, id: string) { const item = this.items.get(this.key(tenantId, id)); return item?.tenantId === tenantId ? item.clone() : null; }
  async listByTenant(tenantId: string, status?: ApprovalRequestStatus) { return this.list((item) => item.tenantId === tenantId && (!status || item.status === status)); }
  async listByRequester(tenantId: string, userId: string) { return this.list((item) => item.tenantId === tenantId && item.requestedByUserId === userId); }
  async findBySource(tenantId: string, sourceType: ApprovalSourceType, sourceReferenceId: string) { return this.list((item) => item.tenantId === tenantId && item.sourceType === sourceType && item.sourceReferenceId === sourceReferenceId); }
  async save(request: ApprovalRequest) { this.items.set(this.key(request.tenantId, request.id), request.clone()); }
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private list(predicate: (item: ApprovalRequest) => boolean) { return [...this.items.values()].filter(predicate).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.clone()); }
}
