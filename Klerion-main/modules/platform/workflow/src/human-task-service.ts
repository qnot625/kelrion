import { HumanTask, TaskPriority, EscalationRule } from './human-task.js';
import { HumanTaskRepository, HumanTaskFilter } from './human-task-repository.js';
import {
  WorkflowExecutionHistoryRepository,
} from './workflow-execution-history-repository.js';
import {
  WorkflowHistoryRecord,
  ExecutionEventType,
} from './workflow-execution-history.js';

export interface CreateHumanTaskParams {
  id?: string;
  tenantId: string;
  workflowInstanceId: string;
  workflowDefinitionId?: string;
  stepId: string;
  name: string;
  description?: string;
  priority?: TaskPriority;
  assigneeId?: string;
  candidateUsers?: string[];
  candidateRoles?: string[];
  candidateGroups?: string[];
  dueDate?: Date;
  slaHours?: number;
  formDefinitionId?: string;
  metadata?: Record<string, any>;
  actorId: string;
}

export interface TaskCompletionCallback {
  (
    tenantId: string,
    workflowInstanceId: string,
    stepId: string,
    outputData?: Record<string, any>,
    actorId?: string
  ): Promise<void>;
}

export class HumanTaskService {
  constructor(
    private readonly taskRepo: HumanTaskRepository,
    private readonly historyRepo?: WorkflowExecutionHistoryRepository,
    private readonly auditLogger?: (
      action: string,
      payload: Record<string, any>
    ) => Promise<void>,
    private readonly onTaskCompleted?: TaskCompletionCallback
  ) {}

