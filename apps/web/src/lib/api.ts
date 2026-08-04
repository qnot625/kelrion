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

export interface ApiBranch {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: "active" | "inactive";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiDepartment {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly name: string;
  readonly slug: string;
  readonly capacity: number;
}

export interface ApiServiceRequirement {
  readonly id: string;
  readonly tenantId: string;
  readonly serviceId: string;
  readonly photoIdRequired: boolean;
  readonly minAge: number | null;
  readonly maxAge: number | null;
  readonly requiredDocuments: readonly string[];
  readonly customNotes: string | null;
}

export interface ApiService {
  readonly id: string;
  readonly tenantId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly durationMinutes: number;
  readonly status: "active" | "inactive";
  readonly requirement?: ApiServiceRequirement | null;
}

export interface ApiWaitlistEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly customerEmail: string;
  readonly customerMetadata: Readonly<Record<string, unknown>>;
  readonly queuePosition: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateServiceInput {
  readonly code: string;
  readonly name: string;
  readonly description?: string | null;
  readonly durationMinutes: number;
  readonly status?: "active" | "inactive";
  readonly requirements?: {
    readonly photoIdRequired?: boolean;
    readonly minAge?: number | null;
    readonly maxAge?: number | null;
    readonly requiredDocuments?: readonly string[];
    readonly customNotes?: string | null;
  };
}

export interface ApiDiscoveredBranch {
  readonly branchId: string;
  readonly tenantId: string;
  readonly branchName: string;
  readonly status: "active" | "inactive";
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly totalCapacity: number;
  readonly activeBookingsCount: number;
  readonly offeredServiceIds: readonly string[];
  readonly loadLevel: "low" | "medium" | "high";
  readonly loadRatio: number;
  readonly distanceKm?: number;
}

export interface DiscoverBranchesQueryOptions {
  readonly tenantSlug: string;
  readonly serviceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly limit?: number;
}

export type CreateBranchInput = Omit<ApiBranch, "id" | "tenantId" | "createdAt" | "updatedAt" | "status"> & { status?: "active" | "inactive" };
export type CreateDepartmentInput = Omit<ApiDepartment, "id" | "tenantId" | "branchId">;


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

