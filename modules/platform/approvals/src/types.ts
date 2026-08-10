export type ApprovalPolicyStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ApprovalDecisionValue = "APPROVE" | "REJECT";
export type ApprovalStageMode = "ANY" | "QUORUM" | "ALL_NAMED";
export type ApprovalSourceType = "MANUAL" | "WORKFLOW_TASK" | "FORM_SUBMISSION" | "API";

export interface ApprovalStage {
  readonly id: string;
  readonly name: string;
  readonly mode: ApprovalStageMode;
  readonly approverUserIds: readonly string[];
  readonly approverRoles: readonly string[];
  readonly requiredApprovals?: number | null;
  readonly dueInMinutes?: number | null;
  readonly allowSelfApproval?: boolean;
  readonly description?: string;
}

export interface ApprovalPolicyMetadata {
  readonly category?: string | null;
  readonly tags?: readonly string[];
  readonly domain?: string | null;
  readonly authorUserId?: string | null;
}

export interface ApprovalPolicyData {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: ApprovalPolicyStatus;
  readonly stages: readonly ApprovalStage[];
  readonly metadata: ApprovalPolicyMetadata;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
}

export interface ApprovalDecision {
  readonly id: string;
  readonly stageId: string;
  readonly actorUserId: string;
  readonly decision: ApprovalDecisionValue;
  readonly comment: string;
  readonly decidedAt: Date;
}

export interface ApprovalRequestData {
  readonly id: string;
  readonly tenantId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly title: string;
  readonly description: string;
  readonly requestedByUserId: string;
  readonly sourceType: ApprovalSourceType;
  readonly sourceReferenceId: string | null;
  readonly workflowTaskId: string | null;
  readonly context: Readonly<Record<string, unknown>>;
  readonly status: ApprovalRequestStatus;
  readonly currentStageIndex: number;
  readonly stageStartedAt: Date;
  readonly currentStageDueAt: Date | null;
  readonly decisions: readonly ApprovalDecision[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly decidedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationReason: string | null;
}
