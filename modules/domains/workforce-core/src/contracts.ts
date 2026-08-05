import { z } from "zod";
import type { Employee } from "./employee.js";
import type { ManagerNode } from "./hierarchy.js";
import type { AttendanceCorrection, EmploymentStatus } from "./types.js";

export const EmploymentTypeSchema = z.enum([
  "full_time",
  "part_time",
  "contract",
  "intern",
  "temporary",
]);

export const EmploymentStatusSchema = z.enum([
  "active",
  "on_leave",
  "terminated",
  "suspended",
]);

export const AttendanceEventTypeSchema = z.enum([
  "clock_in",
  "clock_out",
  "break_start",
  "break_end",
]);

export const AttendanceEventSourceSchema = z.enum([
  "web",
  "mobile",
  "kiosk",
  "manual",
  "system",
]);

export const AttendanceSummaryStatusSchema = z.enum([
  "present",
  "absent",
  "late",
  "half_day",
  "on_leave",
  "holiday",
]);

export class EmployeeNotFoundError extends Error {
  constructor(employeeId: string) {
    super(`Employee [${employeeId}] not found`);
    this.name = "EmployeeNotFoundError";
  }
}

export const CorrectionStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);

export const EmployeeRefSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
});

export const DepartmentRefSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
});

export const PositionRefSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  title: z.string().min(1),
  code: z.string().min(1),
});

export const EmploymentPlacementSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  departmentId: z.string().uuid().nullable(),
  positionId: z.string().uuid().nullable(),
  managerId: z.string().uuid().nullable(),
  branchId: z.string().nullable(),
  employmentType: EmploymentTypeSchema,
  employmentStatus: EmploymentStatusSchema,
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date YYYY-MM-DD"),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date YYYY-MM-DD").nullable(),
});

export const AttendanceLocationSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  ipAddress: z.string().optional(),
});

export const AttendanceEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  eventType: AttendanceEventTypeSchema,
  timestamp: z.string().datetime({ offset: true }).or(z.string()),
  idempotencyKey: z.string().min(1),
  source: AttendanceEventSourceSchema,
  location: AttendanceLocationSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const AttendanceSummarySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  firstClockIn: z.string().nullable(),
  lastClockOut: z.string().nullable(),
  totalWorkMinutes: z.number().nonnegative(),
  totalBreakMinutes: z.number().nonnegative(),
  overtimeMinutes: z.number().nonnegative(),
  status: AttendanceSummaryStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AttendanceCorrectionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  targetEventId: z.string().uuid().nullable(),
  requestedEventType: AttendanceEventTypeSchema,
  requestedTimestamp: z.string(),
  reason: z.string().min(1),
  status: CorrectionStatusSchema,
  reviewedByUserId: z.string().uuid().nullable(),
  reviewNotes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Operation input schemas
export const CreateDepartmentSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  managerEmployeeId: z.string().uuid().optional(),
});

export const CreatePositionSchema = z.object({
  tenantId: z.string().uuid(),
  title: z.string().min(1),
  code: z.string().min(1),
  departmentId: z.string().uuid().optional(),
  description: z.string().optional(),
});

export const CreateEmployeeSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  employeeNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  branchId: z.string().optional(),
  employmentType: EmploymentTypeSchema.default("full_time"),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date YYYY-MM-DD"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateEmployeeSchema = z.object({
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  positionId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  branchId: z.string().nullable().optional(),
  employmentType: EmploymentTypeSchema.optional(),
  employmentStatus: EmploymentStatusSchema.optional(),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const RecordAttendanceEventSchema = z.object({
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  eventType: AttendanceEventTypeSchema,
  timestamp: z.string(),
  idempotencyKey: z.string().min(1),
  source: AttendanceEventSourceSchema.default("web"),
  location: AttendanceLocationSchema.optional(),
  notes: z.string().optional(),
});

export const SyncItemStatusSchema = z.enum([
  "PROCESSED_SUCCESS",
  "PROCESSED_DUPLICATE",
  "REJECTED_TENANT_MISMATCH",
  "REJECTED_FUTURE_TIMESTAMP",
  "REJECTED_INVALID_STATE",
  "REJECTED_PAYLOAD_MISMATCH",
]);

export type SyncItemStatus = z.infer<typeof SyncItemStatusSchema>;

