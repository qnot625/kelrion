import type { WorkflowDefinition } from "./definition.js";
import type { HumanTask, WorkflowInstance } from "./instance.js";
import type { HumanTaskRepository, WorkflowDefinitionRepository, WorkflowInstanceRepository } from "./repositories.js";
import type { HumanTaskStatus, WorkflowInstanceStatus, WorkflowTriggerType } from "./types.js";

export class InMemoryWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  private readonly current = new Map<string, WorkflowDefinition>();
  private readonly versions = new Map<string, WorkflowDefinition>();

  async findById(tenantId: string, id: string) { return this.current.get(this.key(tenantId, id))?.clone() ?? null; }
  async listByTenant(tenantId: string) {
    return [...this.current.values()].filter((item) => item.tenantId === tenantId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.clone());
  }
  async findPublishedVersion(tenantId: string, id: string, version: number) { return this.versions.get(this.versionKey(tenantId, id, version))?.clone() ?? null; }
  async findLatestPublishedVersion(tenantId: string, id: string) { return (await this.listPublishedVersions(tenantId, id))[0] ?? null; }
  async listPublishedVersions(tenantId: string, id: string) {
    return [...this.versions.values()].filter((item) => item.tenantId === tenantId && item.id === id).sort((a, b) => b.version - a.version).map((item) => item.clone());
  }
  async findPublishedByTrigger(tenantId: string, triggerType: WorkflowTriggerType, reference?: string | null) {
    const current = await this.listByTenant(tenantId);
    const results: WorkflowDefinition[] = [];
    for (const item of current) {
      if (item.status === "ARCHIVED") continue;
      const published = await this.findLatestPublishedVersion(tenantId, item.id);
      if (!published) continue;
      if (published.triggers.some((trigger) => trigger.type === triggerType && this.matchesReference(triggerType, trigger, reference))) results.push(published);
    }
    return results;
  }
  async save(definition: WorkflowDefinition) { this.current.set(this.key(definition.tenantId, definition.id), definition.clone()); }
  async savePublishedVersion(definition: WorkflowDefinition) {
    if (definition.status !== "PUBLISHED") throw new Error("Only published workflows can be version snapshots");
    this.versions.set(this.versionKey(definition.tenantId, definition.id, definition.version), definition.clone());
  }
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private versionKey(tenantId: string, id: string, version: number) { return `${tenantId}:${id}:${version}`; }
  private matchesReference(type: WorkflowTriggerType, trigger: { eventName?: string | null; formDefinitionId?: string | null }, reference?: string | null) {
    if (type === "FORM_SUBMISSION") return trigger.formDefinitionId === reference;
    if (type === "EVENT") return trigger.eventName === reference;
    return true;
  }
}

export class InMemoryWorkflowInstanceRepository implements WorkflowInstanceRepository {
  private readonly items = new Map<string, WorkflowInstance>();
  async findById(tenantId: string, id: string) { const item = this.items.get(this.key(tenantId, id)); return item?.tenantId === tenantId ? item.clone() : null; }
  async listByTenant(tenantId: string, status?: WorkflowInstanceStatus) { return this.list((item) => item.tenantId === tenantId && (!status || item.status === status)); }
  async listByDefinition(tenantId: string, definitionId: string) { return this.list((item) => item.tenantId === tenantId && item.workflowDefinitionId === definitionId); }
  async findBySource(tenantId: string, sourceType: WorkflowTriggerType, sourceReferenceId: string) { return this.list((item) => item.tenantId === tenantId && item.sourceType === sourceType && item.sourceReferenceId === sourceReferenceId); }
  async save(instance: WorkflowInstance) { this.items.set(this.key(instance.tenantId, instance.id), instance.clone()); }
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private list(predicate: (item: WorkflowInstance) => boolean) { return [...this.items.values()].filter(predicate).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.clone()); }
}

export class InMemoryHumanTaskRepository implements HumanTaskRepository {
  private readonly items = new Map<string, HumanTask>();
  async findById(tenantId: string, id: string) { const item = this.items.get(this.key(tenantId, id)); return item?.tenantId === tenantId ? item.clone() : null; }
  async findOpenByInstanceStep(tenantId: string, workflowInstanceId: string, stepId: string) {
    return this.list((item) => item.tenantId === tenantId && item.workflowInstanceId === workflowInstanceId && item.stepId === stepId && !["COMPLETED", "CANCELLED"].includes(item.status))[0] ?? null;
  }
  async listByTenant(tenantId: string, status?: HumanTaskStatus) { return this.list((item) => item.tenantId === tenantId && (!status || item.status === status)); }
  async listForUser(tenantId: string, userId: string, roles: readonly string[]) {
    return this.list((item) => item.tenantId === tenantId && !["COMPLETED", "CANCELLED"].includes(item.status) && item.isEligible(userId, roles));
  }
  async save(task: HumanTask) { this.items.set(this.key(task.tenantId, task.id), task.clone()); }
  private key(tenantId: string, id: string) { return `${tenantId}:${id}`; }
  private list(predicate: (item: HumanTask) => boolean) { return [...this.items.values()].filter(predicate).sort((a, b) => (b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER)).map((item) => item.clone()); }
}
