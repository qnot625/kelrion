import { z } from "zod";
import {
  AttendanceEventSourceSchema,
  AttendanceEventTypeSchema,
  AttendanceLocationSchema,
  EmploymentStatusSchema,
  EmploymentTypeSchema,
} from "./contracts.js";

// Event Type Literals / Constants
export const WORKFORCE_EVENT_TYPES = {
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_ACTIVATED: "employee.activated",
  EMPLOYEE_SUSPENDED: "employee.suspended",
  EMPLOYEE_TERMINATED: "employee.terminated",
  EMPLOYEE_TRANSFERRED: "employee.transferred",
  MANAGER_ASSIGNED: "employee.manager_assigned",
  DEPARTMENT_ASSIGNED: "employee.department_assigned",
  POSITION_ASSIGNED: "employee.position_assigned",
  ATTENDANCE_CLOCKED_IN: "attendance.clocked_in",
  ATTENDANCE_CLOCKED_OUT: "attendance.clocked_out",
  BREAK_STARTED: "attendance.break_started",
  BREAK_ENDED: "attendance.break_ended",
  ATTENDANCE_EXCEPTION_DETECTED: "attendance.exception_detected",
  CORRECTION_REQUESTED: "attendance.correction_requested",
  CORRECTION_APPROVED: "attendance.correction_approved",
  CORRECTION_REJECTED: "attendance.correction_rejected",
} as const;

export type WorkforceEventType = typeof WORKFORCE_EVENT_TYPES[keyof typeof WORKFORCE_EVENT_TYPES];

// Base Envelope Schema
export const DomainEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  tenantId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  occurredAt: z.string(),
  version: z.number().int().positive().default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export interface DomainEventEnvelope<TType extends string = string, TPayload = unknown> {
  eventId: string;
  eventType: TType;
  tenantId: string;
  aggregateId: string;
  occurredAt: string;
  version: number;
  metadata?: Record<string, unknown>;
  payload: TPayload;
}

// ---------------------------------------------------------------------------
// Employee Event Payloads & Schemas
// ---------------------------------------------------------------------------

export const EmployeeCreatedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employmentType: EmploymentTypeSchema,
  employmentStatus: EmploymentStatusSchema,
  departmentId: z.string().uuid().nullable().optional(),
  positionId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  branchId: z.string().nullable().optional(),
});

export type EmployeeCreatedPayload = z.infer<typeof EmployeeCreatedPayloadSchema>;

export const EmployeeCreatedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED),
  payload: EmployeeCreatedPayloadSchema,
});

export type EmployeeCreatedEvent = z.infer<typeof EmployeeCreatedEventSchema>;

export const EmployeeUpdatedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  changes: z.record(z.string(), z.unknown()),
});

export type EmployeeUpdatedPayload = z.infer<typeof EmployeeUpdatedPayloadSchema>;

export const EmployeeUpdatedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.EMPLOYEE_UPDATED),
  payload: EmployeeUpdatedPayloadSchema,
});

export type EmployeeUpdatedEvent = z.infer<typeof EmployeeUpdatedEventSchema>;

export const EmployeeActivatedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  previousStatus: EmploymentStatusSchema,
  reason: z.string().optional(),
});

export type EmployeeActivatedPayload = z.infer<typeof EmployeeActivatedPayloadSchema>;

export const EmployeeActivatedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.EMPLOYEE_ACTIVATED),
  payload: EmployeeActivatedPayloadSchema,
});

export type EmployeeActivatedEvent = z.infer<typeof EmployeeActivatedEventSchema>;

export const EmployeeSuspendedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  reason: z.string().min(1),
});

export type EmployeeSuspendedPayload = z.infer<typeof EmployeeSuspendedPayloadSchema>;

export const EmployeeSuspendedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.EMPLOYEE_SUSPENDED),
  payload: EmployeeSuspendedPayloadSchema,
});

export type EmployeeSuspendedEvent = z.infer<typeof EmployeeSuspendedEventSchema>;

export const EmployeeTerminatedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
});

export type EmployeeTerminatedPayload = z.infer<typeof EmployeeTerminatedPayloadSchema>;

export const EmployeeTerminatedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.EMPLOYEE_TERMINATED),
  payload: EmployeeTerminatedPayloadSchema,
});

export type EmployeeTerminatedEvent = z.infer<typeof EmployeeTerminatedEventSchema>;

