import { ApprovalRequest, ApprovalStatus } from './approval-request.js';
import {
  ApprovalRequestRepository,
  ApprovalRequestFilter,
} from './approval-request-repository.js';

export class InMemoryApprovalRequestRepository implements ApprovalRequestRepository {
  private readonly store = new Map<string, string>();

  public clear(): void {
    this.store.clear();
  }

  private getKey(id: string, tenantId: string): string {
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('Tenant ID is required for repository operations');
    }
    return `${tenantId}:${id}`;
  }

  public async save(request: ApprovalRequest): Promise<void> {
    const key = this.getKey(request.id, request.tenantId);
    this.store.set(key, JSON.stringify(request.toJSON()));
  }

  public async findById(id: string, tenantId: string): Promise<ApprovalRequest | null> {
    const key = this.getKey(id, tenantId);
    const raw = this.store.get(key);
    if (!raw) return null;
    return this.deserialize(raw);
  }

  public async findByTenantId(
    tenantId: string,
    filter?: ApprovalRequestFilter
  ): Promise<ApprovalRequest[]> {
    if (!tenantId || tenantId.trim() === '') {
      throw new Error('Tenant ID is required for repository operations');
    }

    const results: ApprovalRequest[] = [];
    const prefix = `${tenantId}:`;

    for (const [key, raw] of this.store.entries()) {
      if (!key.startsWith(prefix)) continue;

      const item = this.deserialize(raw);

      if (filter) {
        if (filter.status && item.status !== filter.status) continue;
        if (filter.requesterUserId && item.requesterUserId !== filter.requesterUserId) continue;
        if (filter.workflowInstanceId && item.workflowInstanceId !== filter.workflowInstanceId) continue;
        if (filter.assigneeUserId) {
          const isAssigned = item.steps.some((step) =>
            step.assignedUserIds.includes(filter.assigneeUserId!)
          );
          if (!isAssigned) continue;
        }
      }

      results.push(item);
    }

    return results;
  }

  public async findByWorkflowInstanceId(
    workflowInstanceId: string,
    tenantId: string
  ): Promise<ApprovalRequest[]> {
    return this.findByTenantId(tenantId, { workflowInstanceId });
  }

  public async findByAssignee(
    userId: string,
    tenantId: string,
    status?: ApprovalStatus
  ): Promise<ApprovalRequest[]> {
    return this.findByTenantId(tenantId, { assigneeUserId: userId, status });
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const key = this.getKey(id, tenantId);
    return this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }

  private deserialize(rawJson: string): ApprovalRequest {
    const data = JSON.parse(rawJson);
    return ApprovalRequest.create({
      id: data.id,
      tenantId: data.tenantId,
      title: data.title,
      description: data.description,
      workflowInstanceId: data.workflowInstanceId,
      workflowStepId: data.workflowStepId,
      requesterUserId: data.requesterUserId,
      currentStepIndex: data.currentStepIndex,
      status: data.status,
      steps: data.steps.map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        stepOrder: s.stepOrder as number,
        status: s.status as any,
        requiredApproversCount: s.requiredApproversCount as number,
        assignedUserIds: s.assignedUserIds as string[],
        assignedRoles: s.assignedRoles as string[],
        decisions: s.decisions
          ? (s.decisions as Record<string, unknown>[]).map((d) => ({
              ...(d as any),
              decidedAt: new Date(d.decidedAt as string),
            }))
          : [],
        dueAt: s.dueAt ? new Date(s.dueAt as string) : undefined,
        escalationTargetUserId: s.escalationTargetUserId as string | undefined,
        escalationRules: s.escalationRules as any,
        metadata: s.metadata as Record<string, unknown>,
      })),
      metadata: data.metadata,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      completedAt: data.completedAt ? new Date(data.completedAt as string) : undefined,
    });
  }
}
