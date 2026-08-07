import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type ApiEmploymentType = "full_time" | "part_time" | "contract" | "intern" | "temporary";
export type ApiEmploymentStatus = "active" | "on_leave" | "suspended" | "terminated";

export interface ApiEmployee {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly hireDate: string;
  readonly employmentType: ApiEmploymentType;
  readonly employmentStatus: ApiEmploymentStatus;
  readonly departmentId: string | null;
  readonly positionId: string | null;
  readonly managerId: string | null;
  readonly branchId: string | null;
  readonly terminationDate: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiEmployeeList {
  readonly data: readonly ApiEmployee[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export type ApiAttendanceAction = "clock_in" | "clock_out" | "break_start" | "break_end";

export interface ApiAttendanceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly status: "idle" | "clocked_in" | "on_break" | "clocked_out";
  readonly clockInAt: string | null;
  readonly clockOutAt: string | null;
  readonly breaks: readonly {
    readonly id: string;
    readonly startedAt: string;
    readonly endedAt: string | null;
    readonly durationMinutes: number | null;
  }[];
  readonly activeDurationMinutes: number;
  readonly totalBreakMinutes: number;
  readonly exceptions: readonly Record<string, unknown>[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiAttendanceCorrection {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly requestedAction: ApiAttendanceAction;
  readonly requestedAt: string;
  readonly reason: string;
  readonly status: "pending" | "approved" | "rejected";
  readonly reviewedByUserId: string | null;
  readonly reviewNotes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ApiAttendanceSelf {
  readonly employee: ApiEmployee | null;
  readonly record: ApiAttendanceRecord | null;
}

class WorkforceApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WorkforceApiError";
  }
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function authorizedRequest<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
  if (!session.token) throw new WorkforceApiError("This action requires a live API session.", 401);
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
    throw new WorkforceApiError(message, response.status);
  }
  return body as T;
}

export const workforceApi = {
  listEmployees(
    session: KlerionSession,
    query: { search?: string; branchId?: string; employmentStatus?: ApiEmploymentStatus; limit?: number; offset?: number } = {},
  ): Promise<ApiEmployeeList> {
    const params = new URLSearchParams();
    if (query.search) params.set("search", query.search);
    if (query.branchId) params.set("branchId", query.branchId);
    if (query.employmentStatus) params.set("employmentStatus", query.employmentStatus);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset !== undefined) params.set("offset", String(query.offset));
    return authorizedRequest<ApiEmployeeList>(session, `/employees${params.size ? `?${params.toString()}` : ""}`);
  },

  createEmployee(
    session: KlerionSession,
    input: {
      employeeNumber: string;
      firstName: string;
      lastName: string;
      email: string;
      hireDate: string;
      employmentType: ApiEmploymentType;
      userId?: string | null;
      departmentId?: string | null;
      positionId?: string | null;
      managerId?: string | null;
      branchId?: string | null;
    },
  ): Promise<ApiEmployee> {
    return authorizedRequest<ApiEmployee>(session, "/employees", { method: "POST", body: JSON.stringify(input) });
  },

  getMyAttendance(session: KlerionSession, date?: string): Promise<ApiAttendanceSelf> {
    return authorizedRequest<ApiAttendanceSelf>(session, `/attendance/me${date ? `?date=${encodeURIComponent(date)}` : ""}`);
  },

  clockAttendance(
    session: KlerionSession,
    input: {
      employeeId?: string;
      action: ApiAttendanceAction;
      timestamp: string;
      idempotencyKey?: string;
      source?: "web" | "mobile" | "kiosk" | "manual" | "system";
    },
  ): Promise<ApiAttendanceRecord> {
    return authorizedRequest<ApiAttendanceRecord>(session, "/attendance/clock", { method: "POST", body: JSON.stringify(input) });
  },

  listAttendanceRecords(
    session: KlerionSession,
    query: { employeeId?: string; branchId?: string; startDate?: string; endDate?: string } = {},
  ): Promise<ApiAttendanceRecord[]> {
    const params = new URLSearchParams();
    if (query.employeeId) params.set("employeeId", query.employeeId);
    if (query.branchId) params.set("branchId", query.branchId);
    if (query.startDate) params.set("startDate", query.startDate);
    if (query.endDate) params.set("endDate", query.endDate);
    return authorizedRequest<ApiAttendanceRecord[]>(session, `/attendance/records${params.size ? `?${params.toString()}` : ""}`);
  },

  requestAttendanceCorrection(
    session: KlerionSession,
    input: { employeeId?: string; requestedAction: ApiAttendanceAction; requestedAt: string; reason: string },
  ): Promise<ApiAttendanceCorrection> {
    return authorizedRequest<ApiAttendanceCorrection>(session, "/attendance/corrections", { method: "POST", body: JSON.stringify(input) });
  },

  listAttendanceCorrections(session: KlerionSession): Promise<{ data: ApiAttendanceCorrection[]; total: number }> {
    return authorizedRequest<{ data: ApiAttendanceCorrection[]; total: number }>(session, "/attendance/corrections");
  },

  reviewAttendanceCorrection(
    session: KlerionSession,
    id: string,
    approved: boolean,
    reviewNotes?: string,
  ): Promise<ApiAttendanceCorrection> {
    return authorizedRequest<ApiAttendanceCorrection>(session, `/attendance/corrections/${id}/${approved ? "approve" : "reject"}`, {
      method: "POST",
      body: JSON.stringify({ reviewNotes }),
    });
  },
};
