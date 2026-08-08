import type { WorkflowDefinition } from "./definition.js";
import type { HumanTask, WorkflowInstance } from "./instance.js";
import type { HumanTaskStatus, WorkflowInstanceStatus, WorkflowTriggerType } from "./types.js";

export interface WorkflowDefinitionRepository {
  findById(tenantId: string, id: string): Promise<WorkflowDefinition | null>;
  listByTenant(tenantId: string): Promise<WorkflowDefinition[]>;
  findPublishedVersion(tenantId: string, id: string, version: number): Promise<WorkflowDefinition | null>;
  findLatestPublishedVersion(tenantId: string, id: string): Promise<WorkflowDefinition | null>;
  listPublishedVersions(tenantId: string, id: string): Promise<WorkflowDefinition[]>;
  findPublishedByTrigger(tenantId: string, triggerType: WorkflowTriggerType, reference?: string | null): Promise<WorkflowDefinition[]>;
  save(definition: WorkflowDefinition): Promise<void>;
  savePublishedVersion(definition: WorkflowDefinition): Promise<void>;
}

export interface WorkflowInstanceRepository {
  findById(tenantId: string, id: string): Promise<WorkflowInstance | null>;
  listByTenant(tenantId: string, status?: WorkflowInstanceStatus): Promise<WorkflowInstance[]>;
  listByDefinition(tenantId: string, definitionId: string): Promise<WorkflowInstance[]>;
  findBySource(tenantId: string, sourceType: WorkflowTriggerType, sourceReferenceId: string): Promise<WorkflowInstance[]>;
  save(instance: WorkflowInstance): Promise<void>;
}

export interface HumanTaskRepository {
  findById(tenantId: string, id: string): Promise<HumanTask | null>;
  findOpenByInstanceStep(tenantId: string, workflowInstanceId: string, stepId: string): Promise<HumanTask | null>;
  listByTenant(tenantId: string, status?: HumanTaskStatus): Promise<HumanTask[]>;
  listForUser(tenantId: string, userId: string, roles: readonly string[]): Promise<HumanTask[]>;
  save(task: HumanTask): Promise<void>;
}