  public async createTask(params: CreateHumanTaskParams): Promise<HumanTask> {
    const taskId =
      params.id ?? `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const task = HumanTask.create({
      id: taskId,
      tenantId: params.tenantId,
      workflowInstanceId: params.workflowInstanceId,
      workflowDefinitionId: params.workflowDefinitionId,
      stepId: params.stepId,
      name: params.name,
      description: params.description,
      priority: params.priority,
      assigneeId: params.assigneeId,
      candidateUsers: params.candidateUsers,
      candidateRoles: params.candidateRoles,
      candidateGroups: params.candidateGroups,
      dueDate: params.dueDate,
      slaHours: params.slaHours,
      formDefinitionId: params.formDefinitionId,
      metadata: params.metadata,
    });

    await this.taskRepo.save(task);
    await this.recordEvent(
      task,
      'TASK_CREATED',
      params.actorId,
      { assigneeId: params.assigneeId, priority: task.priority }
    );

    return task;
  }

  public async getTask(id: string, tenantId: string): Promise<HumanTask> {
    const task = await this.taskRepo.findById(id, tenantId);
    if (!task) {
      throw new Error(`HumanTask '${id}' not found for tenant '${tenantId}'`);
    }
    return task;
  }

  public async listTasks(
    tenantId: string,
    filter?: HumanTaskFilter
  ): Promise<HumanTask[]> {
    return this.taskRepo.list(tenantId, filter);
  }

  public async assignTask(
    taskId: string,
    tenantId: string,
    assigneeId: string,
    actorId: string
  ): Promise<HumanTask> {
    const task = await this.getTask(taskId, tenantId);
    const isReassign = task.status === 'ASSIGNED' || task.status === 'CLAIMED';

    task.assign(assigneeId);
    await this.taskRepo.save(task);

    const eventType: ExecutionEventType = isReassign
      ? 'TASK_REASSIGNED'
      : 'TASK_ASSIGNED';

    await this.recordEvent(task, eventType, actorId, { assigneeId });
    return task;
  }

  public async reassignTask(
    taskId: string,
    tenantId: string,
    newAssigneeId: string,
    actorId: string
  ): Promise<HumanTask> {
    return this.assignTask(taskId, tenantId, newAssigneeId, actorId);
  }

  public async delegateTask(
    taskId: string,
    tenantId: string,
    fromUserId: string,
    toUserId: string,
    reason?: string
  ): Promise<HumanTask> {
    const task = await this.getTask(taskId, tenantId);
    task.delegate(fromUserId, toUserId, reason);

    await this.taskRepo.save(task);
    await this.recordEvent(task, 'TASK_DELEGATED', fromUserId, {
      fromUserId,
      toUserId,
      reason,
    });

    return task;
  }

  public async claimTask(
    taskId: string,
    tenantId: string,
    userId: string,
    userRoles: string[] = []
  ): Promise<HumanTask> {
    const task = await this.getTask(taskId, tenantId);
    task.claim(userId, userRoles);

    await this.taskRepo.save(task);
    await this.recordEvent(task, 'TASK_CLAIMED', userId, { claimedBy: userId });

    return task;
  }

  public async releaseTask(
    taskId: string,
    tenantId: string,
    actorId: string
  ): Promise<HumanTask> {
    const task = await this.getTask(taskId, tenantId);
    task.release();

    await this.taskRepo.save(task);
    await this.recordEvent(task, 'TASK_RELEASED', actorId, { releasedBy: actorId });

    return task;
  }

  public async startTask(
    taskId: string,
    tenantId: string,
    userId: string
  ): Promise<HumanTask> {
    const task = await this.getTask(taskId, tenantId);
    task.start(userId);

    await this.taskRepo.save(task);
    await this.recordEvent(task, 'TASK_STARTED', userId, { startedBy: userId });

    return task;
  }

  public async completeTask(
    paramsOrTaskId:
      | {
          taskId: string;
          tenantId: string;
          actorUserId?: string;
          userId?: string;
          outcome?: string;
          outputData?: Record<string, unknown>;
          formData?: Record<string, unknown>;
        }
      | string,
    tenantId?: string,
    userId?: string,
    formData?: Record<string, unknown>
  ): Promise<HumanTask> {
    const taskId =
      typeof paramsOrTaskId === 'string'
        ? paramsOrTaskId
        : paramsOrTaskId.taskId;
    const tId =
      typeof paramsOrTaskId === 'string'
        ? tenantId!
        : paramsOrTaskId.tenantId;
    const uId =
      typeof paramsOrTaskId === 'string'
        ? userId!
        : paramsOrTaskId.actorUserId || paramsOrTaskId.userId || 'system';
    const data =
      typeof paramsOrTaskId === 'string'
        ? formData
        : paramsOrTaskId.outputData || paramsOrTaskId.formData;

    const task = await this.getTask(taskId, tId);
    task.complete(uId, data);

    await this.taskRepo.save(task);
    await this.recordEvent(task, 'TASK_COMPLETED', uId, {
      completedBy: uId,
      formData: data,
    });

    if (this.onTaskCompleted) {
      await this.onTaskCompleted(
        tId,
        task.workflowInstanceId,
        task.stepId,
        data,
        uId
      );
    }

    return task;
  }

  public async cancelTask(
    taskId: string,
    tenantId: string,
    cancelledBy: string,
    reason?: string
  ): Promise<HumanTask> {
    const task = await this.getTask(taskId, tenantId);
    task.cancel(reason);

    await this.taskRepo.save(task);
    await this.recordEvent(task, 'TASK_CANCELLED', cancelledBy, {
      cancelledBy,
      reason,
    });

    return task;
  }

  public async expireTask(
    taskId: string,
    tenantId: string,
    reason?: string,
    actorId: string = 'system'
  ): Promise<HumanTask> {
    const task = await this.getTask(taskId, tenantId);
    task.expire(reason);

    await this.taskRepo.save(task);
    await this.recordEvent(task, 'TASK_EXPIRED', actorId, { reason });

    return task;
  }

  public async checkAndProcessEscalations(
    tenantId: string,
    rules: EscalationRule[] = []
  ): Promise<HumanTask[]> {
    const activeTasks = await this.taskRepo.list(tenantId);
    const now = new Date();
    const escalatedTasks: HumanTask[] = [];

    for (const task of activeTasks) {
      if (
        task.status === 'COMPLETED' ||
        task.status === 'CANCELLED' ||
        task.status === 'EXPIRED'
      ) {
        continue;
      }

      let isEscalated = false;

      // Rule 1: Due date passed
      if (task.dueDate && task.dueDate.getTime() < now.getTime()) {
        const matchingRule = rules.find((r) => r.trigger === 'DUE_DATE_PASSED') ?? {
          id: 'rule_due_passed',
          trigger: 'DUE_DATE_PASSED' as const,
          action: 'NOTIFY_EVENT' as const,
        };
        task.escalate(matchingRule);
        isEscalated = true;
      }

      // Rule 2: SLA Hours exceeded
      if (!isEscalated && task.slaHours && task.createdAt) {
        const slaMillis = task.slaHours * 60 * 60 * 1000;
        if (now.getTime() - task.createdAt.getTime() > slaMillis) {
          const matchingRule = rules.find((r) => r.trigger === 'SLA_EXCEEDED') ?? {
            id: 'rule_sla_exceeded',
            trigger: 'SLA_EXCEEDED' as const,
            action: 'NOTIFY_EVENT' as const,
          };
          task.escalate(matchingRule);
          isEscalated = true;
        }
      }

      if (isEscalated) {
        await this.taskRepo.save(task);
        await this.recordEvent(task, 'TASK_ESCALATED', 'system', {
          escalationCount: task.escalationCount,
          status: task.status,
          assigneeId: task.assigneeId,
        });
        escalatedTasks.push(task);
      }
    }

    return escalatedTasks;
  }

  private async recordEvent(
    task: HumanTask,
    eventType: ExecutionEventType,
    actorId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (this.historyRepo) {
      const historyRecord = WorkflowHistoryRecord.create({
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        tenantId: task.tenantId,
        workflowInstanceId: task.workflowInstanceId,
        workflowDefinitionId: task.workflowDefinitionId,
        stepId: task.stepId,
        taskId: task.id,
        eventType,
        actorId,
        metadata: {
          taskName: task.name,
          status: task.status,
          ...metadata,
        },
      });
      await this.historyRepo.save(historyRecord);
    }

    if (this.auditLogger) {
      await this.auditLogger(`workflow.task.${eventType.toLowerCase()}`, {
        taskId: task.id,
        tenantId: task.tenantId,
        workflowInstanceId: task.workflowInstanceId,
        stepId: task.stepId,
        actorId,
        eventType,
        ...metadata,
      });
    }
  }
}
