import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type ApiWorkflowStepType = "START" | "END" | "MANUAL_TASK" | "AUTOMATIC_TASK" | "APPROVAL_TASK";
export type ApiWorkflowStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ApiWorkflowInstanceStatus = "RUNNING" | "WAITING" | "COMPLETED" | "CANCELLED" | "FAILED";

export interface ApiWorkflowCondition {
  readonly field: string;
  readonly operator: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN" | "CONTAINS" | "IN" | "IS_SET" | "IS_NOT_SET" | "ALWAYS";
  readonly value?: unknown;
}

export interface ApiWorkflowTransition {
  readonly targetStepId: string;
  readonly condition?: ApiWorkflowCondition;
  readonly isDefault?: boolean;
  readonly description?: string;
}

export interface ApiWorkflowStep {
  readonly id: string;
  readonly name: string;
  readonly type: ApiWorkflowStepType;
  readonly description?: string;
  readonly transitions: readonly ApiWorkflowTransition[];
  readonly taskConfig?: {
    readonly assigneeUserId?: string | null;
    readonly candidateUserIds?: readonly string[];
    readonly candidateRoles?: readonly string[];
    readonly dueInMinutes?: number | null;
    readonly formDefinitionId?: string | null;
  } | null;
  readonly automaticConfig?: { readonly operation: "SET_VARIABLES"; readonly values: Readonly<Record<string, unknown>> } | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ApiWorkflowTrigger {
  readonly type: "MANUAL" | "API" | "EVENT" | "FORM_SUBMISSION" | "SCHEDULED";
  readonly eventName?: string | null;
  readonly formDefinitionId?: string | null;
  readonly schedule?: string | null;
}

export interface ApiWorkflowDefinition {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: ApiWorkflowStatus;
  readonly startStepId: string;
  readonly steps: readonly ApiWorkflowStep[];
  readonly triggers: readonly ApiWorkflowTrigger[];
  readonly metadata: { readonly category?: string | null; readonly tags?: readonly string[]; readonly domain?: string | null; readonly authorUserId?: string | null };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface ApiWorkflowInstance {
  readonly id: string;
  readonly workflowDefinitionId: string;
  readonly workflowVersion: number;
  readonly status: ApiWorkflowInstanceStatus;
  readonly currentStepId: string | null;
  readonly variables: Readonly<Record<string, unknown>>;
  readonly startedByUserId: string;
  readonly sourceType: string;
  readonly sourceReferenceId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly failureReason: string | null;
}

export interface ApiHumanTask {
  readonly id: string;
  readonly workflowInstanceId: string;
  readonly workflowDefinitionId: string;
  readonly workflowVersion: number;
  readonly stepId: string;
  readonly kind: "MANUAL" | "APPROVAL";
  readonly name: string;
  readonly description: string;
  readonly status: "PENDING" | "CLAIMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  readonly assigneeUserId: string | null;
  readonly candidateUserIds: readonly string[];
  readonly candidateRoles: readonly string[];
  readonly dueAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function baseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function request<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
  if (!session.token) throw new Error("This action requires a live API session.");
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${session.token}`,
      "X-Tenant-Slug": session.tenantSlug,
    },
  });
  const body = await response.json().catch(() => null) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const workflowApi = {
  listDefinitions(session: KlerionSession): Promise<ApiWorkflowDefinition[]> { return request(session, "/workflow-definitions"); },
  createDefinition(session: KlerionSession, input: { name: string; description?: string; startStepId?: string; steps?: readonly ApiWorkflowStep[]; triggers?: readonly ApiWorkflowTrigger[] }): Promise<ApiWorkflowDefinition> { return request(session, "/workflow-definitions", { method: "POST", body: JSON.stringify(input) }); },
  updateDefinition(session: KlerionSession, id: string, input: { name?: string; description?: string; startStepId?: string; steps?: readonly ApiWorkflowStep[]; triggers?: readonly ApiWorkflowTrigger[] }): Promise<ApiWorkflowDefinition> { return request(session, `/workflow-definitions/${id}`, { method: "PATCH", body: JSON.stringify(input) }); },
  publishDefinition(session: KlerionSession, id: string): Promise<ApiWorkflowDefinition> { return request(session, `/workflow-definitions/${id}/publish`, { method: "POST" }); },
  archiveDefinition(session: KlerionSession, id: string): Promise<ApiWorkflowDefinition> { return request(session, `/workflow-definitions/${id}/archive`, { method: "POST" }); },
  listInstances(session: KlerionSession): Promise<ApiWorkflowInstance[]> { return request(session, "/workflow-instances"); },
  startWorkflow(session: KlerionSession, definitionId: string, variables: Record<string, unknown>): Promise<ApiWorkflowInstance> { return request(session, `/workflow-definitions/${definitionId}/start`, { method: "POST", body: JSON.stringify({ variables }) }); },
  cancelInstance(session: KlerionSession, id: string, reason?: string): Promise<ApiWorkflowInstance> { return request(session, `/workflow-instances/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); },
  listTasks(session: KlerionSession, all = false): Promise<ApiHumanTask[]> { return request(session, `/workflow-tasks${all ? "?scope=all" : ""}`); },
  claimTask(session: KlerionSession, id: string): Promise<ApiHumanTask> { return request(session, `/workflow-tasks/${id}/claim`, { method: "POST" }); },
  completeTask(session: KlerionSession, id: string, output?: Record<string, unknown>): Promise<{ task: ApiHumanTask; instance: ApiWorkflowInstance }> { return request(session, `/workflow-tasks/${id}/complete`, { method: "POST", body: JSON.stringify({ output }) }); },
};
