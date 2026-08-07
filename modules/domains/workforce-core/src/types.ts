export type EmploymentType = "full_time" | "part_time" | "contract" | "intern" | "temporary";
export type EmploymentStatus = "active" | "on_leave" | "suspended" | "terminated";

export interface EmployeeState {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string | null;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly hireDate: string;
  readonly employmentType: EmploymentType;
  readonly employmentStatus: EmploymentStatus;
  readonly departmentId: string | null;
  readonly positionId: string | null;
  readonly managerId: string | null;
  readonly branchId: string | null;
  readonly terminationDate: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EmployeeFilterOptions {
  readonly userId?: string;
  readonly departmentId?: string;
  readonly positionId?: string;
  readonly managerId?: string;
  readonly branchId?: string;
  readonly employmentStatus?: EmploymentStatus;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export type AttendanceStatus = "idle" | "clocked_in" | "on_break" | "clocked_out";
export type AttendanceAction = "clock_in" | "clock_out" | "break_start" | "break_end";
export type AttendanceSource = "web" | "mobile" | "kiosk" | "manual" | "system";

export interface AttendanceLocation {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly address?: string;
  readonly ipAddress?: string;
}

export interface BreakInterval {
  readonly id: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly durationMinutes: number | null;
}

export type AttendanceExceptionType =
  | "late_arrival"
  | "early_departure"
  | "excessive_break"
  | "missing_clock_out";

export interface AttendanceException {
  readonly id: string;
  readonly type: AttendanceExceptionType;
  readonly message: string;
  readonly detectedAt: Date;
  readonly resolvedAt: Date | null;
}

export interface AttendanceRecordState {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly status: AttendanceStatus;
  readonly clockInAt: Date | null;
  readonly clockOutAt: Date | null;
  readonly breaks: readonly BreakInterval[];
  readonly activeDurationMinutes: number;
  readonly totalBreakMinutes: number;
  readonly exceptions: readonly AttendanceException[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AttendanceRecordFilterOptions {
  readonly employeeId?: string;
  readonly branchId?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface AttendanceCorrection {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly requestedAction: AttendanceAction;
  readonly requestedAt: Date;
  readonly reason: string;
  readonly status: CorrectionStatus;
  readonly reviewedByUserId: string | null;
  readonly reviewNotes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AttendanceCorrectionFilterOptions {
  readonly employeeId?: string;
  readonly status?: CorrectionStatus;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AttendanceOperationInput {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly action: AttendanceAction;
  readonly timestamp: Date;
  readonly idempotencyKey?: string;
  readonly source?: AttendanceSource;
  readonly location?: AttendanceLocation | null;
  readonly notes?: string;
}

export interface AttendanceSyncItem {
  readonly employeeId: string;
  readonly action: AttendanceAction;
  readonly timestamp: Date;
  readonly idempotencyKey: string;
  readonly source?: AttendanceSource;
  readonly location?: AttendanceLocation | null;
  readonly notes?: string;
}

export type AttendanceSyncStatus = "processed" | "duplicate" | "rejected";

export interface AttendanceSyncResult {
  readonly idempotencyKey: string;
  readonly status: AttendanceSyncStatus;
  readonly recordId?: string;
  readonly message?: string;
}
