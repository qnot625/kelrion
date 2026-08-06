import { WorkflowInstance } from './workflow-instance.js';
import {
  WorkflowInstanceRepository,
  WorkflowInstanceFilter,
} from './workflow-instance-repository.js';

export class InMemoryWorkflowInstanceRepository
  implements WorkflowInstanceRepository
{
  // Key: `${tenantId}:${id}`
  private instances: Map<string, WorkflowInstance> = new Map();

  private makeKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private clone(inst: WorkflowInstance): WorkflowInstance {
    const json = inst.toJSON();
    return new WorkflowInstance({
      id: json.id,
      tenantId: json.tenantId,
      workflowDefinitionId: json.workflowDefinitionId,
      workflowVersion: json.workflowVersion,
      status: json.status as any,
      currentStepId: json.currentStepId,
      completedStepIds: json.completedStepIds,
      variables: json.variables,
      executionHistory: json.executionHistory.map((h: any) => ({
        ...h,
        startedAt: new Date(h.startedAt),
        completedAt: h.completedAt ? new Date(h.completedAt) : undefined,
      })),
      startedBy: json.startedBy,
      createdAt: new Date(json.createdAt),
      updatedAt: new Date(json.updatedAt),
      startedAt: json.startedAt ? new Date(json.startedAt) : undefined,
      completedAt: json.completedAt ? new Date(json.completedAt) : undefined,
      cancelledAt: json.cancelledAt ? new Date(json.cancelledAt) : undefined,
      failedAt: json.failedAt ? new Date(json.failedAt) : undefined,
      failureReason: json.failureReason,
    });
  }

  public async save(instance: WorkflowInstance): Promise<void> {
    const key = this.makeKey(instance.tenantId, instance.id);
    this.instances.set(key, this.clone(instance));
  }

  public async findById(
    id: string,
    tenantId: string
  ): Promise<WorkflowInstance | null> {
    const key = this.makeKey(tenantId, id);
    const inst = this.instances.get(key);
    if (!inst) return null;
    return this.clone(inst);
  }

  public async listByDefinition(
    definitionId: string,
    tenantId: string
  ): Promise<WorkflowInstance[]> {
    const matching: WorkflowInstance[] = [];
    for (const inst of this.instances.values()) {
      if (inst.tenantId === tenantId && inst.workflowDefinitionId === definitionId) {
        matching.push(this.clone(inst));
      }
    }
    return matching;
  }

  public async listByTenant(
    tenantId: string,
    filter?: WorkflowInstanceFilter
  ): Promise<WorkflowInstance[]> {
    let result: WorkflowInstance[] = [];
    for (const inst of this.instances.values()) {
      if (inst.tenantId !== tenantId) continue;
      result.push(inst);
    }

    if (filter?.status) {
      result = result.filter((i) => i.status === filter.status);
    }

    if (filter?.startedBy) {
      result = result.filter((i) => i.startedBy === filter.startedBy);
    }

    return result.map((i) => this.clone(i));
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const key = this.makeKey(tenantId, id);
    return this.instances.delete(key);
  }

  public clear(): void {
    this.instances.clear();
  }
}
