import type { ApprovalDecision, ApprovalDecisionValue, ApprovalPolicyData, ApprovalRequestData, ApprovalStage } from "./types.js";

function clone<T>(value: T): T { return structuredClone(value); }

export class ApprovalRequest {
  private data: ApprovalRequestData;

  constructor(data: ApprovalRequestData) {
    this.data = {
      ...data,
      context: clone(data.context),
      decisions: clone(data.decisions).map((decision) => ({ ...decision, decidedAt: new Date(decision.decidedAt) })),
      stageStartedAt: new Date(data.stageStartedAt),
      currentStageDueAt: data.currentStageDueAt ? new Date(data.currentStageDueAt) : null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      decidedAt: data.decidedAt ? new Date(data.decidedAt) : null,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : null,
    };
    if (!this.data.id.trim()) throw new Error("Approval request ID is required");
    if (!this.data.tenantId.trim()) throw new Error("Tenant ID is required");
    if (!this.data.title.trim()) throw new Error("Approval request title is required");
    if (!this.data.requestedByUserId.trim()) throw new Error("Approval requester is required");
  }

  static create(input: {
    id: string;
    tenantId: string;
    policy: ApprovalPolicyData;
    title: string;
    description?: string;
    requestedByUserId: string;
    sourceType: ApprovalRequestData["sourceType"];
    sourceReferenceId?: string | null;
    workflowTaskId?: string | null;
    context?: Readonly<Record<string, unknown>>;
  }): ApprovalRequest {
    if (input.policy.status !== "PUBLISHED") throw new Error("Approval requests require a published policy version");
    if (input.policy.stages.length === 0) throw new Error("Published approval policy has no stages");
    const title = input.title.trim();
    if (!title) throw new Error("Approval request title is required");
    const now = new Date();
    return new ApprovalRequest({
      id: input.id,
      tenantId: input.tenantId,
      policyId: input.policy.id,
      policyVersion: input.policy.version,
      title,
      description: input.description?.trim() ?? "",
      requestedByUserId: input.requestedByUserId,
      sourceType: input.sourceType,
      sourceReferenceId: input.sourceReferenceId ?? null,
      workflowTaskId: input.workflowTaskId ?? null,
      context: clone(input.context ?? {}),
      status: "PENDING",
      currentStageIndex: 0,
      stageStartedAt: now,
      currentStageDueAt: ApprovalRequest.dueAt(input.policy.stages[0]!, now),
      decisions: [],
      createdAt: now,
      updatedAt: now,
      decidedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get policyId() { return this.data.policyId; }
  get policyVersion() { return this.data.policyVersion; }
  get title() { return this.data.title; }
  get description() { return this.data.description; }
  get requestedByUserId() { return this.data.requestedByUserId; }
  get sourceType() { return this.data.sourceType; }
  get sourceReferenceId() { return this.data.sourceReferenceId; }
  get workflowTaskId() { return this.data.workflowTaskId; }
  get context(): Readonly<Record<string, unknown>> { return clone(this.data.context); }
  get status() { return this.data.status; }
  get currentStageIndex() { return this.data.currentStageIndex; }
  get currentStageDueAt() { return this.data.currentStageDueAt ? new Date(this.data.currentStageDueAt) : null; }
  get stageStartedAt() { return new Date(this.data.stageStartedAt); }
  get decisions(): readonly ApprovalDecision[] { return clone(this.data.decisions); }
  get createdAt() { return new Date(this.data.createdAt); }
  get updatedAt() { return new Date(this.data.updatedAt); }
  get decidedAt() { return this.data.decidedAt ? new Date(this.data.decidedAt) : null; }
  get cancelledAt() { return this.data.cancelledAt ? new Date(this.data.cancelledAt) : null; }
  get cancellationReason() { return this.data.cancellationReason; }
  get isOverdue() { return this.data.status === "PENDING" && Boolean(this.data.currentStageDueAt && this.data.currentStageDueAt.getTime() < Date.now()); }

  isEligible(stage: ApprovalStage, userId: string, roles: readonly string[]): boolean {
    if (!stage.allowSelfApproval && userId === this.data.requestedByUserId) return false;
    return stage.approverUserIds.includes(userId) || roles.some((role) => stage.approverRoles.includes(role));
  }

  hasDecisionFrom(stageId: string, userId: string): boolean {
    return this.data.decisions.some((decision) => decision.stageId === stageId && decision.actorUserId === userId);
  }

  decide(input: {
    policy: ApprovalPolicyData;
    actorUserId: string;
    actorRoles: readonly string[];
    decision: ApprovalDecisionValue;
    comment?: string;
    decisionId: string;
  }): ApprovalDecision {
    if (this.data.status !== "PENDING") throw new Error(`Approval request is ${this.data.status}`);
    if (input.policy.id !== this.data.policyId || input.policy.version !== this.data.policyVersion) throw new Error("Approval policy version does not match this request");
    const stage = input.policy.stages[this.data.currentStageIndex];
    if (!stage) throw new Error("Approval request has no current stage");
    if (!this.isEligible(stage, input.actorUserId, input.actorRoles)) throw new Error("User is not eligible to decide this approval stage");
    if (this.hasDecisionFrom(stage.id, input.actorUserId)) throw new Error("User has already decided this approval stage");

    const now = new Date();
    const decision: ApprovalDecision = {
      id: input.decisionId,
      stageId: stage.id,
      actorUserId: input.actorUserId,
      decision: input.decision,
      comment: input.comment?.trim() ?? "",
      decidedAt: now,
    };
    const decisions = [...this.data.decisions, decision];

    if (input.decision === "REJECT") {
      this.data = { ...this.data, decisions, status: "REJECTED", updatedAt: now, decidedAt: now };
      return clone(decision);
    }

    const stageApprovals = decisions.filter((item) => item.stageId === stage.id && item.decision === "APPROVE");
    let stageComplete = false;
    if (stage.mode === "ANY") stageComplete = stageApprovals.length >= 1;
    if (stage.mode === "QUORUM") stageComplete = stageApprovals.length >= (stage.requiredApprovals ?? 1);
    if (stage.mode === "ALL_NAMED") {
      const approvedUsers = new Set(stageApprovals.map((item) => item.actorUserId));
      stageComplete = stage.approverUserIds.every((userId) => approvedUsers.has(userId));
    }

    if (!stageComplete) {
      this.data = { ...this.data, decisions, updatedAt: now };
      return clone(decision);
    }

    const nextIndex = this.data.currentStageIndex + 1;
    const nextStage = input.policy.stages[nextIndex];
    if (!nextStage) {
      this.data = { ...this.data, decisions, status: "APPROVED", updatedAt: now, decidedAt: now };
      return clone(decision);
    }
    this.data = {
      ...this.data,
      decisions,
      currentStageIndex: nextIndex,
      stageStartedAt: now,
      currentStageDueAt: ApprovalRequest.dueAt(nextStage, now),
      updatedAt: now,
    };
    return clone(decision);
  }

  cancel(actorUserId: string, canManage: boolean, reason?: string): void {
    if (this.data.status !== "PENDING") throw new Error(`Approval request is ${this.data.status}`);
    if (!canManage && this.data.requestedByUserId !== actorUserId) throw new Error("Only the requester or an approval administrator can cancel this request");
    const now = new Date();
    this.data = { ...this.data, status: "CANCELLED", cancelledAt: now, updatedAt: now, cancellationReason: reason?.trim() || null };
  }

  clone() { return new ApprovalRequest(this.toPersistence()); }
  toPersistence(): ApprovalRequestData { return clone(this.data); }
  toJSON() {
    const data = this.toPersistence();
    return {
      ...data,
      decisions: data.decisions.map((decision) => ({ ...decision, decidedAt: decision.decidedAt.toISOString() })),
      stageStartedAt: data.stageStartedAt.toISOString(),
      currentStageDueAt: data.currentStageDueAt?.toISOString() ?? null,
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString(),
      decidedAt: data.decidedAt?.toISOString() ?? null,
      cancelledAt: data.cancelledAt?.toISOString() ?? null,
      isOverdue: this.isOverdue,
    };
  }

  private static dueAt(stage: ApprovalStage, startedAt: Date): Date | null {
    return stage.dueInMinutes && stage.dueInMinutes > 0 ? new Date(startedAt.getTime() + stage.dueInMinutes * 60_000) : null;
  }
}
