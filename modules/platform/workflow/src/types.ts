export type WorkflowStepType = "START" | "END" | "MANUAL_TASK" | "AUTOMATIC_TASK" | "APPROVAL_TASK";
export type WorkflowDefinitionStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type WorkflowInstanceStatus = "RUNNING" | "WAITING" | "COMPLETED" | "CANCELLED" | "FAILED";
export type HumanTaskStatus = "PENDING" | "CLAIMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type HumanTaskKind = "MANUAL" | "APPROVAL";
export type WorkflowTriggerType = "MANUAL" | "API" | "EVENT" | "FORM_SUBMISSION" | "SCHEDULED";

export type ConditionOperator =
  | "EQUALS"
  | "NOT_EQUALS"
  | "GREATER_THAN"
  | "LESS_THAN"
  | "CONTAINS"
  | "IN"
  | "IS_SET"
  | "IS_NOT_SET"
  | "ALWAYS";

export interface WorkflowCondition {
  readonly field: string;
  readonly operator: ConditionOperator;
  readonly value?: unknown;
}

export interface WorkflowTransition {
  readonly targetStepId: string;
  readonly condition?: WorkflowCondition;
  readonly isDefault?: boolean;
  readonly description?: string;
}

export interface HumanTaskConfig {
  readonly assigneeUserId?: string | null;
  readonly candidateUserIds?: readonly string[];
  readonly candidateRoles?: readonly string[];
  readonly dueInMinutes?: number | null;
  readonly formDefinitionId?: string | null;
}

export interface AutomaticTaskConfig {
  readonly operation: "SET_VARIABLES";
  readonly values: Readonly<Record<string, unknown>>;
}

export interface WorkflowStep {
  readonly id: string;
  readonly name: string;
  readonly type: WorkflowStepType;
  readonly description?: string;
  readonly transitions: readonly WorkflowTransition[];
  readonly taskConfig?: HumanTaskConfig | null;
  readonly automaticConfig?: AutomaticTaskConfig | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WorkflowTrigger {
  readonly type: WorkflowTriggerType;
  readonly eventName?: string | null;
  readonly formDefinitionId?: string | null;
  readonly schedule?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WorkflowMetadata {
  readonly category?: string | null;
  readonly tags?: readonly string[];
  readonly domain?: string | null;
  readonly authorUserId?: string | null;
}

export interface WorkflowDefinitionData {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: WorkflowDefinitionStatus;
  readonly startStepId: string;
  readonly steps: readonly WorkflowStep[];
  readonly triggers: readonly WorkflowTrigger[];
  readonly metadata: WorkflowMetadata;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
  readonly archivedAt: Date | null;
}

export interface WorkflowExecutionEntry {
  readonly stepId: string;
  readonly stepName: string;
  readonly stepType: WorkflowStepType;
  readonly status: "COMPLETED" | "WAITING" | "FAILED";
  readonly startedAt: Date;
  readonly completedAt: Date | null;
  readonly actorUserId: string | null;
  readonly output: Readonly<Record<string, unknown>> | null;
  readonly error: string | null;
}

export interface WorkflowInstanceData {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowDefinitionId: string;
  readonly workflowVersion: number;
  readonly status: WorkflowInstanceStatus;
  readonly currentStepId: string | null;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly executionHistory: readonly WorkflowExecutionEntry[];
  readonly startedByUserId: string;
  readonly sourceType: WorkflowTriggerType;
  readonly sourceReferenceId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly failedAt: Date | null;
  readonly failureReason: string | null;
}

export interface HumanTaskData {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly workflowDefinitionId: string;
  readonly workflowVersion: number;
  readonly stepId: string;
  readonly kind: HumanTaskKind;
  readonly name: string;
  readonly description: string;
  readonly status: HumanTaskStatus;
  readonly assigneeUserId: string | null;
  readonly candidateUserIds: readonly string[];
  readonly candidateRoles: readonly string[];
  readonly formDefinitionId: string | null;
  readonly dueAt: Date | null;
  readonly output: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}
