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
