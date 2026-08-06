import { HumanTask } from './human-task.js';
import {
  HumanTaskRepository,
  HumanTaskFilter,
} from './human-task-repository.js';

export class InMemoryHumanTaskRepository implements HumanTaskRepository {
  // Key: `${tenantId}:${id}`
  private tasks: Map<string, HumanTask> = new Map();

  private makeKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private clone(task: HumanTask): HumanTask {
    const json = task.toJSON();
    return new HumanTask({
      id: json.id,
      tenantId: json.tenantId,
      workflowInstanceId: json.workflowInstanceId,
      workflowDefinitionId: json.workflowDefinitionId,
      stepId: json.stepId,
      name: json.name,
      description: json.description,
      status: json.status,
      priority: json.priority,
      assigneeId: json.assigneeId,
      originalAssigneeId: json.originalAssigneeId,
      candidateUsers: json.candidateUsers,
      candidateRoles: json.candidateRoles,
      candidateGroups: json.candidateGroups,
      delegationHistory: json.delegationHistory.map((d: any) => ({
        ...d,
        delegatedAt: new Date(d.delegatedAt),
      })),
      dueDate: json.dueDate ? new Date(json.dueDate) : undefined,
      slaHours: json.slaHours,
      escalationCount: json.escalationCount,
      formData: json.formData,
      formDefinitionId: json.formDefinitionId,
      metadata: json.metadata,
      createdAt: new Date(json.createdAt),
      updatedAt: new Date(json.updatedAt),
      startedAt: json.startedAt ? new Date(json.startedAt) : undefined,
      completedAt: json.completedAt ? new Date(json.completedAt) : undefined,
      cancelledAt: json.cancelledAt ? new Date(json.cancelledAt) : undefined,
      expiredAt: json.expiredAt ? new Date(json.expiredAt) : undefined,
    });
  }

  public async save(task: HumanTask): Promise<void> {
    const key = this.makeKey(task.tenantId, task.id);
    this.tasks.set(key, this.clone(task));
  }

  public async findById(
    id: string,
    tenantId: string
  ): Promise<HumanTask | null> {
    const key = this.makeKey(tenantId, id);
    const task = this.tasks.get(key);
    if (!task) return null;
    return this.clone(task);
  }

  public async list(
    tenantId: string,
    filter?: HumanTaskFilter
  ): Promise<HumanTask[]> {
    let result: HumanTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.tenantId !== tenantId) continue;
      result.push(task);
    }

    if (filter?.status) {
      result = result.filter((t) => t.status === filter.status);
    }

    if (filter?.assigneeId) {
      result = result.filter((t) => t.assigneeId === filter.assigneeId);
    }

    if (filter?.candidateUserId) {
      result = result.filter(
        (t) =>
          t.candidateUsers.length === 0 ||
          t.candidateUsers.includes(filter.candidateUserId!)
      );
    }

    if (filter?.candidateRole) {
      result = result.filter(
        (t) =>
          t.candidateRoles.length === 0 ||
          t.candidateRoles.includes(filter.candidateRole!)
      );
    }

    if (filter?.workflowInstanceId) {
      result = result.filter(
        (t) => t.workflowInstanceId === filter.workflowInstanceId
      );
    }

    if (filter?.priority) {
      result = result.filter((t) => t.priority === filter.priority);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    return result.map((t) => this.clone(t));
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const key = this.makeKey(tenantId, id);
    return this.tasks.delete(key);
  }

  public clear(): void {
    this.tasks.clear();
  }
}
