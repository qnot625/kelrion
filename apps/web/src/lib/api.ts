import { decodeTokenRoles, type KlerionSession, type ModuleKey } from "./session";
import type { PlatformSession } from "./platform-session";

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
  readonly enabledModules: readonly ModuleKey[];
  readonly billingCycle: "monthly" | "annual";
  readonly currency: "NGN" | "USD" | "GBP" | "EUR";
}

export type AuthenticationRequest = SignInRequest | SignUpRequest;

export interface TenantResponse {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

interface AuthResponse {
  readonly userId: string;
  readonly token: string;
}

interface OrganisationSignupResponse extends AuthResponse {
  readonly tenant: TenantResponse;
  readonly subscription: ApiSubscription;
}

export interface ApiModuleDefinition {
  readonly key: ModuleKey;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly dependencies: readonly ModuleKey[];
  readonly prices: Readonly<Record<"NGN" | "USD" | "GBP" | "EUR", number>>;
  readonly availability: "live" | "preview";
  readonly enabled?: boolean;
}

export interface ApiSubscription {
  readonly id: string;
  readonly tenantId: string;
  readonly enabledModules: readonly ModuleKey[];
  readonly billingCycle: "monthly" | "annual";
  readonly currency: "NGN" | "USD" | "GBP" | "EUR";
  readonly status: "trialing" | "active" | "past_due" | "suspended" | "cancelled";
  readonly trialEndsAt: string | null;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly unitAmount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiEntitlements {
  readonly subscriptionStatus: ApiSubscription["status"];
  readonly enabledModules: readonly ModuleKey[];
  readonly modules: readonly ApiModuleDefinition[];
}

export interface ApiInvoiceLineItem {
  readonly moduleKey: ModuleKey;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly amount: number;
}

export interface ApiInvoice {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly currency: ApiSubscription["currency"];
  readonly billingCycle: ApiSubscription["billingCycle"];
  readonly status: "draft" | "open" | "paid" | "overdue" | "void";
  readonly lineItems: readonly ApiInvoiceLineItem[];
  readonly amountDue: number;
  readonly amountPaid: number;
  readonly issuedAt: string;
  readonly dueAt: string;
  readonly paidAt: string | null;
  readonly paymentReference: string | null;
}

export interface PlatformOrganisationSummary extends TenantResponse {
  readonly status: "provisioning" | "active" | "suspended";
  readonly createdAt: string;
  readonly subscription: ApiSubscription | null;
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


export interface ApiBranch {
  readonly id: string;
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: "active" | "inactive";
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface ApiOperatingWindow {
  readonly dayOfWeek: number;
  readonly openMinutes: number;
  readonly closeMinutes: number;
}

export interface ApiHoliday {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly name: string;
  readonly startAt: string;
  readonly endAt: string;
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
  readonly id?: string;
  readonly tenantId?: string;
  readonly serviceId?: string;
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
  readonly requirement: ApiServiceRequirement | null;
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
  constructor(message: string, readonly status: number) {
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

  moduleCatalogue(): Promise<ApiModuleDefinition[]> {
    return this.request<ApiModuleDefinition[]>("/module-catalogue");
  }

  async authenticate(input: AuthenticationRequest): Promise<KlerionSession> {
    if (input.mode === "signup") {
      const result = await this.request<OrganisationSignupResponse>("/organisations/signup", {
        method: "POST",
        body: JSON.stringify({
          name: input.tenantName,
          slug: input.tenantSlug,
          ownerEmail: input.email,
          ownerPassword: input.password,
          enabledModules: input.enabledModules,
          billingCycle: input.billingCycle,
          currency: input.currency,
          trialDays: 14,
        }),
      });
      return {
        mode: "live",
        tenantSlug: result.tenant.slug,
        tenantName: result.tenant.name,
        email: input.email,
        userId: result.userId,
        roles: decodeTokenRoles(result.token),
        enabledModules: result.subscription.enabledModules,
        token: result.token,
      };
    }

    const result = await this.request<AuthResponse>("/auth/login", {
      method: "POST",
      headers: { "X-Tenant-Slug": input.tenantSlug },
      body: JSON.stringify({ email: input.email, password: input.password }),
    });
    const provisional: KlerionSession = {
      mode: "live",
      tenantSlug: input.tenantSlug,
      tenantName: input.tenantSlug,
      email: input.email,
      userId: result.userId,
      roles: decodeTokenRoles(result.token),
      enabledModules: [],
      token: result.token,
    };
    const [organisation, entitlements] = await Promise.all([
      this.authorizedRequest<TenantResponse>(provisional, "/organisation"),
      this.getEntitlements(provisional),
    ]);
    return { ...provisional, tenantName: organisation.name, enabledModules: entitlements.enabledModules };
  }

  getEntitlements(session: KlerionSession): Promise<ApiEntitlements> {
    return this.authorizedRequest<ApiEntitlements>(session, "/entitlements");
  }

  getSubscription(session: KlerionSession): Promise<ApiSubscription> {
    return this.authorizedRequest<ApiSubscription>(session, "/billing/subscription");
  }

  listBillingInvoices(session: KlerionSession): Promise<ApiInvoice[]> {
    return this.authorizedRequest<ApiInvoice[]>(session, "/billing/invoices");
  }

  async platformBootstrap(email: string, password: string, bootstrapKey?: string): Promise<PlatformSession> {
    const result = await this.request<{ adminId: string; token: string }>("/platform/auth/bootstrap", {
      method: "POST",
      headers: bootstrapKey ? { "X-Platform-Bootstrap-Key": bootstrapKey } : undefined,
      body: JSON.stringify({ email, password }),
    });
    return { ...result, email };
  }

  async platformLogin(email: string, password: string): Promise<PlatformSession> {
    const result = await this.request<{ adminId: string; token: string }>("/platform/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return { ...result, email };
  }

  listPlatformModules(session: PlatformSession): Promise<ApiModuleDefinition[]> {
    return this.platformRequest(session, "/platform/modules");
  }

  listPlatformOrganisations(session: PlatformSession): Promise<PlatformOrganisationSummary[]> {
    return this.platformRequest(session, "/platform/organisations");
  }

  createPlatformOrganisation(
    session: PlatformSession,
    input: {
      name: string;
      slug: string;
      ownerEmail: string;
      ownerPassword: string;
      enabledModules: readonly ModuleKey[];
      billingCycle: ApiSubscription["billingCycle"];
      currency: ApiSubscription["currency"];
      trialDays: number;
    },
  ): Promise<PlatformOrganisationSummary> {
    return this.platformRequest(session, "/platform/organisations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  updatePlatformOrganisationStatus(
    session: PlatformSession,
    tenantId: string,
    status: PlatformOrganisationSummary["status"],
  ): Promise<PlatformOrganisationSummary> {
    return this.platformRequest(session, `/platform/organisations/${tenantId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  updatePlatformSubscription(
    session: PlatformSession,
    tenantId: string,
    input: Partial<Pick<ApiSubscription, "enabledModules" | "billingCycle" | "currency" | "status">>,
  ): Promise<ApiSubscription> {
    return this.platformRequest(session, `/platform/organisations/${tenantId}/subscription`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  listPlatformInvoices(session: PlatformSession, tenantId?: string): Promise<ApiInvoice[]> {
    return this.platformRequest(session, `/platform/invoices${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`);
  }

  markPlatformInvoicePaid(session: PlatformSession, invoiceId: string, paymentReference: string): Promise<ApiInvoice> {
    return this.platformRequest(session, `/platform/invoices/${invoiceId}/mark-paid`, {
      method: "POST",
      body: JSON.stringify({ paymentReference }),
    });
  }


  listBranches(session: KlerionSession): Promise<ApiBranch[]> {
    return this.authorizedRequest<ApiBranch[]>(session, "/branches");
  }

  createBranch(
    session: KlerionSession,
    input: Omit<ApiBranch, "id" | "tenantId" | "status"> & { status?: ApiBranch["status"] },
  ): Promise<ApiBranch> {
    return this.authorizedRequest<ApiBranch>(session, "/branches", { method: "POST", body: JSON.stringify(input) });
  }

  updateBranch(session: KlerionSession, branchId: string, input: Partial<Omit<ApiBranch, "id" | "tenantId">>): Promise<ApiBranch> {
    return this.authorizedRequest<ApiBranch>(session, `/branches/${branchId}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  listDepartments(session: KlerionSession, branchId: string): Promise<ApiDepartment[]> {
    return this.authorizedRequest<ApiDepartment[]>(session, `/branches/${branchId}/departments`);
  }

  createDepartment(session: KlerionSession, branchId: string, input: Pick<ApiDepartment, "name" | "slug" | "capacity">): Promise<ApiDepartment> {
    return this.authorizedRequest<ApiDepartment>(session, `/branches/${branchId}/departments`, { method: "POST", body: JSON.stringify(input) });
  }

  updateDepartment(session: KlerionSession, departmentId: string, input: Partial<Pick<ApiDepartment, "name" | "slug" | "capacity">>): Promise<ApiDepartment> {
    return this.authorizedRequest<ApiDepartment>(session, `/departments/${departmentId}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  deleteDepartment(session: KlerionSession, departmentId: string): Promise<void> {
    return this.authorizedRequest<void>(session, `/departments/${departmentId}`, { method: "DELETE" });
  }

  getOperatingWindows(session: KlerionSession, branchId: string): Promise<ApiOperatingWindow[]> {
    return this.authorizedRequest<ApiOperatingWindow[]>(session, `/branches/${branchId}/operating-windows`);
  }

  setOperatingWindows(session: KlerionSession, branchId: string, windows: readonly ApiOperatingWindow[]): Promise<{ success: true }> {
    return this.authorizedRequest<{ success: true }>(session, `/branches/${branchId}/operating-windows`, { method: "PUT", body: JSON.stringify({ windows }) });
  }

  listBranchHolidays(session: KlerionSession, branchId: string): Promise<ApiHoliday[]> {
    return this.authorizedRequest<ApiHoliday[]>(session, `/branches/${branchId}/holidays`);
  }

  createBranchHoliday(session: KlerionSession, branchId: string, input: Pick<ApiHoliday, "name" | "startAt" | "endAt">): Promise<ApiHoliday> {
    return this.authorizedRequest<ApiHoliday>(session, `/branches/${branchId}/holidays`, { method: "POST", body: JSON.stringify(input) });
  }

  deleteHoliday(session: KlerionSession, holidayId: string): Promise<void> {
    return this.authorizedRequest<void>(session, `/holidays/${holidayId}`, { method: "DELETE" });
  }

  listServices(session: KlerionSession): Promise<ApiService[]> {
    return this.authorizedRequest<ApiService[]>(session, "/services");
  }

  createService(
    session: KlerionSession,
    input: Omit<ApiService, "id" | "tenantId" | "requirement"> & { requirements?: Omit<ApiServiceRequirement, "id" | "tenantId" | "serviceId"> },
  ): Promise<ApiService> {
    return this.authorizedRequest<ApiService>(session, "/services", { method: "POST", body: JSON.stringify(input) });
  }

  updateService(session: KlerionSession, serviceId: string, input: Partial<Omit<ApiService, "id" | "tenantId" | "requirement">>): Promise<ApiService> {
    return this.authorizedRequest<ApiService>(session, `/services/${serviceId}`, { method: "PATCH", body: JSON.stringify(input) });
  }

  setServiceRequirement(
    session: KlerionSession,
    serviceId: string,
    input: Omit<ApiServiceRequirement, "id" | "tenantId" | "serviceId">,
  ): Promise<ApiServiceRequirement> {
    return this.authorizedRequest<ApiServiceRequirement>(session, `/services/${serviceId}/requirements`, { method: "PUT", body: JSON.stringify(input) });
  }

  listBranchServices(session: KlerionSession, branchId: string): Promise<ApiService[]> {
    return this.authorizedRequest<ApiService[]>(session, `/branches/${branchId}/services`);
  }

  assignServiceToBranch(session: KlerionSession, branchId: string, serviceId: string): Promise<{ id: string }> {
    return this.authorizedRequest<{ id: string }>(session, `/branches/${branchId}/services`, { method: "POST", body: JSON.stringify({ serviceId }) });
  }

  removeServiceFromBranch(session: KlerionSession, branchId: string, serviceId: string): Promise<void> {
    return this.authorizedRequest<void>(session, `/branches/${branchId}/services/${serviceId}`, { method: "DELETE" });
  }

  discoverBranches(
    session: KlerionSession,
    query: { serviceId?: string; latitude?: number; longitude?: number; limit?: number } = {},
  ): Promise<ApiDiscoveredBranch[]> {
    const params = new URLSearchParams();
    if (query.serviceId) params.set("serviceId", query.serviceId);
    if (query.latitude !== undefined) params.set("latitude", String(query.latitude));
    if (query.longitude !== undefined) params.set("longitude", String(query.longitude));
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size ? `?${params.toString()}` : "";
    return this.authorizedRequest<ApiDiscoveredBranch[]>(session, `/branches/discover${suffix}`);
  }

  async listUsers(session: KlerionSession): Promise<ApiUser[]> {
    return this.authorizedRequest<ApiUser[]>(session, "/users");
  }

  async updateUserRoles(session: KlerionSession, userId: string, roles: readonly string[]): Promise<ApiUser> {
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
    return this.authorizedRequest<ApiLeaveRequest[]>(session, `/leave-requests${scope === "all" ? "?scope=all" : ""}`);
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
    return this.authorizedRequest<ApiLeaveRequest>(session, `/leave-requests/${id}/${decision}`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  }

  async cancelLeaveRequest(session: KlerionSession, id: string): Promise<ApiLeaveRequest> {
    return this.authorizedRequest<ApiLeaveRequest>(session, `/leave-requests/${id}/cancel`, { method: "POST" });
  }

  async listLifecyclePlans(session: KlerionSession): Promise<ApiLifecyclePlan[]> {
    return this.authorizedRequest<ApiLifecyclePlan[]>(session, "/lifecycle-plans");
  }

  async createLifecyclePlan(
    session: KlerionSession,
    input: { subjectUserId: string; kind: "onboarding" | "offboarding"; title?: string; dueAt?: string },
  ): Promise<ApiLifecyclePlan> {
    return this.authorizedRequest<ApiLifecyclePlan>(session, "/lifecycle-plans", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async completeLifecycleStep(session: KlerionSession, planId: string, stepId: string): Promise<ApiLifecyclePlan> {
    return this.authorizedRequest<ApiLifecyclePlan>(session, `/lifecycle-plans/${planId}/steps/${stepId}/complete`, { method: "POST" });
  }

  private platformRequest<T>(session: PlatformSession, path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${session.token}` },
    });
  }

  private authorizedRequest<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
    if (!session.token) throw new KlerionApiError("This action requires a live API session.", 401);
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
    const body = (await response.json().catch(() => null)) as { error?: unknown } | T | null;
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed with status ${response.status}`;
      throw new KlerionApiError(message, response.status);
    }
    return body as T;
  }
}

export const klerionApi = new KlerionApi();