  async bookAppointment(session: KlerionSession, input: {
    customerEmail: string;
    branchId: string;
    serviceId: string;
    startAt: string;
    endAt: string;
    customerMetadata?: Record<string, unknown>;
  }): Promise<ApiAppointment> {
    return this.authorizedRequest<ApiAppointment>(session, "/appointments", {
      method: "POST",
      body: JSON.stringify(input),
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

  async rescheduleAppointment(
    session: KlerionSession,
    appointmentId: string,
    startAt: string,
    endAt: string,
  ): Promise<ApiAppointment> {
    return this.authorizedRequest<ApiAppointment>(session, `/appointments/${appointmentId}/reschedule`, {
      method: "PUT",
      body: JSON.stringify({ startAt, endAt }),
    });
  }

  async cancelAppointment(session: KlerionSession, appointmentId: string): Promise<ApiAppointment> {
    return this.authorizedRequest<ApiAppointment>(session, `/appointments/${appointmentId}/cancel`, {
      method: "PUT",
    });
  }

  async markAppointmentNoShow(session: KlerionSession, appointmentId: string): Promise<ApiAppointment> {
    return this.authorizedRequest<ApiAppointment>(session, `/appointments/${appointmentId}/no-show`, {
      method: "PUT",
    });
  }

  async listWaitlist(session: KlerionSession): Promise<ApiWaitlistEntry[]> {
    return this.authorizedRequest<ApiWaitlistEntry[]>(session, "/waitlists");
  }

  async addToWaitlist(session: KlerionSession, input: {
    branchId: string;
    serviceId: string;
    customerEmail: string;
    customerMetadata?: Record<string, unknown>;
  }): Promise<ApiWaitlistEntry> {
    return this.authorizedRequest<ApiWaitlistEntry>(session, "/waitlists", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async removeFromWaitlist(session: KlerionSession, id: string): Promise<void> {
    return this.authorizedRequest<void>(session, `/waitlists/${id}`, {
      method: "DELETE",
    });
  }

  async listAuditEvents(session: KlerionSession): Promise<ApiAuditEvent[]> {
    return this.authorizedRequest<ApiAuditEvent[]>(session, "/audit-events");
  }

  async listBranches(session: KlerionSession): Promise<ApiBranch[]> {
    return this.authorizedRequest<ApiBranch[]>(session, "/branches");
  }

  async createBranch(session: KlerionSession, input: CreateBranchInput): Promise<ApiBranch> {
    return this.authorizedRequest<ApiBranch>(session, "/branches", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listDepartments(session: KlerionSession, branchId: string): Promise<ApiDepartment[]> {
    return this.authorizedRequest<ApiDepartment[]>(session, `/branches/${branchId}/departments`);
  }

  async createDepartment(
    session: KlerionSession,
    branchId: string,
    input: CreateDepartmentInput,
  ): Promise<ApiDepartment> {
    return this.authorizedRequest<ApiDepartment>(session, `/branches/${branchId}/departments`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listServices(session: KlerionSession): Promise<ApiService[]> {
    return this.authorizedRequest<ApiService[]>(session, "/services");
  }

  async createService(session: KlerionSession, input: CreateServiceInput): Promise<ApiService> {
    return this.authorizedRequest<ApiService>(session, "/services", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listBranchServices(session: KlerionSession, branchId: string): Promise<ApiService[]> {
    return this.authorizedRequest<ApiService[]>(session, `/branches/${branchId}/services`);
  }

  async assignServiceToBranch(
    session: KlerionSession,
    branchId: string,
    serviceId: string,
  ): Promise<{ id: string; tenantId: string; branchId: string; serviceId: string; status: string }> {
    return this.authorizedRequest(session, `/branches/${branchId}/services`, {
      method: "POST",
      body: JSON.stringify({ serviceId }),
    });
  }

  async removeServiceFromBranch(
    session: KlerionSession,
    branchId: string,
    serviceId: string,
  ): Promise<void> {
    return this.authorizedRequest(session, `/branches/${branchId}/services/${serviceId}`, {
      method: "DELETE",
    });
  }

  async getPublicServices(tenantSlug: string): Promise<ApiService[]> {
    return this.request<ApiService[]>("/services", {
      headers: { "X-Tenant-Slug": tenantSlug },
    });
  }

  async getPublicBranchServices(tenantSlug: string, branchId: string): Promise<ApiService[]> {
    return this.request<ApiService[]>(`/branches/${branchId}/services`, {
      headers: { "X-Tenant-Slug": tenantSlug },
    });
  }

  async bookPublicAppointment(tenantSlug: string, input: {
    customerEmail: string;
    branchId: string;
    serviceId: string;
    startAt: string;
    endAt: string;
    customerMetadata?: Record<string, unknown>;
  }): Promise<ApiAppointment> {
    return this.request<ApiAppointment>("/appointments", {
      method: "POST",
      headers: { "X-Tenant-Slug": tenantSlug },
      body: JSON.stringify(input),
    });
  }

  async discoverBranches(options: DiscoverBranchesQueryOptions): Promise<ApiDiscoveredBranch[]> {
    const params = new URLSearchParams();
    if (options.serviceId) params.set("serviceId", options.serviceId);
    if (options.latitude !== undefined) params.set("latitude", options.latitude.toString());
    if (options.longitude !== undefined) params.set("longitude", options.longitude.toString());
    if (options.limit !== undefined) params.set("limit", options.limit.toString());

    const queryString = params.toString() ? `?${params.toString()}` : "";
    return this.request<ApiDiscoveredBranch[]>(`/branches/discover${queryString}`, {
      headers: { "X-Tenant-Slug": options.tenantSlug },
    });
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
