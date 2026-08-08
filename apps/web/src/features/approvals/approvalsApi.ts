import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type ApiApprovalStageMode = "ANY" | "QUORUM" | "ALL_NAMED";
export type ApiApprovalPolicyStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ApiApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface ApiApprovalStage {
  readonly id: string;
  readonly name: string;
  readonly mode: ApiApprovalStageMode;
  readonly approverUserIds: readonly string[];
  readonly approverRoles: readonly string[];
  readonly requiredApprovals?: number | null;
  readonly dueInMinutes?: number | null;
  readonly allowSelfApproval?: boolean;
  readonly description?: string;
}

export interface ApiApprovalPolicy {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  readonly status: ApiApprovalPolicyStatus;
  readonly stages: readonly ApiApprovalStage[];
  readonly metadata: { readonly category?: string | null; readonly tags?: readonly string[]; readonly domain?: string | null; readonly authorUserId?: string | null };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface ApiApprovalDecision {
  readonly id: string;
  readonly stageId: string;
  readonly actorUserId: string;
  readonly decision: "APPROVE" | "REJECT";
  readonly comment: string;
  readonly decidedAt: string;
}

export interface ApiApprovalRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly title: string;
  readonly description: string;
  readonly requestedByUserId: string;
  readonly sourceType: "MANUAL" | "WORKFLOW_TASK" | "FORM_SUBMISSION" | "API";
  readonly sourceReferenceId: string | null;
  readonly workflowTaskId: string | null;
  readonly context: Readonly<Record<string, unknown>>;
  readonly status: ApiApprovalRequestStatus;
  readonly currentStageIndex: number;
  readonly currentStageDueAt: string | null;
  readonly decisions: readonly ApiApprovalDecision[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly decidedAt: string | null;
  readonly isOverdue: boolean;
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

export const approvalsApi = {
  listPolicies(session: KlerionSession): Promise<ApiApprovalPolicy[]> { return request(session, "/approval-policies"); },
  createPolicy(session: KlerionSession, input: { name: string; description?: string; stages: readonly ApiApprovalStage[] }): Promise<ApiApprovalPolicy> { return request(session, "/approval-policies", { method: "POST", body: JSON.stringify(input) }); },
  updatePolicy(session: KlerionSession, id: string, input: { name?: string; description?: string; stages?: readonly ApiApprovalStage[] }): Promise<ApiApprovalPolicy> { return request(session, `/approval-policies/${id}`, { method: "PATCH", body: JSON.stringify(input) }); },
  publishPolicy(session: KlerionSession, id: string): Promise<ApiApprovalPolicy> { return request(session, `/approval-policies/${id}/publish`, { method: "POST" }); },
  archivePolicy(session: KlerionSession, id: string): Promise<ApiApprovalPolicy> { return request(session, `/approval-policies/${id}/archive`, { method: "POST" }); },
  listRequests(session: KlerionSession, scope?: "all" | "actionable" | "overdue"): Promise<ApiApprovalRequest[]> { return request(session, `/approval-requests${scope ? `?scope=${scope}` : ""}`); },
  createRequest(session: KlerionSession, input: { policyId: string; policyVersion?: number; title: string; description?: string; context?: Record<string, unknown> }): Promise<ApiApprovalRequest> { return request(session, "/approval-requests", { method: "POST", body: JSON.stringify(input) }); },
  approve(session: KlerionSession, id: string, comment?: string): Promise<ApiApprovalRequest> { return request(session, `/approval-requests/${id}/approve`, { method: "POST", body: JSON.stringify({ comment }) }); },
  reject(session: KlerionSession, id: string, comment?: string): Promise<ApiApprovalRequest> { return request(session, `/approval-requests/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) }); },
  cancel(session: KlerionSession, id: string, reason?: string): Promise<ApiApprovalRequest> { return request(session, `/approval-requests/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }); },
};
