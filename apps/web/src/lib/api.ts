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

export interface ApiEmployee {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone?: string | null;
  readonly departmentId?: string | null;
  readonly positionId?: string | null;
  readonly managerId?: string | null;
  readonly branchId?: string | null;
  readonly employmentType: "full_time" | "part_time" | "contract" | "intern" | "temporary";
  readonly employmentStatus: "active" | "on_leave" | "terminated" | "suspended";
  readonly hireDate: string;
  readonly terminationDate?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiEmployeeListResponse {
  readonly data: readonly ApiEmployee[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface ApiAttendanceEvent {
  readonly id: string;
  readonly type: "clock_in" | "clock_out" | "break_start" | "break_end";
  readonly timestamp: string;
  readonly workDate: string;
  readonly idempotencyKey: string;
  readonly source?: string;
}

export interface ApiAttendanceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly status: "clocked_in" | "clocked_out" | "on_break";
  readonly clockInTime?: string | null;
  readonly clockOutTime?: string | null;
  readonly totalWorkMinutes: number;
  readonly totalBreakMinutes: number;
  readonly events: readonly ApiAttendanceEvent[];
}

export interface ApiAttendanceSummary {
  readonly employeeId: string;
  readonly workDate: string;
  readonly status: "clocked_in" | "clocked_out" | "on_break";
  readonly clockInTime?: string | null;
  readonly clockOutTime?: string | null;
  readonly totalWorkMinutes: number;
  readonly totalBreakMinutes: number;
}

export interface ClockActionRequest {
  readonly employeeId: string;
  readonly workDate?: string;
  readonly timestamp?: string;
  readonly idempotencyKey?: string;
  readonly source?: string;
  readonly location?: { latitude: number; longitude: number; accuracy?: number } | null;
  readonly notes?: string;
}

export interface ClockActionResponse {
  readonly message: string;
  readonly record: ApiAttendanceRecord;
  readonly summary: ApiAttendanceSummary;
}

export interface ApiAttendanceCorrection {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly targetEventId?: string | null;
  readonly requestedEventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  readonly requestedTimestamp: string;
  readonly reason: string;
  readonly status: "pending" | "approved" | "rejected";
  readonly reviewedByUserId?: string | null;
  readonly reviewedAt?: string | null;
  readonly reviewNotes?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListCorrectionsParams {
  employeeId?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
  offset?: number;
}

export interface ListCorrectionsResponse {
  readonly corrections: readonly ApiAttendanceCorrection[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface SyncAttendanceBatchPayload {
  readonly batchId?: string;
  readonly submittedAt?: string;
  readonly deviceId?: string;
  readonly events: readonly {
    readonly id: string;
    readonly eventId: string;
    readonly tenantId: string;
    readonly employeeId: string;
    readonly eventType: "clock_in" | "clock_out" | "break_start" | "break_end";
    readonly timestamp: string;
    readonly workDate: string;
    readonly idempotencyKey: string;
    readonly source: "web";
    readonly location?: { latitude: number; longitude: number; accuracy?: number } | null;
    readonly notes?: string;
  }[];
}

export interface SyncAttendanceBatchResult {
  readonly batchId: string;
  readonly totalSubmitted: number;
  readonly processedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly results: readonly {
    readonly id: string;
    readonly status: "processed" | "duplicate" | "rejected";
    readonly error?: string;
  }[];
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

  constructor(baseUrl = import.meta.env?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL) {
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

  async listEmployees(
    session: KlerionSession,
    params: {
      search?: string;
      departmentId?: string;
      employmentStatus?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<ApiEmployeeListResponse> {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.departmentId) query.set("departmentId", params.departmentId);
    if (params.employmentStatus) query.set("employmentStatus", params.employmentStatus);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const queryString = query.toString();
    const path = `/employees${queryString ? `?${queryString}` : ""}`;
    return this.authorizedRequest<ApiEmployeeListResponse>(session, path);
  }

  async getEmployee(session: KlerionSession, id: string): Promise<ApiEmployee> {
    return this.authorizedRequest<ApiEmployee>(session, `/employees/${id}`);
  }

  async createEmployee(
    session: KlerionSession,
    payload: {
      employeeNumber: string;
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      departmentId?: string;
      positionId?: string;
      managerId?: string;
      branchId?: string;
      employmentType: string;
      hireDate: string;
    },
  ): Promise<ApiEmployee> {
    return this.authorizedRequest<ApiEmployee>(session, "/employees", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateEmployee(
    session: KlerionSession,
    id: string,
    payload: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      departmentId?: string;
      positionId?: string;
      branchId?: string;
      employmentType?: string;
    },
  ): Promise<ApiEmployee> {
    return this.authorizedRequest<ApiEmployee>(session, `/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async assignManager(
    session: KlerionSession,
    id: string,
    managerId: string | null,
  ): Promise<ApiEmployee> {
    return this.authorizedRequest<ApiEmployee>(session, `/employees/${id}/manager`, {
      method: "PATCH",
      body: JSON.stringify({ managerId }),
    });
  }

  async updateEmployeeStatus(
    session: KlerionSession,
    id: string,
    action: "suspend" | "reactivate" | "terminate",
    reason?: string,
    terminationDate?: string,
  ): Promise<ApiEmployee> {
    return this.authorizedRequest<ApiEmployee>(session, `/employees/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason, terminationDate }),
    });
  }

  async deleteEmployee(session: KlerionSession, id: string): Promise<{ success: boolean; id: string }> {
    return this.authorizedRequest<{ success: boolean; id: string }>(session, `/employees/${id}`, {
      method: "DELETE",
    });
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

  // Time & Attendance Endpoints
  async clockIn(session: KlerionSession, payload: ClockActionRequest): Promise<ClockActionResponse> {
    return this.authorizedRequest<ClockActionResponse>(session, "/attendance/clock-in", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async clockOut(session: KlerionSession, payload: ClockActionRequest): Promise<ClockActionResponse> {
    return this.authorizedRequest<ClockActionResponse>(session, "/attendance/clock-out", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async startBreak(session: KlerionSession, payload: ClockActionRequest): Promise<ClockActionResponse> {
    return this.authorizedRequest<ClockActionResponse>(session, "/attendance/break-start", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async endBreak(session: KlerionSession, payload: ClockActionRequest): Promise<ClockActionResponse> {
    return this.authorizedRequest<ClockActionResponse>(session, "/attendance/break-end", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getEmployeeAttendance(
    session: KlerionSession,
    employeeId: string,
    workDate?: string
  ): Promise<{ record: ApiAttendanceRecord | null; summary: ApiAttendanceSummary | null }> {
    const query = workDate ? `?workDate=${encodeURIComponent(workDate)}` : "";
    return this.authorizedRequest<{ record: ApiAttendanceRecord | null; summary: ApiAttendanceSummary | null }>(
      session,
      `/attendance/employee/${employeeId}${query}`
    );
  }

  async syncAttendance(
    session: KlerionSession,
    payload: SyncAttendanceBatchPayload
  ): Promise<SyncAttendanceBatchResult> {
    return this.authorizedRequest<SyncAttendanceBatchResult>(session, "/attendance/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async listAttendanceSummaries(
    session: KlerionSession,
    params: { startDate?: string; endDate?: string; employeeId?: string } = {}
  ): Promise<{ summaries: ApiAttendanceSummary[]; count: number }> {
    const queryParts: string[] = [];
    if (params.startDate) queryParts.push(`startDate=${encodeURIComponent(params.startDate)}`);
    if (params.endDate) queryParts.push(`endDate=${encodeURIComponent(params.endDate)}`);
    if (params.employeeId) queryParts.push(`employeeId=${encodeURIComponent(params.employeeId)}`);
    const query = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return this.authorizedRequest<{ summaries: ApiAttendanceSummary[]; count: number }>(
      session,
      `/attendance/summary${query}`
    );
  }

  async listAttendanceCorrections(
    session: KlerionSession,
    params: ListCorrectionsParams = {}
  ): Promise<ListCorrectionsResponse> {
    const queryParts: string[] = [];
    if (params.employeeId) queryParts.push(`employeeId=${encodeURIComponent(params.employeeId)}`);
    if (params.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params.limit) queryParts.push(`limit=${params.limit}`);
    if (params.offset) queryParts.push(`offset=${params.offset}`);
    const query = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return this.authorizedRequest<ListCorrectionsResponse>(
      session,
      `/attendance/corrections${query}`
    );
  }

  async createAttendanceCorrection(
    session: KlerionSession,
    payload: {
      employeeId: string;
      targetEventId?: string;
      requestedEventType: "clock_in" | "clock_out" | "break_start" | "break_end";
      requestedTimestamp: string;
      reason: string;
    }
  ): Promise<{ message: string; correction: ApiAttendanceCorrection }> {
    return this.authorizedRequest<{ message: string; correction: ApiAttendanceCorrection }>(
      session,
      "/attendance/corrections",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  async approveAttendanceCorrection(
    session: KlerionSession,
    id: string,
    reviewNotes?: string
  ): Promise<{ message: string; correction: ApiAttendanceCorrection; attendanceRecord: ApiAttendanceRecord }> {
    return this.authorizedRequest<{ message: string; correction: ApiAttendanceCorrection; attendanceRecord: ApiAttendanceRecord }>(
      session,
      `/attendance/corrections/${id}/approve`,
      {
        method: "POST",
        body: JSON.stringify({ reviewNotes }),
      }
    );
  }

  async rejectAttendanceCorrection(
    session: KlerionSession,
    id: string,
    reviewNotes?: string
  ): Promise<{ message: string; correction: ApiAttendanceCorrection }> {
    return this.authorizedRequest<{ message: string; correction: ApiAttendanceCorrection }>(
      session,
      `/attendance/corrections/${id}/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reviewNotes }),
      }
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
