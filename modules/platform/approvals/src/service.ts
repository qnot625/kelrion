import { randomUUID } from "node:crypto";
import type { AuditLog } from "@adminops/audit";
import { ApprovalAccessError, ApprovalPolicyNotFoundError, ApprovalRequestNotFoundError, ApprovalValidationError } from "./errors.js";
import { ApprovalPolicy } from "./policy.js";
import type { ApprovalPolicyRepository, ApprovalRequestRepository } from "./repositories.js";
import { ApprovalRequest } from "./request.js";
import type { ApprovalDecisionValue, ApprovalPolicyMetadata, ApprovalRequestStatus, ApprovalSourceType, ApprovalStage } from "./types.js";

export class ApprovalEngineService {
  constructor(
    private readonly policies: ApprovalPolicyRepository,
    private readonly requests: ApprovalRequestRepository,
    private readonly auditLog?: AuditLog,
  ) {}

  async createPolicy(input: {
    tenantId: string;
    name: string;
    description?: string;
    stages?: readonly ApprovalStage[];
    metadata?: ApprovalPolicyMetadata;
    actorUserId: string;
    id?: string;
  }): Promise<ApprovalPolicy> {
    const id = input.id?.trim() || randomUUID();
    if (await this.policies.findById(input.tenantId, id)) throw new ApprovalValidationError(`Approval policy '${id}' already exists`);
    let policy: ApprovalPolicy;
    try {
      policy = ApprovalPolicy.create({ id, tenantId: input.tenantId, name: input.name, description: input.description, stages: input.stages, metadata: { ...input.metadata, authorUserId: input.actorUserId } });
    } catch (error) { throw this.validation(error); }
    await this.policies.save(policy);
    await this.audit("approval.policy_created", input.tenantId, input.actorUserId, "approval_policy", id, { version: 1 });
    return policy;
  }

  async updatePolicy(input: {
    tenantId: string;
    id: string;
    name?: string;
    description?: string;
    stages?: readonly ApprovalStage[];
    metadata?: ApprovalPolicyMetadata;
    actorUserId: string;
  }): Promise<ApprovalPolicy> {
    const policy = await this.requirePolicy(input.tenantId, input.id);
    try { policy.prepareDraftRevision(); policy.updateDraft(input); } catch (error) { throw this.validation(error); }
    await this.policies.save(policy);
    await this.audit("approval.policy_updated", input.tenantId, input.actorUserId, "approval_policy", policy.id, { version: policy.version });
    return policy;
  }

  async publishPolicy(tenantId: string, id: string, actorUserId: string): Promise<ApprovalPolicy> {
    const policy = await this.requirePolicy(tenantId, id);
    try { policy.publish(); } catch (error) { throw this.validation(error); }
    await this.policies.save(policy);
    await this.policies.savePublishedVersion(policy);
    await this.audit("approval.policy_published", tenantId, actorUserId, "approval_policy", id, { version: policy.version });
    return policy;
  }

  async archivePolicy(tenantId: string, id: string, actorUserId: string): Promise<ApprovalPolicy> {
    const policy = await this.requirePolicy(tenantId, id);
    policy.archive();
    await this.policies.save(policy);
    await this.audit("approval.policy_archived", tenantId, actorUserId, "approval_policy", id, { version: policy.version });
    return policy;
  }

  listPolicies(tenantId: string) { return this.policies.listByTenant(tenantId); }
  getPolicy(tenantId: string, id: string) { return this.requirePolicy(tenantId, id); }

