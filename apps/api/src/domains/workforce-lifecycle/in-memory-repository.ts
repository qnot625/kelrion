import type { WorkforceLifecycleRepository } from "./repository.js";
import type { LeaveRequest, LifecyclePlan } from "./types.js";

export class InMemoryWorkforceLifecycleRepository implements WorkforceLifecycleRepository {
  private readonly leaveRequests = new Map<string, LeaveRequest>();
  private readonly lifecyclePlans = new Map<string, LifecyclePlan>();

  async saveLeaveRequest(request: LeaveRequest): Promise<void> {
    this.leaveRequests.set(request.id, request);
  }

  async findLeaveRequest(tenantId: string, id: string): Promise<LeaveRequest | undefined> {
    const request = this.leaveRequests.get(id);
    return request?.tenantId === tenantId ? request : undefined;
  }

  async listLeaveRequests(tenantId: string, requesterUserId?: string): Promise<LeaveRequest[]> {
    return [...this.leaveRequests.values()]
      .filter((request) => request.tenantId === tenantId)
      .filter((request) => !requesterUserId || request.requesterUserId === requesterUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async saveLifecyclePlan(plan: LifecyclePlan): Promise<void> {
    this.lifecyclePlans.set(plan.id, plan);
  }

  async findLifecyclePlan(tenantId: string, id: string): Promise<LifecyclePlan | undefined> {
    const plan = this.lifecyclePlans.get(id);
    return plan?.tenantId === tenantId ? plan : undefined;
  }

  async listLifecyclePlans(tenantId: string, subjectUserId?: string): Promise<LifecyclePlan[]> {
    return [...this.lifecyclePlans.values()]
      .filter((plan) => plan.tenantId === tenantId)
      .filter((plan) => !subjectUserId || plan.subjectUserId === subjectUserId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
