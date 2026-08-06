export type ExecutionEventType =
  | 'WORKFLOW_STARTED'
  | 'STEP_ENTERED'
  | 'STEP_COMPLETED'
  | 'TASK_CREATED'
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_CLAIMED'
  | 'TASK_DELEGATED'
  | 'TASK_RELEASED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_CANCELLED'
  | 'TASK_EXPIRED'
  | 'TASK_ESCALATED'
  | 'WORKFLOW_ADVANCED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_CANCELLED'
  | 'WORKFLOW_FAILED';

export interface WorkflowHistoryRecordParams {
  id: string;
  tenantId: string;
  workflowInstanceId: string;
  workflowDefinitionId?: string;
  stepId?: string;
  taskId?: string;
  eventType: ExecutionEventType;
  actorId: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export class WorkflowHistoryRecord {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly workflowInstanceId: string;
  public readonly workflowDefinitionId?: string;
  public readonly stepId?: string;
  public readonly taskId?: string;
  public readonly eventType: ExecutionEventType;
  public readonly actorId: string;
  public readonly timestamp: Date;
  public readonly metadata: Record<string, any>;

  constructor(params: WorkflowHistoryRecordParams) {
    if (!params.id || params.id.trim() === '') {
      throw new Error('History record ID is required');
    }
    if (!params.tenantId || params.tenantId.trim() === '') {
      throw new Error('Tenant ID is required');
    }
    if (!params.workflowInstanceId || params.workflowInstanceId.trim() === '') {
      throw new Error('WorkflowInstance ID is required');
    }
    if (!params.actorId || params.actorId.trim() === '') {
      throw new Error('Actor ID is required');
    }

    this.id = params.id;
    this.tenantId = params.tenantId;
    this.workflowInstanceId = params.workflowInstanceId;
    this.workflowDefinitionId = params.workflowDefinitionId;
    this.stepId = params.stepId;
    this.taskId = params.taskId;
    this.eventType = params.eventType;
    this.actorId = params.actorId;
    this.timestamp = params.timestamp ?? new Date();
    this.metadata = params.metadata ? { ...params.metadata } : {};
  }

  public static create(params: {
    id: string;
    tenantId: string;
    workflowInstanceId: string;
    workflowDefinitionId?: string;
    stepId?: string;
    taskId?: string;
    eventType: ExecutionEventType;
    actorId: string;
    metadata?: Record<string, any>;
  }): WorkflowHistoryRecord {
    return new WorkflowHistoryRecord({
      ...params,
      timestamp: new Date(),
    });
  }

  public toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      workflowInstanceId: this.workflowInstanceId,
      workflowDefinitionId: this.workflowDefinitionId,
      stepId: this.stepId,
      taskId: this.taskId,
      eventType: this.eventType,
      actorId: this.actorId,
      timestamp: this.timestamp.toISOString(),
      metadata: { ...this.metadata },
    };
  }
}
