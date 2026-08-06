import { WorkflowInstance, InstanceState } from './workflow-instance.js';

export interface WorkflowInstanceFilter {
  status?: InstanceState;
  startedBy?: string;
}

export interface WorkflowInstanceRepository {
  save(instance: WorkflowInstance): Promise<void>;
  findById(id: string, tenantId: string): Promise<WorkflowInstance | null>;
  listByDefinition(
    definitionId: string,
    tenantId: string
  ): Promise<WorkflowInstance[]>;
  listByTenant(
    tenantId: string,
    filter?: WorkflowInstanceFilter
  ): Promise<WorkflowInstance[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
