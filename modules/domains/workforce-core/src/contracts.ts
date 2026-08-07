import type { Employee } from "./employee.js";
import type {
  AttendanceCorrection,
  AttendanceCorrectionFilterOptions,
  AttendanceRecordFilterOptions,
  AttendanceRecordState,
  EmployeeFilterOptions,
} from "./types.js";

export interface AuditRecorder {
  record(entry: {
    tenantId: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface EmployeeRepository {
  save(employee: Employee): Promise<void>;
  findById(tenantId: string, id: string): Promise<Employee | null>;
  findByUserId(tenantId: string, userId: string): Promise<Employee | null>;
  findByEmployeeNumber(tenantId: string, employeeNumber: string): Promise<Employee | null>;
  findByEmail(tenantId: string, email: string): Promise<Employee | null>;
  list(tenantId: string, options?: EmployeeFilterOptions): Promise<Employee[]>;
  count(tenantId: string, options?: EmployeeFilterOptions): Promise<number>;
  delete(tenantId: string, id: string): Promise<boolean>;
}

export interface AttendanceIdempotencyRecord {
  readonly tenantId: string;
  readonly key: string;
  readonly payloadHash: string;
  readonly recordId: string;
  readonly createdAt: Date;
}

export interface AttendanceRepository {
  saveRecord(record: AttendanceRecordState): Promise<void>;
  getRecord(tenantId: string, employeeId: string, workDate: string): Promise<AttendanceRecordState | null>;
  getRecordById(tenantId: string, id: string): Promise<AttendanceRecordState | null>;
  listRecords(tenantId: string, options?: AttendanceRecordFilterOptions): Promise<AttendanceRecordState[]>;
  findIdempotency(tenantId: string, key: string): Promise<AttendanceIdempotencyRecord | null>;
  saveIdempotency(record: AttendanceIdempotencyRecord): Promise<void>;
}

export interface CreateAttendanceCorrectionInput {
  readonly tenantId: string;
  readonly employeeId: string;
  readonly requestedAction: AttendanceCorrection["requestedAction"];
  readonly requestedAt: Date;
  readonly reason: string;
}

export interface AttendanceCorrectionRepository {
  create(input: CreateAttendanceCorrectionInput): Promise<AttendanceCorrection>;
  findById(tenantId: string, id: string): Promise<AttendanceCorrection | null>;
  list(tenantId: string, options?: AttendanceCorrectionFilterOptions): Promise<AttendanceCorrection[]>;
  count(tenantId: string, options?: AttendanceCorrectionFilterOptions): Promise<number>;
  review(
    tenantId: string,
    id: string,
    status: "approved" | "rejected",
    reviewedByUserId: string,
    reviewNotes?: string,
  ): Promise<AttendanceCorrection>;
}

export class WorkforceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkforceValidationError";
  }
}

export class EmployeeNotFoundError extends Error {
  constructor(id: string) {
    super(`Employee "${id}" was not found for this tenant`);
    this.name = "EmployeeNotFoundError";
  }
}

export class AttendanceRecordNotFoundError extends Error {
  constructor(id: string) {
    super(`Attendance record "${id}" was not found for this tenant`);
    this.name = "AttendanceRecordNotFoundError";
  }
}

export class AttendanceCorrectionNotFoundError extends Error {
  constructor(id: string) {
    super(`Attendance correction "${id}" was not found for this tenant`);
    this.name = "AttendanceCorrectionNotFoundError";
  }
}

export class AttendanceStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceStateError";
  }
}

export class AttendanceIdempotencyConflictError extends Error {
  constructor() {
    super("The idempotency key has already been used with a different attendance payload");
    this.name = "AttendanceIdempotencyConflictError";
  }
}
