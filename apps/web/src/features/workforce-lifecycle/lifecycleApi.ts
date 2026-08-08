import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type ApiLeaveType = "annual" | "sick" | "parental" | "unpaid" | "other";
export type ApiLeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApiLeaveRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly requesterUserId: string | null;
  readonly requesterEmployeeId: string | null;
  readonly type: ApiLeaveType;
  readonly startDate: string;
  readonly endDate: string;
  readonly workingDays: number;
  readonly reason: string;
  readonly status: ApiLeaveStatus;
  readonly decisionNote: string | null;
  readonly createdAt: string;
}

export interface ApiLeaveBalance {
  readonly type: ApiLeaveType;
  readonly allocatedDays: number | null;
  readonly approvedDays: number;
  readonly pendingDays: number;
  readonly remainingDays: number | null;
}

export interface ApiLifecycleStep {
  readonly id: string;
  readonly title: string;
  readonly ownerRole: string;
  readonly status: "pending" | "completed";
  readonly completedAt: string | null;
}

export interface ApiLifecyclePlan {
  readonly id: string;
  readonly tenantId: string;
  readonly subjectEmployeeId: string | null;
  readonly subjectUserId: string | null;
  readonly kind: "onboarding" | "offboarding";
  readonly title: string;
  readonly dueAt: string | null;
  readonly status: "active" | "completed" | "cancelled";
  readonly steps: readonly ApiLifecycleStep[];
  readonly createdAt: string;
}

class LifecycleApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "LifecycleApiError";
  }
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function authorizedRequest<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
  if (!session.token) throw new LifecycleApiError("This action requires a live API session.", 401);
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
  const body = (await response.json().catch(() => null)) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${response.status}`;
    throw new LifecycleApiError(message, response.status);
  }
  return body as T;
}

export const lifecycleApi = {
  listLeaveRequests(session: KlerionSession, scope: "mine" | "all"): Promise<ApiLeaveRequest[]> {
    return authorizedRequest<ApiLeaveRequest[]>(session, `/leave-requests${scope === "all" ? "?scope=all" : ""}`);
  },

  listLeaveBalances(session: KlerionSession): Promise<ApiLeaveBalance[]> {
    return authorizedRequest<ApiLeaveBalance[]>(session, "/leave-balances");
  },

  submitLeaveRequest(
    session: KlerionSession,
    input: { type: ApiLeaveType; startDate: string; endDate: string; reason: string },
  ): Promise<ApiLeaveRequest> {
    return authorizedRequest<ApiLeaveRequest>(session, "/leave-requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  decideLeaveRequest(
    session: KlerionSession,
    id: string,
    decision: "approve" | "reject",
    note?: string,
  ): Promise<ApiLeaveRequest> {
    return authorizedRequest<ApiLeaveRequest>(session, `/leave-requests/${id}/${decision}`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },

  cancelLeaveRequest(session: KlerionSession, id: string): Promise<ApiLeaveRequest> {
    return authorizedRequest<ApiLeaveRequest>(session, `/leave-requests/${id}/cancel`, { method: "POST" });
  },

  listLifecyclePlans(session: KlerionSession): Promise<ApiLifecyclePlan[]> {
    return authorizedRequest<ApiLifecyclePlan[]>(session, "/lifecycle-plans");
  },

  createLifecyclePlan(
    session: KlerionSession,
    input: { subjectEmployeeId: string; kind: "onboarding" | "offboarding"; title?: string; dueAt?: string },
  ): Promise<ApiLifecyclePlan> {
    return authorizedRequest<ApiLifecyclePlan>(session, "/lifecycle-plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  completeLifecycleStep(session: KlerionSession, planId: string, stepId: string): Promise<ApiLifecyclePlan> {
    return authorizedRequest<ApiLifecyclePlan>(session, `/lifecycle-plans/${planId}/steps/${stepId}/complete`, {
      method: "POST",
    });
  },

  cancelLifecyclePlan(session: KlerionSession, planId: string): Promise<ApiLifecyclePlan> {
    return authorizedRequest<ApiLifecyclePlan>(session, `/lifecycle-plans/${planId}/cancel`, { method: "POST" });
  },
};
