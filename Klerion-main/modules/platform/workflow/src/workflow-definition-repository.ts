import { WorkflowDefinition, DefinitionStatus } from './workflow-definition.js';

export interface WorkflowDefinitionFilter {
  status?: DefinitionStatus;
  search?: string;
}

export interface WorkflowDefinitionRepository {
  save(definition: WorkflowDefinition): Promise<void>;
  findById(id: string, tenantId: string): Promise<WorkflowDefinition | null>;
  findByIdAndVersion(
    id: string,
    version: number,
    tenantId: string
  ): Promise<WorkflowDefinition | null>;
  list(
    tenantId: string,
    filter?: WorkflowDefinitionFilter
  ): Promise<WorkflowDefinition[]>;
  delete(id: string, tenantId: string): Promise<boolean>;
}
