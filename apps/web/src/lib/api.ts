import { decodeTokenRoles, type KlerionSession } from "./session";

const DEFAULT_API_BASE_URL = "/api";

export interface SignInRequest {
  readonly mode: "signin";
  readonly tenantSlug: string;
  readonly email: string;
  readonly password: string;
}

export interface SignUpRequest {
  readonly mode: "signup";
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
}

export type AuthenticationRequest = SignInRequest | SignUpRequest;

interface TenantResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface AuthResponse {
  readonly userId: string;
  readonly token: string;
}

export interface ApiUser {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly createdAt: string;
}

export interface ApiAppointment {
  readonly id: string;
  readonly tenantId: string;
  readonly customerEmail: string;
  readonly serviceName: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface ApiAuditEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly previousHash: string | null;
  readonly hash: string;
}

export type ApiLeaveType = "annual" | "sick" | "parental" | "unpaid" | "other";
export type ApiLeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApiLeaveRequest {
  readonly id: string;
  readonly requesterUserId: string;
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
  readonly subjectUserId: string;
  readonly kind: "onboarding" | "offboarding";
  readonly title: string;
  readonly dueAt: string | null;
  readonly status: "active" | "completed" | "cancelled";
  readonly steps: readonly ApiLifecycleStep[];
  readonly createdAt: string;
}

export class KlerionApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "KlerionApiError";
  }
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export class KlerionApi {
  private readonly baseUrl: string;

  constructor(baseUrl = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  async health(): Promise<boolean> {
    try {
      await this.request<{ status: string }>("/health");
      return true;
    } catch {
      return false;
    }
  }

  async authenticate(input: AuthenticationRequest): Promise<KlerionSession> {
    let tenantName = input.tenantSlug;

    if (input.mode === "signup") {
      const tenant = await this.request<TenantResponse>("/tenants", {
        method: "POST",
        body: JSON.stringify({ name: input.tenantName, slug: input.tenantSlug }),
      });
      tenantName = tenant.name;
    }

    const result = await this.request<AuthResponse>(
      input.mode === "signup" ? "/auth/signup" : "/auth/login",
      {
        method: "POST",
        headers: { "X-Tenant-Slug": input.tenantSlug },
        body: JSON.stringify({ email: input.email, password: input.password }),
      },
    );

    return {
      mode: "live",
      tenantSlug: input.tenantSlug,
      tenantName,
      email: input.email,
      userId: result.userId,
      roles: decodeTokenRoles(result.token),
      token: result.token,
    };
  }

  async listUsers(session: KlerionSession): Promise<ApiUser[]> {
    return this.authorizedRequest<ApiUser[]>(session, "/users");
  }

  async updateUserRoles(
    session: KlerionSession,
    userId: string,
    roles: readonly string[],
  ): Promise<ApiUser> {
    return this.authorizedRequest<ApiUser>(session, `/users/${userId}/roles`, {
      method: "PATCH",
      body: JSON.stringify({ roles }),
    });
  }

  async listAppointments(session: KlerionSession): Promise<ApiAppointment[]> {
    return this.authorizedRequest<ApiAppointment[]>(session, "/appointments");
  }

  async checkInAppointment(session: KlerionSession, appointmentId: string): Promise<ApiAppointment> {
    return this.authorizedRequest<ApiAppointment>(session, `/appointments/${appointmentId}/check-in`, { method: "POST" });
  }

  async completeAppointment(session: KlerionSession, appointmentId: string): Promise<ApiAppointment> {
    return this.authorizedRequest<ApiAppointment>(session, `/appointments/${appointmentId}/complete`, { method: "POST" });
  }

  async listAuditEvents(session: KlerionSession): Promise<ApiAuditEvent[]> {
    return this.authorizedRequest<ApiAuditEvent[]>(session, "/audit-events");
  }

  async listLeaveRequests(session: KlerionSession, scope: "mine" | "all"): Promise<ApiLeaveRequest[]> {
    return this.authorizedRequest<ApiLeaveRequest[]>(
      session,
      `/leave-requests${scope === "all" ? "?scope=all" : ""}`,
    );
  }

  async listLeaveBalances(session: KlerionSession): Promise<ApiLeaveBalance[]> {
    return this.authorizedRequest<ApiLeaveBalance[]>(session, "/leave-balances");
  }

  async submitLeaveRequest(
    session: KlerionSession,
    input: { type: ApiLeaveType; startDate: string; endDate: string; reason: string },
  ): Promise<ApiLeaveRequest> {
    return this.authorizedRequest<ApiLeaveRequest>(session, "/leave-requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async decideLeaveRequest(
    session: KlerionSession,
    id: string,
    decision: "approve" | "reject",
    note?: string,
  ): Promise<ApiLeaveRequest> {
    return this.authorizedRequest<ApiLeaveRequest>(
      session,
      `/leave-requests/${id}/${decision}`,
      { method: "POST", body: JSON.stringify({ note }) },
    );
  }

  async cancelLeaveRequest(session: KlerionSession, id: string): Promise<ApiLeaveRequest> {
    return this.authorizedRequest<ApiLeaveRequest>(session, `/leave-requests/${id}/cancel`, {
      method: "POST",
    });
  }

  async listLifecyclePlans(session: KlerionSession): Promise<ApiLifecyclePlan[]> {
    return this.authorizedRequest<ApiLifecyclePlan[]>(session, "/lifecycle-plans");
  }

  async createLifecyclePlan(
    session: KlerionSession,
    input: {
      subjectUserId: string;
      kind: "onboarding" | "offboarding";
      title?: string;
      dueAt?: string;
    },
  ): Promise<ApiLifecyclePlan> {
    return this.authorizedRequest<ApiLifecyclePlan>(session, "/lifecycle-plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async completeLifecycleStep(
    session: KlerionSession,
    planId: string,
    stepId: string,
  ): Promise<ApiLifecyclePlan> {
    return this.authorizedRequest<ApiLifecyclePlan>(
      session,
      `/lifecycle-plans/${planId}/steps/${stepId}/complete`,
      { method: "POST" },
    );
  }

  private authorizedRequest<T>(
    session: KlerionSession,
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    if (!session.token) {
      throw new KlerionApiError("This action requires a live API session.", 401);
    }
    return this.request<T>(path, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${session.token}`,
        "X-Tenant-Slug": session.tenantSlug,
      },
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    const body = (await response.json().catch(() => null)) as
      | { error?: unknown }
      | T
      | null;

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : `Request failed with status ${response.status}`;
      throw new KlerionApiError(message, response.status);
    }

    return body as T;
  }
}

export const klerionApi = new KlerionApi();