export const AttendanceSyncItemSchema = z.object({
  eventId: z.string().optional(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eventType: AttendanceEventTypeSchema,
  timestamp: z.string(),
  idempotencyKey: z.string().min(1),
  source: AttendanceEventSourceSchema.default("mobile"),
  location: AttendanceLocationSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type AttendanceSyncItem = z.infer<typeof AttendanceSyncItemSchema>;

export const AttendanceSyncBatchRequestSchema = z.object({
  batchId: z.string().uuid(),
  tenantId: z.string().uuid(),
  submittedAt: z.string(),
  deviceId: z.string().optional(),
  events: z.array(AttendanceSyncItemSchema),
});

export type AttendanceSyncBatchRequest = z.infer<typeof AttendanceSyncBatchRequestSchema>;

export const SyncItemResultSchema = z.object({
  eventId: z.string().optional(),
  idempotencyKey: z.string(),
  status: SyncItemStatusSchema,
  message: z.string().optional(),
  recordId: z.string().optional(),
});

export type SyncItemResult = z.infer<typeof SyncItemResultSchema>;

export const AttendanceSyncBatchResponseSchema = z.object({
  batchId: z.string().uuid(),
  tenantId: z.string().uuid(),
  processedAt: z.string(),
  totalReceived: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  results: z.array(SyncItemResultSchema),
});

export type AttendanceSyncBatchResponse = z.infer<typeof AttendanceSyncBatchResponseSchema>;

export const RequestAttendanceCorrectionSchema = z.object({
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  targetEventId: z.string().uuid().optional(),
  requestedEventType: AttendanceEventTypeSchema,
  requestedTimestamp: z.string(),
  reason: z.string().min(1, "Reason is required for correction requests"),
});

export const ReviewAttendanceCorrectionSchema = z.object({
  tenantId: z.string().uuid(),
  correctionId: z.string().uuid(),
  reviewedByUserId: z.string().uuid(),
  approved: z.boolean(),
  reviewNotes: z.string().optional(),
});

export type { AttendanceCorrection };
export type RequestAttendanceCorrectionInput = z.infer<typeof RequestAttendanceCorrectionSchema>;
export type ReviewAttendanceCorrectionInput = z.infer<typeof ReviewAttendanceCorrectionSchema>;

export type EmployeeRefInput = z.infer<typeof EmployeeRefSchema>;
export type EmploymentPlacementInput = z.infer<typeof EmploymentPlacementSchema>;
export type AttendanceEventInput = z.infer<typeof AttendanceEventSchema>;
export type AttendanceSummaryInput = z.infer<typeof AttendanceSummarySchema>;
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type RecordAttendanceEventInput = z.infer<typeof RecordAttendanceEventSchema>;

export interface AttendanceCorrectionFilterOptions {
  employeeId?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
  offset?: number;
}

export interface AttendanceCorrectionRepository {
  create(correction: RequestAttendanceCorrectionInput): Promise<AttendanceCorrection>;
  findById(tenantId: string, id: string): Promise<AttendanceCorrection | null>;
  list(tenantId: string, options?: AttendanceCorrectionFilterOptions): Promise<AttendanceCorrection[]>;
  count(tenantId: string, options?: AttendanceCorrectionFilterOptions): Promise<number>;
  updateStatus(
    tenantId: string,
    id: string,
    status: "approved" | "rejected",
    reviewedByUserId: string,
    reviewNotes?: string,
  ): Promise<AttendanceCorrection>;
}

export const ManagerNodeSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  managerId: z.string().uuid().nullable(),
  employmentStatus: EmploymentStatusSchema,
});

export const HierarchyValidationOptionsSchema = z.object({
  maxDepth: z.number().int().positive().optional(),
});

export const BatchImportRecordSchema = z.object({
  recordIndex: z.number().int().nonnegative(),
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  proposedManagerId: z.string().uuid().nullable(),
  employmentStatus: EmploymentStatusSchema.optional(),
});

export interface EmployeeFilterOptions {
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  branchId?: string;
  employmentStatus?: EmploymentStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface EmployeeRepository {
  /** Save a new or existing Employee aggregate root. */
  save(employee: Employee): Promise<void>;

  /** Find an employee aggregate by ID within tenant boundary. */
  findById(tenantId: string, id: string): Promise<Employee | null>;

  /** Find an employee aggregate by employee number within tenant boundary. */
  findByEmployeeNumber(tenantId: string, employeeNumber: string): Promise<Employee | null>;

  /** Find an employee aggregate by email within tenant boundary. */
  findByEmail(tenantId: string, email: string): Promise<Employee | null>;

  /** List employees for a tenant with optional filters and pagination. */
  list(tenantId: string, options?: EmployeeFilterOptions): Promise<Employee[]>;

  /** Count total employees for a tenant matching filter options. */
  count(tenantId: string, options?: EmployeeFilterOptions): Promise<number>;

  /** Check if an employee ID exists within tenant boundary. */
  exists(tenantId: string, id: string): Promise<boolean>;

  /** Get manager node details for hierarchy validation. */
  getManagerNode(tenantId: string, employeeId: string): Promise<ManagerNode | null>;

  /** Delete an employee record within tenant boundary. */
  delete(tenantId: string, id: string): Promise<boolean>;
}