  async listPublishedPolicies(tenantId: string) {
    const current = await this.policies.listByTenant(tenantId);
    const results: ApprovalPolicy[] = [];
    for (const policy of current) {
      if (policy.status === "ARCHIVED") continue;
      const published = await this.policies.findLatestPublishedVersion(tenantId, policy.id);
      if (published) results.push(published);
    }
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getPublishedPolicy(tenantId: string, id: string, version?: number) {
    const policy = version === undefined ? await this.policies.findLatestPublishedVersion(tenantId, id) : await this.policies.findPublishedVersion(tenantId, id, version);
    if (!policy) throw new ApprovalPolicyNotFoundError(id);
    return policy;
  }

  async listPolicyVersions(tenantId: string, id: string) {
    await this.requirePolicy(tenantId, id);
    return this.policies.listPublishedVersions(tenantId, id);
  }

  async createRequest(input: {
    tenantId: string;
    policyId: string;
    policyVersion?: number;
    title: string;
    description?: string;
    requestedByUserId: string;
    sourceType?: ApprovalSourceType;
    sourceReferenceId?: string | null;
    workflowTaskId?: string | null;
    context?: Readonly<Record<string, unknown>>;
    id?: string;
  }): Promise<ApprovalRequest> {
    if (!input.title.trim()) throw new ApprovalValidationError("Approval request title is required");
    const policy = await this.getPublishedPolicy(input.tenantId, input.policyId, input.policyVersion);
    const sourceType = input.sourceType ?? "MANUAL";
    if (input.sourceReferenceId) {
      const existing = await this.requests.findBySource(input.tenantId, sourceType, input.sourceReferenceId);
      const same = existing.find((item) => item.policyId === policy.id && item.policyVersion === policy.version);
      if (same) return same;
    }
    let request: ApprovalRequest;
    try {
      request = ApprovalRequest.create({
        id: input.id?.trim() || randomUUID(),
        tenantId: input.tenantId,
        policy: policy.toPersistence(),
        title: input.title,
        description: input.description,
        requestedByUserId: input.requestedByUserId,
        sourceType,
        sourceReferenceId: input.sourceReferenceId,
        workflowTaskId: input.workflowTaskId,
        context: input.context,
      });
    } catch (error) { throw this.validation(error); }
    await this.requests.save(request);
    await this.audit("approval.request_created", input.tenantId, input.requestedByUserId, "approval_request", request.id, { policyId: policy.id, policyVersion: policy.version, sourceType, sourceReferenceId: input.sourceReferenceId ?? null });
    return request;
  }

  async getRequest(input: { tenantId: string; id: string; actorUserId: string; actorRoles: readonly string[]; canManage: boolean }): Promise<ApprovalRequest> {
    const request = await this.requireRequest(input.tenantId, input.id);
    if (!input.canManage && request.requestedByUserId !== input.actorUserId && !(await this.isActionableBy(request, input.actorUserId, input.actorRoles))) {
      throw new ApprovalAccessError();
    }
    return request;
  }

  listRequests(tenantId: string, status?: ApprovalRequestStatus) { return this.requests.listByTenant(tenantId, status); }
  listOwnRequests(tenantId: string, userId: string) { return this.requests.listByRequester(tenantId, userId); }

  async listActionable(tenantId: string, userId: string, roles: readonly string[]): Promise<ApprovalRequest[]> {
    const pending = await this.requests.listByTenant(tenantId, "PENDING");
    const results: ApprovalRequest[] = [];
    for (const request of pending) if (await this.isActionableBy(request, userId, roles)) results.push(request);
    return results;
  }

  async listOverdue(tenantId: string): Promise<ApprovalRequest[]> {
    return (await this.requests.listByTenant(tenantId, "PENDING")).filter((request) => request.isOverdue);
  }

  async decide(input: {
    tenantId: string;
    id: string;
    actorUserId: string;
    actorRoles: readonly string[];
    decision: ApprovalDecisionValue;
    comment?: string;
  }): Promise<ApprovalRequest> {
    const request = await this.requireRequest(input.tenantId, input.id);
    const policy = await this.getPublishedPolicy(input.tenantId, request.policyId, request.policyVersion);
    try {
      request.decide({ policy: policy.toPersistence(), actorUserId: input.actorUserId, actorRoles: input.actorRoles, decision: input.decision, comment: input.comment, decisionId: randomUUID() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid approval decision";
      if (message.includes("not eligible")) throw new ApprovalAccessError(message);
      throw new ApprovalValidationError(message);
    }
    await this.requests.save(request);
    await this.audit("approval.request_decided", input.tenantId, input.actorUserId, "approval_request", request.id, { decision: input.decision, status: request.status, policyId: request.policyId, policyVersion: request.policyVersion });
    return request;
  }

  async cancelRequest(input: { tenantId: string; id: string; actorUserId: string; canManage: boolean; reason?: string }): Promise<ApprovalRequest> {
    const request = await this.requireRequest(input.tenantId, input.id);
    try { request.cancel(input.actorUserId, input.canManage, input.reason); } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid cancellation";
      if (message.includes("Only the requester")) throw new ApprovalAccessError(message);
      throw new ApprovalValidationError(message);
    }
    await this.requests.save(request);
    await this.audit("approval.request_cancelled", input.tenantId, input.actorUserId, "approval_request", request.id, { reason: input.reason ?? null });
    return request;
  }

  async isActionableBy(request: ApprovalRequest, userId: string, roles: readonly string[]): Promise<boolean> {
    if (request.status !== "PENDING") return false;
    const policy = await this.getPublishedPolicy(request.tenantId, request.policyId, request.policyVersion);
    const stage = policy.stages[request.currentStageIndex];
    return Boolean(stage && request.isEligible(stage, userId, roles) && !request.hasDecisionFrom(stage.id, userId));
  }

  private async requirePolicy(tenantId: string, id: string) {
    const policy = await this.policies.findById(tenantId, id);
    if (!policy) throw new ApprovalPolicyNotFoundError(id);
    return policy;
  }

  private async requireRequest(tenantId: string, id: string) {
    const request = await this.requests.findById(tenantId, id);
    if (!request) throw new ApprovalRequestNotFoundError(id);
    return request;
  }

  private validation(error: unknown) { return new ApprovalValidationError(error instanceof Error ? error.message : "Invalid approval operation"); }

  private async audit(action: string, tenantId: string, actorUserId: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
    if (!this.auditLog) return;
    await this.auditLog.record({ tenantId, actorUserId, action, targetType, targetId, metadata });
  }
}
