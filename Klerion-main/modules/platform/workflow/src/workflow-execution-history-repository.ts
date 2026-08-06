import { WorkflowHistoryRecord } from './workflow-execution-history.js';

export interface WorkflowExecutionHistoryRepository {
  save(record: WorkflowHistoryRecord): Promise<void>;
  getHistoryByInstance(
    instanceId: string,
    tenantId: string
  ): Promise<WorkflowHistoryRecord[]>;
  getHistoryByTenant(tenantId: string): Promise<WorkflowHistoryRecord[]>;
}
