import { WorkflowHistoryRecord } from './workflow-execution-history.js';
import { WorkflowExecutionHistoryRepository } from './workflow-execution-history-repository.js';

export class InMemoryWorkflowExecutionHistoryRepository
  implements WorkflowExecutionHistoryRepository
{
  // Map key: `${tenantId}:${id}`
  private records: Map<string, WorkflowHistoryRecord> = new Map();

  private makeKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  private clone(rec: WorkflowHistoryRecord): WorkflowHistoryRecord {
    const json = rec.toJSON();
    return new WorkflowHistoryRecord({
      id: json.id,
      tenantId: json.tenantId,
      workflowInstanceId: json.workflowInstanceId,
      workflowDefinitionId: json.workflowDefinitionId,
      stepId: json.stepId,
      taskId: json.taskId,
      eventType: json.eventType,
      actorId: json.actorId,
      timestamp: new Date(json.timestamp),
      metadata: json.metadata,
    });
  }

  public async save(record: WorkflowHistoryRecord): Promise<void> {
    const key = this.makeKey(record.tenantId, record.id);
    this.records.set(key, this.clone(record));
  }

  public async getHistoryByInstance(
    instanceId: string,
    tenantId: string
  ): Promise<WorkflowHistoryRecord[]> {
    const matching: WorkflowHistoryRecord[] = [];
    for (const rec of this.records.values()) {
      if (rec.tenantId === tenantId && rec.workflowInstanceId === instanceId) {
        matching.push(this.clone(rec));
      }
    }

    matching.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return matching;
  }

  public async getHistoryByTenant(
    tenantId: string
  ): Promise<WorkflowHistoryRecord[]> {
    const matching: WorkflowHistoryRecord[] = [];
    for (const rec of this.records.values()) {
      if (rec.tenantId === tenantId) {
        matching.push(this.clone(rec));
      }
    }

    matching.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return matching;
  }

  public clear(): void {
    this.records.clear();
  }
}
