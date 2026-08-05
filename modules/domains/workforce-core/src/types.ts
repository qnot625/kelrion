export type EmploymentType = "full_time" | "part_time" | "contract" | "intern" | "temporary";

export type EmploymentStatus = "active" | "on_leave" | "terminated" | "suspended";

export type AttendanceEventType = "clock_in" | "clock_out" | "break_start" | "break_end";

export type AttendanceEventSource = "web" | "mobile" | "kiosk" | "manual" | "system";

export type AttendanceSummaryStatus = "present" | "absent" | "late" | "half_day" | "on_leave" | "holiday";

export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface EmployeeRef {
  id: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface DepartmentRef {
  id: string;
  tenantId: string;
  name: string;
  code: string;
}

export interface PositionRef {
  id: string;
  tenantId: string;
  title: string;
  code: string;
}

export interface EmploymentPlacement {
  employeeId: string;
  tenantId: string;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  branchId: string | null;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  terminationDate: string | null;
}

export interface AttendanceLocation {
  latitude?: number;
  longitude?: number;
  address?: string;
  ipAddress?: string;
}

export interface AttendanceEvent {
  id: string;
  tenantId: string;
  employeeId: string;
  eventType: AttendanceEventType;
  timestamp: string;
  idempotencyKey: string;
  source: AttendanceEventSource;
  location: AttendanceLocation | null;
  notes: string | null;
  createdAt: string;
}

export interface AttendanceSummary {
  id: string;
  tenantId: string;
  employeeId: string;
  workDate: string;
  firstClockIn: string | null;
  lastClockOut: string | null;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  overtimeMinutes: number;
  status: AttendanceSummaryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceCorrection {
  id: string;
  tenantId: string;
  employeeId: string;
  targetEventId: string | null;
  requestedEventType: AttendanceEventType;
  requestedTimestamp: string;
  reason: string;
  status: CorrectionStatus;
  reviewedByUserId: string | null;
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
}
