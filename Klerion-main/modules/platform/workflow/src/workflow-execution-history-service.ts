import {
  WorkflowHistoryRecord,
  ExecutionEventType,
} from './workflow-execution-history.js';
import { WorkflowExecutionHistoryRepository } from './workflow-execution-history-repository.js';

export interface LogHistoryEventParams {
  id?: string;
  tenantId: string;
  workflowInstanceId: string;
  workflowDefinitionId?: string;
  stepId?: string;
  taskId?: string;
  eventType: ExecutionEventType;
  actorId: string;
  metadata?: Record<string, any>;
}

export class WorkflowExecutionHistoryService {
  constructor(
    private readonly historyRepo: WorkflowExecutionHistoryRepository,
    private readonly auditLogger?: (
      action: string,
      payload: Record<string, any>
    ) => Promise<void>
  ) {}

  public async logEvent(
    params: LogHistoryEventParams
  ): Promise<WorkflowHistoryRecord> {
    const recordId =
      params.id ?? `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const record = WorkflowHistoryRecord.create({
      id: recordId,
      tenantId: params.tenantId,
      workflowInstanceId: params.workflowInstanceId,
      workflowDefinitionId: params.workflowDefinitionId,
      stepId: params.stepId,
      taskId: params.taskId,
      eventType: params.eventType,
      actorId: params.actorId,
      metadata: params.metadata,
    });

    await this.historyRepo.save(record);

    if (this.auditLogger) {
      await this.auditLogger(`workflow.history.${params.eventType.toLowerCase()}`, {
        historyId: record.id,
        tenantId: record.tenantId,
        workflowInstanceId: record.workflowInstanceId,
        stepId: record.stepId,
        taskId: record.taskId,
        actorId: record.actorId,
        eventType: record.eventType,
        metadata: record.metadata,
      });
    }

    return record;
  }

  public async getHistoryForInstance(
    instanceId: string,
    tenantId: string
  ): Promise<WorkflowHistoryRecord[]> {
    return this.historyRepo.getHistoryByInstance(instanceId, tenantId);
  }

  public async getHistoryForTenant(
    tenantId: string
  ): Promise<WorkflowHistoryRecord[]> {
    return this.historyRepo.getHistoryByTenant(tenantId);
  }

  public async recordEvent(params: {
    tenantId: string;
    workflowInstanceId: string;
    workflowDefinitionId?: string;
    stepId?: string;
    taskId?: string;
    eventType: any;
    actorUserId?: string;
    actorId?: string;
    eventData?: Record<string, any>;
    metadata?: Record<string, any>;
    fromStatus?: string;
    toStatus?: string;
  }): Promise<WorkflowHistoryRecord> {
    return this.logEvent({
      tenantId: params.tenantId,
      workflowInstanceId: params.workflowInstanceId,
      workflowDefinitionId: params.workflowDefinitionId,
      stepId: params.stepId,
      taskId: params.taskId,
      eventType: (params.eventType as ExecutionEventType) || 'STEP_ENTERED',
      actorId: params.actorUserId || params.actorId || 'system',
      metadata: params.eventData || params.metadata,
    });
  }

  public async getHistory(instanceId: string, tenantId: string): Promise<WorkflowHistoryRecord[]> {
    return this.getHistoryForInstance(instanceId, tenantId);
  }
}