export const EmployeeTransferredPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  fromBranchId: z.string().nullable(),
  toBranchId: z.string().nullable(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type EmployeeTransferredPayload = z.infer<typeof EmployeeTransferredPayloadSchema>;

export const EmployeeTransferredEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.EMPLOYEE_TRANSFERRED),
  payload: EmployeeTransferredPayloadSchema,
});

export type EmployeeTransferredEvent = z.infer<typeof EmployeeTransferredEventSchema>;

export const ManagerAssignedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  previousManagerId: z.string().uuid().nullable(),
  newManagerId: z.string().uuid().nullable(),
});

export type ManagerAssignedPayload = z.infer<typeof ManagerAssignedPayloadSchema>;

export const ManagerAssignedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.MANAGER_ASSIGNED),
  payload: ManagerAssignedPayloadSchema,
});

export type ManagerAssignedEvent = z.infer<typeof ManagerAssignedEventSchema>;

export const DepartmentAssignedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  previousDepartmentId: z.string().uuid().nullable(),
  newDepartmentId: z.string().uuid().nullable(),
});

export type DepartmentAssignedPayload = z.infer<typeof DepartmentAssignedPayloadSchema>;

export const DepartmentAssignedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.DEPARTMENT_ASSIGNED),
  payload: DepartmentAssignedPayloadSchema,
});

export type DepartmentAssignedEvent = z.infer<typeof DepartmentAssignedEventSchema>;

export const PositionAssignedPayloadSchema = z.object({
  employeeId: z.string().uuid(),
  tenantId: z.string().uuid(),
  previousPositionId: z.string().uuid().nullable(),
  newPositionId: z.string().uuid().nullable(),
});

export type PositionAssignedPayload = z.infer<typeof PositionAssignedPayloadSchema>;

export const PositionAssignedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.POSITION_ASSIGNED),
  payload: PositionAssignedPayloadSchema,
});

export type PositionAssignedEvent = z.infer<typeof PositionAssignedEventSchema>;

// ---------------------------------------------------------------------------
// Attendance Event Payloads & Schemas
// ---------------------------------------------------------------------------

export const AttendanceClockedInPayloadSchema = z.object({
  attendanceEventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  timestamp: z.string(),
  idempotencyKey: z.string().min(1),
  source: AttendanceEventSourceSchema,
  location: AttendanceLocationSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type AttendanceClockedInPayload = z.infer<typeof AttendanceClockedInPayloadSchema>;

export const AttendanceClockedInEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_IN),
  payload: AttendanceClockedInPayloadSchema,
});

export type AttendanceClockedInEvent = z.infer<typeof AttendanceClockedInEventSchema>;

export const AttendanceClockedOutPayloadSchema = z.object({
  attendanceEventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  timestamp: z.string(),
  idempotencyKey: z.string().min(1),
  source: AttendanceEventSourceSchema,
  location: AttendanceLocationSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type AttendanceClockedOutPayload = z.infer<typeof AttendanceClockedOutPayloadSchema>;

export const AttendanceClockedOutEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_OUT),
  payload: AttendanceClockedOutPayloadSchema,
});

export type AttendanceClockedOutEvent = z.infer<typeof AttendanceClockedOutEventSchema>;

export const BreakStartedPayloadSchema = z.object({
  attendanceEventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  timestamp: z.string(),
  idempotencyKey: z.string().min(1),
  source: AttendanceEventSourceSchema,
  location: AttendanceLocationSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type BreakStartedPayload = z.infer<typeof BreakStartedPayloadSchema>;

export const BreakStartedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.BREAK_STARTED),
  payload: BreakStartedPayloadSchema,
});

export type BreakStartedEvent = z.infer<typeof BreakStartedEventSchema>;

export const BreakEndedPayloadSchema = z.object({
  attendanceEventId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  timestamp: z.string(),
  idempotencyKey: z.string().min(1),
  source: AttendanceEventSourceSchema,
  location: AttendanceLocationSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type BreakEndedPayload = z.infer<typeof BreakEndedPayloadSchema>;

export const BreakEndedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.BREAK_ENDED),
  payload: BreakEndedPayloadSchema,
});

export type BreakEndedEvent = z.infer<typeof BreakEndedEventSchema>;

