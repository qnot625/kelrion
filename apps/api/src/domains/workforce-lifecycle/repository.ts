import type { LeaveRequest, LifecyclePlan } from "./types.js";

export interface WorkforceLifecycleRepository {
  saveLeaveRequest(request: LeaveRequest): Promise<void>;
  findLeaveRequest(tenantId: string, id: string): Promise<LeaveRequest | undefined>;
  listLeaveRequests(
    tenantId: string,
    requesterUserId?: string,
    requesterEmployeeId?: string,
  ): Promise<LeaveRequest[]>;
  saveLifecyclePlan(plan: LifecyclePlan): Promise<void>;
  findLifecyclePlan(tenantId: string, id: string): Promise<LifecyclePlan | undefined>;
  listLifecyclePlans(
    tenantId: string,
    subjectUserId?: string,
    subjectEmployeeId?: string,
  ): Promise<LifecyclePlan[]>;
}
