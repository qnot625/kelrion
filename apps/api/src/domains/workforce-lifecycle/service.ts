import { randomUUID } from "node:crypto";
import type { EmployeeRepository } from "@adminops/workforce-core";
import type { WorkforceLifecycleRepository } from "./repository.js";
import {
  InsufficientLeaveBalanceError,
  InvalidLeaveTransitionError,
  LeaveRequestNotFoundError,
  LifecyclePlanNotFoundError,
  LifecycleStepNotFoundError,
  OverlappingLeaveRequestError,
  WorkforceLifecycleValidationError,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveStatus,
  type LeaveType,
  type LifecycleKind,
  type LifecyclePlan,
  type LifecycleStep,
  type SubmitLeaveInput,
} from "./types.js";

const LEAVE_ALLOCATIONS: Record<LeaveType, number | null> = {
  annual: 20,
  sick: 10,
  parental: 90,
  unpaid: null,
  other: null,
};

const LEAVE_TRANSITIONS: Record<LeaveStatus, LeaveStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["cancelled"],
  rejected: [],
  cancelled: [],
};

type EmployeeLookup = Pick<EmployeeRepository, "findById" | "findByUserId">;

function startOfDay(value: Date): Date {
  const next = new Date(value);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function calculateWorkingDays(start: Date, end: Date): number {
  let total = 0;
  const cursor = startOfDay(start);
  const final = startOfDay(end);
  while (cursor.getTime() <= final.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

function defaultSteps(kind: LifecycleKind): LifecycleStep[] {
  const titles: ReadonlyArray<readonly [string, string]> =
    kind === "onboarding"
      ? [
          ["Collect employment documents", "HR"],
          ["Provision account and access", "IT"],
          ["Assign manager and first-week plan", "Manager"],
          ["Complete orientation", "HR"],
          ["Confirm 30-day check-in", "Manager"],
        ]
      : [
          ["Record notice and final date", "HR"],
          ["Complete responsibility handover", "Manager"],
          ["Return assets and equipment", "Facilities"],
          ["Revoke system access", "IT"],
          ["Complete exit interview", "HR"],
        ];

  return titles.map(([title, ownerRole]) => ({
    id: randomUUID(),
    title,
    ownerRole,
    status: "pending",
    completedAt: null,
    completedByUserId: null,
  }));
}

export class WorkforceLifecycleService {
  constructor(
    private readonly repository: WorkforceLifecycleRepository,
    private readonly employees?: EmployeeLookup,
  ) {}

  async submitLeave(input: SubmitLeaveInput): Promise<LeaveRequest> {
    const startDate = startOfDay(input.startDate);
    const endDate = startOfDay(input.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new WorkforceLifecycleValidationError("startDate and endDate must be valid dates");
    }
    if (endDate.getTime() < startDate.getTime()) {
      throw new WorkforceLifecycleValidationError("Leave end date must not be before the start date");
    }
    if (input.reason.trim().length < 3 || input.reason.trim().length > 500) {
      throw new WorkforceLifecycleValidationError("Leave reason must contain between 3 and 500 characters");
    }

    const workingDays = calculateWorkingDays(startDate, endDate);
    if (workingDays < 1) {
      throw new WorkforceLifecycleValidationError("The leave request must include at least one working day");
    }

    const employee = await this.resolveRequesterEmployee(
      input.tenantId,
      input.requesterUserId,
      input.requesterEmployeeId,
    );
    const requesterEmployeeId = employee?.id ?? input.requesterEmployeeId ?? null;
    const existing = await this.repository.listLeaveRequests(
      input.tenantId,
      input.requesterUserId,
      requesterEmployeeId ?? undefined,
    );
    if (
      existing.some(
        (request) =>
          (request.status === "pending" || request.status === "approved") &&
          overlaps(startDate, endDate, request.startDate, request.endDate),
      )
    ) {
      throw new OverlappingLeaveRequestError();
    }

    const balance = this.calculateBalance(input.type, existing);
    if (balance.remainingDays !== null && workingDays > balance.remainingDays) {
      throw new InsufficientLeaveBalanceError(input.type);
    }

    const now = new Date();
    const request: LeaveRequest = {
      id: randomUUID(),
      tenantId: input.tenantId,
      requesterUserId: input.requesterUserId,
      requesterEmployeeId,
      type: input.type,
      startDate,
      endDate,
      workingDays,
      reason: input.reason.trim(),
      status: "pending",
      decidedByUserId: null,
      decisionNote: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveLeaveRequest(request);
    return request;
  }

  async listLeave(tenantId: string, requesterUserId?: string): Promise<LeaveRequest[]> {
    if (!requesterUserId) return this.repository.listLeaveRequests(tenantId);
    const employee = await this.employees?.findByUserId(tenantId, requesterUserId);
    return this.repository.listLeaveRequests(tenantId, requesterUserId, employee?.id);
  }

  async balances(tenantId: string, requesterUserId: string): Promise<LeaveBalance[]> {
    const employee = await this.employees?.findByUserId(tenantId, requesterUserId);
    const requests = await this.repository.listLeaveRequests(tenantId, requesterUserId, employee?.id);
    return (Object.keys(LEAVE_ALLOCATIONS) as LeaveType[]).map((type) =>
      this.calculateBalance(type, requests),
    );
  }

  async approveLeave(
    tenantId: string,
    id: string,
    actorUserId: string,
    note: string | null,
  ): Promise<LeaveRequest> {
    return this.transitionLeave(tenantId, id, "approved", actorUserId, note);
  }

  async rejectLeave(
    tenantId: string,
    id: string,
    actorUserId: string,
    note: string | null,
  ): Promise<LeaveRequest> {
    return this.transitionLeave(tenantId, id, "rejected", actorUserId, note);
  }

  async cancelLeave(tenantId: string, id: string, requesterUserId: string): Promise<LeaveRequest> {
    const request = await this.requireLeave(tenantId, id);
    const employee = await this.employees?.findByUserId(tenantId, requesterUserId);
    const ownsByUser = request.requesterUserId === requesterUserId;
    const ownsByEmployee = Boolean(employee && request.requesterEmployeeId === employee.id);
    if (!ownsByUser && !ownsByEmployee) {
      throw new LeaveRequestNotFoundError(id);
    }
    return this.transitionLeave(tenantId, id, "cancelled", requesterUserId, "Cancelled by requester");
  }

  async createLifecyclePlan(input: {
    tenantId: string;
    subjectEmployeeId?: string | null;
    subjectUserId?: string | null;
    kind: LifecycleKind;
    title?: string;
    dueAt?: Date | null;
    steps?: readonly { title: string; ownerRole?: string }[];
    createdByUserId: string;
  }): Promise<LifecyclePlan> {
    let subjectEmployeeId = input.subjectEmployeeId?.trim() || null;
    let subjectUserId = input.subjectUserId?.trim() || null;
    if (!subjectEmployeeId && !subjectUserId) {
      throw new WorkforceLifecycleValidationError("subjectEmployeeId or subjectUserId is required");
    }

    if (this.employees) {
      if (subjectEmployeeId) {
        const employee = await this.employees.findById(input.tenantId, subjectEmployeeId);
        if (!employee) {
          throw new WorkforceLifecycleValidationError("The selected employee was not found for this tenant");
        }
        if (subjectUserId && employee.userId !== subjectUserId) {
          throw new WorkforceLifecycleValidationError("subjectUserId does not match the selected employee");
        }
        subjectEmployeeId = employee.id;
        subjectUserId = employee.userId;
      } else if (subjectUserId) {
        const employee = await this.employees.findByUserId(input.tenantId, subjectUserId);
        if (employee) subjectEmployeeId = employee.id;
      }
    }

    const supplied = input.steps?.filter((step) => step.title.trim().length > 0) ?? [];
    if (supplied.length > 50) {
      throw new WorkforceLifecycleValidationError("A lifecycle plan cannot contain more than 50 steps");
    }
    const steps: LifecycleStep[] =
      supplied.length > 0
        ? supplied.map((step) => ({
            id: randomUUID(),
            title: step.title.trim(),
            ownerRole: step.ownerRole?.trim() || "Manager",
            status: "pending",
            completedAt: null,
            completedByUserId: null,
          }))
        : defaultSteps(input.kind);
    const now = new Date();
    const plan: LifecyclePlan = {
      id: randomUUID(),
      tenantId: input.tenantId,
      subjectEmployeeId,
      subjectUserId,
      kind: input.kind,
      title:
        input.title?.trim() ||
        (input.kind === "onboarding" ? "Employee onboarding" : "Employee offboarding"),
      dueAt: input.dueAt ?? null,
      status: "active",
      steps,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    await this.repository.saveLifecyclePlan(plan);
    return plan;
  }

  async listLifecyclePlans(tenantId: string, subjectUserId?: string): Promise<LifecyclePlan[]> {
    if (!subjectUserId) return this.repository.listLifecyclePlans(tenantId);
    const employee = await this.employees?.findByUserId(tenantId, subjectUserId);
    return this.repository.listLifecyclePlans(tenantId, subjectUserId, employee?.id);
  }

  async completeLifecycleStep(
    tenantId: string,
    planId: string,
    stepId: string,
    actorUserId: string,
  ): Promise<LifecyclePlan> {
    const plan = await this.requirePlan(tenantId, planId);
    if (plan.status !== "active") {
      throw new WorkforceLifecycleValidationError("Only active lifecycle plans can be updated");
    }
    const target = plan.steps.find((step) => step.id === stepId);
    if (!target) throw new LifecycleStepNotFoundError(stepId);
    if (target.status === "completed") return plan;

    const now = new Date();
    const steps = plan.steps.map((step) =>
      step.id === stepId
        ? { ...step, status: "completed" as const, completedAt: now, completedByUserId: actorUserId }
        : step,
    );
    const isComplete = steps.every((step) => step.status === "completed");
    const updated: LifecyclePlan = {
      ...plan,
      steps,
      status: isComplete ? "completed" : "active",
      completedAt: isComplete ? now : null,
      updatedAt: now,
    };
    await this.repository.saveLifecyclePlan(updated);
    return updated;
  }

  async cancelLifecyclePlan(
    tenantId: string,
    planId: string,
    actorUserId: string,
  ): Promise<LifecyclePlan> {
    const plan = await this.requirePlan(tenantId, planId);
    if (plan.status !== "active") return plan;
    const updated: LifecyclePlan = {
      ...plan,
      status: "cancelled",
      updatedAt: new Date(),
      completedAt: null,
      createdByUserId: plan.createdByUserId || actorUserId,
    };
    await this.repository.saveLifecyclePlan(updated);
    return updated;
  }

  private calculateBalance(type: LeaveType, requests: readonly LeaveRequest[]): LeaveBalance {
    const allocatedDays = LEAVE_ALLOCATIONS[type];
    const approvedDays = requests
      .filter((request) => request.type === type && request.status === "approved")
      .reduce((total, request) => total + request.workingDays, 0);
    const pendingDays = requests
      .filter((request) => request.type === type && request.status === "pending")
      .reduce((total, request) => total + request.workingDays, 0);
    return {
      type,
      allocatedDays,
      approvedDays,
      pendingDays,
      remainingDays:
        allocatedDays === null ? null : Math.max(0, allocatedDays - approvedDays - pendingDays),
    };
  }

  private async transitionLeave(
    tenantId: string,
    id: string,
    status: LeaveStatus,
    actorUserId: string,
    note: string | null,
  ): Promise<LeaveRequest> {
    const request = await this.requireLeave(tenantId, id);
    if (!LEAVE_TRANSITIONS[request.status].includes(status)) {
      throw new InvalidLeaveTransitionError(request.status, status);
    }
    const now = new Date();
    const updated: LeaveRequest = {
      ...request,
      status,
      decidedByUserId: actorUserId,
      decisionNote: note?.trim() || null,
      decidedAt: now,
      updatedAt: now,
    };
    await this.repository.saveLeaveRequest(updated);
    return updated;
  }

  private async requireLeave(tenantId: string, id: string): Promise<LeaveRequest> {
    const request = await this.repository.findLeaveRequest(tenantId, id);
    if (!request) throw new LeaveRequestNotFoundError(id);
    return request;
  }

  private async requirePlan(tenantId: string, id: string): Promise<LifecyclePlan> {
    const plan = await this.repository.findLifecyclePlan(tenantId, id);
    if (!plan) throw new LifecyclePlanNotFoundError(id);
    return plan;
  }

  private async resolveRequesterEmployee(
    tenantId: string,
    requesterUserId: string,
    requesterEmployeeId?: string | null,
  ) {
    if (!this.employees) return null;
    if (requesterEmployeeId) {
      const employee = await this.employees.findById(tenantId, requesterEmployeeId);
      if (!employee) {
        throw new WorkforceLifecycleValidationError("The selected employee was not found for this tenant");
      }
      if (employee.userId !== requesterUserId) {
        throw new WorkforceLifecycleValidationError("The selected employee is not linked to the requester");
      }
      return employee;
    }
    return this.employees.findByUserId(tenantId, requesterUserId);
  }
}