export const AttendanceExceptionDetectedPayloadSchema = z.object({
  recordId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  exception: z.object({
    exceptionId: z.string(),
    type: z.enum(["LATE_ARRIVAL", "EARLY_DEPARTURE", "EXCESSIVE_BREAK", "MISSING_CLOCK_OUT"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    message: z.string(),
    detectedAt: z.string(),
    resolved: z.boolean(),
  }),
});

export type AttendanceExceptionDetectedPayload = z.infer<typeof AttendanceExceptionDetectedPayloadSchema>;

export const AttendanceExceptionDetectedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.ATTENDANCE_EXCEPTION_DETECTED),
  payload: AttendanceExceptionDetectedPayloadSchema,
});

export type AttendanceExceptionDetectedEvent = z.infer<typeof AttendanceExceptionDetectedEventSchema>;

export const AttendanceCorrectionRequestedPayloadSchema = z.object({
  correctionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  targetEventId: z.string().uuid().nullable().optional(),
  requestedEventType: AttendanceEventTypeSchema,
  requestedTimestamp: z.string(),
  reason: z.string().min(1),
});

export type AttendanceCorrectionRequestedPayload = z.infer<typeof AttendanceCorrectionRequestedPayloadSchema>;

export const AttendanceCorrectionRequestedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.CORRECTION_REQUESTED),
  payload: AttendanceCorrectionRequestedPayloadSchema,
});

export type AttendanceCorrectionRequestedEvent = z.infer<typeof AttendanceCorrectionRequestedEventSchema>;

export const AttendanceCorrectionApprovedPayloadSchema = z.object({
  correctionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  reviewedByUserId: z.string().uuid(),
  reviewNotes: z.string().nullable().optional(),
});

export type AttendanceCorrectionApprovedPayload = z.infer<typeof AttendanceCorrectionApprovedPayloadSchema>;

export const AttendanceCorrectionApprovedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.CORRECTION_APPROVED),
  payload: AttendanceCorrectionApprovedPayloadSchema,
});

export type AttendanceCorrectionApprovedEvent = z.infer<typeof AttendanceCorrectionApprovedEventSchema>;

export const AttendanceCorrectionRejectedPayloadSchema = z.object({
  correctionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  reviewedByUserId: z.string().uuid(),
  reviewNotes: z.string().nullable().optional(),
});

export type AttendanceCorrectionRejectedPayload = z.infer<typeof AttendanceCorrectionRejectedPayloadSchema>;

export const AttendanceCorrectionRejectedEventSchema = DomainEventEnvelopeSchema.extend({
  eventType: z.literal(WORKFORCE_EVENT_TYPES.CORRECTION_REJECTED),
  payload: AttendanceCorrectionRejectedPayloadSchema,
});

export type AttendanceCorrectionRejectedEvent = z.infer<typeof AttendanceCorrectionRejectedEventSchema>;

// Discriminated Union Schema
export const WorkforceDomainEventSchema = z.discriminatedUnion("eventType", [
  EmployeeCreatedEventSchema,
  EmployeeUpdatedEventSchema,
  EmployeeActivatedEventSchema,
  EmployeeSuspendedEventSchema,
  EmployeeTerminatedEventSchema,
  EmployeeTransferredEventSchema,
  ManagerAssignedEventSchema,
  DepartmentAssignedEventSchema,
  PositionAssignedEventSchema,
  AttendanceClockedInEventSchema,
  AttendanceClockedOutEventSchema,
  BreakStartedEventSchema,
  BreakEndedEventSchema,
  AttendanceExceptionDetectedEventSchema,
  AttendanceCorrectionRequestedEventSchema,
  AttendanceCorrectionApprovedEventSchema,
  AttendanceCorrectionRejectedEventSchema,
]);

export type WorkforceDomainEvent = z.infer<typeof WorkforceDomainEventSchema>;

// Helper Factory Function
export function createWorkforceDomainEvent<T extends WorkforceDomainEvent>(params: {
  eventId?: string;
  eventType: T["eventType"];
  tenantId: string;
  aggregateId: string;
  occurredAt?: string;
  version?: number;
  metadata?: Record<string, unknown>;
  payload: T["payload"];
}): T {
  const rawEvent = {
    eventId: params.eventId ?? crypto.randomUUID(),
    eventType: params.eventType,
    tenantId: params.tenantId,
    aggregateId: params.aggregateId,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
    version: params.version ?? 1,
    metadata: params.metadata,
    payload: params.payload,
  };

  return WorkforceDomainEventSchema.parse(rawEvent) as T;
}
