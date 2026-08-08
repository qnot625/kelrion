export type LeaveType = "annual" | "sick" | "parental" | "unpaid" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly requesterUserId: string | null;
  readonly requesterEmployeeId: string | null;
  readonly type: LeaveType;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly workingDays: number;
  readonly reason: string;
  readonly status: LeaveStatus;
  readonly decidedByUserId: string | null;
  readonly decisionNote: string | null;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SubmitLeaveInput {
  readonly tenantId: string;
  readonly requesterUserId: string;
  readonly requesterEmployeeId?: string | null;
  readonly type: LeaveType;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly reason: string;
}

export interface LeaveBalance {
  readonly type: LeaveType;
  readonly allocatedDays: number | null;
  readonly approvedDays: number;
  readonly pendingDays: number;
  readonly remainingDays: number | null;
}

export type LifecycleKind = "onboarding" | "offboarding";
export type LifecycleStatus = "active" | "completed" | "cancelled";
export type LifecycleStepStatus = "pending" | "completed";

export interface LifecycleStep {
  readonly id: string;
  readonly title: string;
  readonly ownerRole: string;
  readonly status: LifecycleStepStatus;
  readonly completedAt: Date | null;
  readonly completedByUserId: string | null;
}

export interface LifecyclePlan {
  readonly id: string;
  readonly tenantId: string;
  readonly subjectEmployeeId: string | null;
  readonly subjectUserId: string | null;
  readonly kind: LifecycleKind;
  readonly title: string;
  readonly dueAt: Date | null;
  readonly status: LifecycleStatus;
  readonly steps: readonly LifecycleStep[];
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export class WorkforceLifecycleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkforceLifecycleValidationError";
  }
}

export class LeaveRequestNotFoundError extends Error {
  constructor(id: string) {
    super(`Leave request "${id}" was not found for this tenant`);
    this.name = "LeaveRequestNotFoundError";
  }
}

export class InvalidLeaveTransitionError extends Error {
  constructor(from: LeaveStatus, to: LeaveStatus) {
    super(`Cannot move a leave request from "${from}" to "${to}"`);
    this.name = "InvalidLeaveTransitionError";
  }
}

export class OverlappingLeaveRequestError extends Error {
  constructor() {
    super("The requested dates overlap another pending or approved leave request");
    this.name = "OverlappingLeaveRequestError";
  }
}

export class InsufficientLeaveBalanceError extends Error {
  constructor(type: LeaveType) {
    super(`The requested ${type} leave exceeds the available balance`);
    this.name = "InsufficientLeaveBalanceError";
  }
}

export class LifecyclePlanNotFoundError extends Error {
  constructor(id: string) {
    super(`Lifecycle plan "${id}" was not found for this tenant`);
    this.name = "LifecyclePlanNotFoundError";
  }
}

export class LifecycleStepNotFoundError extends Error {
  constructor(id: string) {
    super(`Lifecycle step "${id}" was not found`);
    this.name = "LifecycleStepNotFoundError";
  }
}
