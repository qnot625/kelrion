import {
  WorkflowDefinitionRepository,
} from './workflow-definition-repository.js';
import {
  WorkflowInstanceRepository,
} from './workflow-instance-repository.js';
import { WorkflowDefinition } from './workflow-definition.js';
import { WorkflowInstance } from './workflow-instance.js';
import {
  ConditionEvaluator,
  DefaultConditionEvaluator,
  WorkflowStep,
} from './value-objects.js';
import { HumanTaskService } from './human-task-service.js';
import { WorkflowExecutionHistoryService } from './workflow-execution-history-service.js';
import { ApprovalTaskHandler } from './approval-hook.js';

export interface StartWorkflowParams {
  instanceId?: string;
  definitionId: string;
  version?: number;
  tenantId: string;
  startedBy: string;
  variables?: Record<string, any>;
}

export interface AdvanceWorkflowParams {
  instanceId: string;
  tenantId: string;
  executedBy: string;
  stepOutput?: Record<string, any>;
}

export interface CancelWorkflowParams {
  instanceId: string;
  tenantId: string;
  cancelledBy: string;
  reason?: string;
}

export interface CreateInstanceParams {
  tenantId: string;
  workflowDefinitionId: string;
  workflowVersion?: number;
  initialContext?: Record<string, any>;
  parentInstanceId?: string;
  actorUserId: string;
}

export class WorkflowExecutionService {
  private readonly definitionRepo: WorkflowDefinitionRepository;
  private readonly instanceRepo: WorkflowInstanceRepository;
  private readonly conditionEvaluator: ConditionEvaluator;
  private readonly auditLogger?: (action: string, payload: Record<string, any>) => Promise<void>;
  private readonly humanTaskService?: HumanTaskService;
  private readonly historyService?: WorkflowExecutionHistoryService;
  private approvalTaskHandler?: ApprovalTaskHandler;
  private automaticTaskHandler?: (
    step: WorkflowStep,
    instance: WorkflowInstance,
    executorId: string
  ) => Promise<Record<string, any> | void>;

  public setApprovalTaskHandler(handler: ApprovalTaskHandler): void {
    this.approvalTaskHandler = handler;
  }

  public setAutomaticTaskHandler(
    handler: (step: WorkflowStep, instance: WorkflowInstance, executorId: string) => Promise<Record<string, any> | void>
  ): void {
    this.automaticTaskHandler = handler;
  }

  constructor(
    definitionRepo: WorkflowDefinitionRepository,
    instanceRepo: WorkflowInstanceRepository,
    conditionEvaluatorOrHumanTaskService?: ConditionEvaluator | HumanTaskService,
    auditLoggerOrHistoryService?: ((action: string, payload: Record<string, any>) => Promise<void>) | WorkflowExecutionHistoryService,
    humanTaskService?: HumanTaskService,
    historyService?: WorkflowExecutionHistoryService
  ) {
    this.definitionRepo = definitionRepo;
    this.instanceRepo = instanceRepo;

    if (
      conditionEvaluatorOrHumanTaskService &&
      typeof (conditionEvaluatorOrHumanTaskService as any).evaluate === 'function'
    ) {
      this.conditionEvaluator = conditionEvaluatorOrHumanTaskService as ConditionEvaluator;
      this.auditLogger = typeof auditLoggerOrHistoryService === 'function' ? auditLoggerOrHistoryService : undefined;
      this.humanTaskService = humanTaskService;
      this.historyService = historyService;
    } else {
      this.conditionEvaluator = new DefaultConditionEvaluator();
      this.humanTaskService = conditionEvaluatorOrHumanTaskService as HumanTaskService | undefined;
      this.historyService = auditLoggerOrHistoryService as WorkflowExecutionHistoryService | undefined;
      this.auditLogger = undefined;
    }
  }

  public async createInstance(params: CreateInstanceParams): Promise<WorkflowInstance> {
    let definition: WorkflowDefinition | null = null;
    if (params.workflowVersion) {
      definition = await this.definitionRepo.findByIdAndVersion(
        params.workflowDefinitionId,
        params.workflowVersion,
        params.tenantId
      );
    } else {
      definition = await this.definitionRepo.findById(
        params.workflowDefinitionId,
        params.tenantId
      );
    }

    if (!definition) {
      throw new Error(
        `Workflow definition '${params.workflowDefinitionId}' not found for tenant '${params.tenantId}'`
      );
    }

    if (definition.status !== 'PUBLISHED') {
      throw new Error(
        `Cannot create workflow instance for definition '${definition.id}' because status is '${definition.status}' (must be PUBLISHED)`
      );
    }

    const instanceId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const instance = WorkflowInstance.create({
      id: instanceId,
      tenantId: params.tenantId,
      workflowDefinitionId: definition.id,
      workflowVersion: definition.version,
      startedBy: params.actorUserId,
      variables: params.initialContext || {},
      parentInstanceId: params.parentInstanceId,
    });

    await this.instanceRepo.save(instance);

    if (this.historyService) {
      await this.historyService.recordEvent({
        tenantId: params.tenantId,
        workflowInstanceId: instance.id,
        workflowDefinitionId: definition.id,
        eventType: 'INSTANCE_CREATED',
        fromStatus: 'PENDING',
        toStatus: 'PENDING',
        actorUserId: params.actorUserId,
        eventData: { initialContext: params.initialContext },
      });
    }

    return instance;
  }

  public async startWorkflow(
    paramsOrInstanceId: StartWorkflowParams | string,
    tenantId?: string,
    actorUserId?: string
  ): Promise<WorkflowInstance> {
    if (typeof paramsOrInstanceId === 'string') {
      if (!tenantId) throw new Error('tenantId is required');
      const instance = await this.instanceRepo.findById(paramsOrInstanceId, tenantId);
      if (!instance) {
        throw new Error(`Workflow instance '${paramsOrInstanceId}' not found for tenant '${tenantId}'`);
      }

      const definition = await this.definitionRepo.findByIdAndVersion(
        instance.workflowDefinitionId,
        instance.workflowVersion,
        tenantId
      );

      if (!definition) {
        throw new Error(`Workflow definition '${instance.workflowDefinitionId}' not found for tenant '${tenantId}'`);
      }

      const executor = actorUserId || instance.startedBy;
      instance.start(definition, executor);

      if (this.historyService) {
        await this.historyService.recordEvent({
          tenantId,
          workflowInstanceId: instance.id,
          workflowDefinitionId: definition.id,
          eventType: 'INSTANCE_STARTED',
          fromStatus: 'PENDING',
          toStatus: 'RUNNING',
          actorUserId: executor,
        });
      }

      await this.processStepAdvancement(instance, definition, executor);
      await this.instanceRepo.save(instance);
      return instance;
    }

    // Object overload
    const params = paramsOrInstanceId;
    let definition: WorkflowDefinition | null = null;
    if (params.version) {
      definition = await this.definitionRepo.findByIdAndVersion(
        params.definitionId,
        params.version,
        params.tenantId
      );
    } else {
      definition = await this.definitionRepo.findById(
        params.definitionId,
        params.tenantId
      );
    }

    if (!definition) {
      throw new Error(
        `Workflow definition '${params.definitionId}' not found for tenant '${params.tenantId}'`
      );
    }

    if (definition.status !== 'PUBLISHED') {
      throw new Error(
        `Cannot start workflow definition '${definition.id}' because status is '${definition.status}' (must be PUBLISHED)`
      );
    }

    const instanceId = params.instanceId ?? `inst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const instance = WorkflowInstance.create({
      id: instanceId,
      tenantId: params.tenantId,
      workflowDefinitionId: definition.id,
      workflowVersion: definition.version,
      startedBy: params.startedBy,
      variables: params.variables,
    });

    instance.start(definition, params.startedBy);

    if (this.historyService) {
      await this.historyService.recordEvent({
        tenantId: params.tenantId,
        workflowInstanceId: instance.id,
        workflowDefinitionId: definition.id,
        eventType: 'INSTANCE_STARTED',
        fromStatus: 'PENDING',
        toStatus: 'RUNNING',
        actorUserId: params.startedBy,
      });
    }

    await this.processStepAdvancement(instance, definition, params.startedBy);
    await this.instanceRepo.save(instance);

    if (this.auditLogger) {
      await this.auditLogger('workflow.started', {
        instanceId: instance.id,
        definitionId: definition.id,
        tenantId: params.tenantId,
        startedBy: params.startedBy,
      });
    }

    return instance;
  }

  public async advanceWorkflow(
    paramsOrInstanceId: AdvanceWorkflowParams | string,
    tenantId?: string,
    stepOutput?: Record<string, any>,
    actorUserId?: string
  ): Promise<WorkflowInstance> {
    const params: AdvanceWorkflowParams =
      typeof paramsOrInstanceId === 'string'
        ? {
            instanceId: paramsOrInstanceId,
            tenantId: tenantId!,
            executedBy: actorUserId || 'system',
            stepOutput,
          }
        : paramsOrInstanceId;

    const instance = await this.instanceRepo.findById(params.instanceId, params.tenantId);

    if (!instance) {
      throw new Error(
        `Workflow instance '${params.instanceId}' not found for tenant '${params.tenantId}'`
      );
    }

    if (instance.status !== 'RUNNING' && instance.status !== 'WAITING') {
      throw new Error(
        `Cannot advance workflow instance '${params.instanceId}' in state '${instance.status}'`
      );
    }

    const definition = await this.definitionRepo.findByIdAndVersion(
      instance.workflowDefinitionId,
      instance.workflowVersion,
      params.tenantId
    );

    if (!definition) {
      throw new Error(
        `Workflow definition '${instance.workflowDefinitionId}' v${instance.workflowVersion} not found`
      );
    }

    if (instance.status === 'WAITING') {
      instance.resumeRunning();
    }

    if (!instance.currentStepId) {
      throw new Error('Workflow instance has no current active step');
    }

    const currentStep = definition.getStep(instance.currentStepId);
    if (!currentStep) {
      throw new Error(`Current step '${instance.currentStepId}' not found in definition`);
    }

    if (params.stepOutput) {
      instance.setVariables(params.stepOutput);
    }

    const targetStepId = this.resolveNextStep(currentStep, instance.variables);
    if (!targetStepId) {
      instance.fail(`No valid transition rule matched for step '${currentStep.id}'`);
      await this.instanceRepo.save(instance);
      return instance;
    }

    instance.transitionToStep(
      targetStepId,
      definition,
      params.executedBy,
      params.stepOutput
    );

    if (this.historyService) {
      await this.historyService.recordEvent({
        tenantId: params.tenantId,
        workflowInstanceId: instance.id,
        workflowDefinitionId: definition.id,
        stepId: targetStepId,
        eventType: 'STEP_TRANSITIONED',
        fromStatus: 'RUNNING',
        toStatus: instance.status,
        actorUserId: params.executedBy,
        eventData: { stepOutput: params.stepOutput },
      });
    }

    await this.processStepAdvancement(instance, definition, params.executedBy);
    await this.instanceRepo.save(instance);

    if (this.auditLogger) {
      await this.auditLogger('workflow.advanced', {
        instanceId: instance.id,
        currentStepId: instance.currentStepId,
        status: instance.status,
        executedBy: params.executedBy,
      });
    }

    return instance;
  }

  public async cancelWorkflow(
    paramsOrInstanceId: CancelWorkflowParams | string,
    tenantId?: string,
    reason?: string,
    cancelledBy?: string
  ): Promise<WorkflowInstance> {
    const params: CancelWorkflowParams =
      typeof paramsOrInstanceId === 'string'
        ? {
            instanceId: paramsOrInstanceId,
            tenantId: tenantId!,
            cancelledBy: cancelledBy || 'system',
            reason,
          }
        : paramsOrInstanceId;

    const instance = await this.instanceRepo.findById(params.instanceId, params.tenantId);

    if (!instance) {
      throw new Error(
        `Workflow instance '${params.instanceId}' not found for tenant '${params.tenantId}'`
      );
    }

    const prevStatus = instance.status;
    instance.cancel(params.cancelledBy, params.reason);
    await this.instanceRepo.save(instance);

    if (this.historyService) {
      await this.historyService.recordEvent({
        tenantId: params.tenantId,
        workflowInstanceId: instance.id,
        workflowDefinitionId: instance.workflowDefinitionId,
        eventType: 'INSTANCE_CANCELLED',
        fromStatus: prevStatus,
        toStatus: 'CANCELLED',
        actorUserId: params.cancelledBy,
        eventData: { reason: params.reason },
      });
    }

    if (this.auditLogger) {
      await this.auditLogger('workflow.cancelled', {
        instanceId: instance.id,
        cancelledBy: params.cancelledBy,
        reason: params.reason,
      });
    }

    return instance;
  }

  public async getInstance(instanceId: string, tenantId: string): Promise<WorkflowInstance | null> {
    return this.instanceRepo.findById(instanceId, tenantId);
  }

  public async getWorkflowInstance(
    instanceId: string,
    tenantId: string
  ): Promise<WorkflowInstance> {
    const instance = await this.instanceRepo.findById(instanceId, tenantId);
    if (!instance) {
      throw new Error(
        `Workflow instance '${instanceId}' not found for tenant '${tenantId}'`
      );
    }
    return instance;
  }

  public resolveNextStep(
    currentStep: WorkflowStep,
    variables: Record<string, any>
  ): string | null {
    if (!currentStep.transitions || currentStep.transitions.length === 0) {
      return null;
    }

    let defaultTargetId: string | null = null;

    for (const rule of currentStep.transitions) {
      if (rule.isDefault) {
        defaultTargetId = rule.targetStepId;
      }

      if (!rule.condition) {
        return rule.targetStepId;
      }

      if (this.conditionEvaluator.evaluate(rule.condition, variables)) {
        return rule.targetStepId;
      }
    }

    return defaultTargetId;
  }

  private async processStepAdvancement(
    instance: WorkflowInstance,
    definition: WorkflowDefinition,
    executorId: string
  ): Promise<void> {
    let loopGuard = 0;
    const maxSteps = 100;

    while (
      instance.status === 'RUNNING' &&
      instance.currentStepId &&
      loopGuard < maxSteps
    ) {
      loopGuard++;
      const currentStep = definition.getStep(instance.currentStepId);
      if (!currentStep) break;

      if (
        currentStep.type === 'MANUAL_TASK' ||
        currentStep.type === 'APPROVAL_TASK'
      ) {
        instance.pauseWaiting(
          `Waiting for human action on step '${currentStep.name}'`
        );

        if (currentStep.type === 'APPROVAL_TASK' && this.approvalTaskHandler) {
          await this.approvalTaskHandler.createApprovalRequest({
            tenantId: instance.tenantId,
            workflowInstanceId: instance.id,
            workflowDefinitionId: definition.id,
            stepId: currentStep.id,
            stepName: currentStep.name || currentStep.id,
            assigneeId: currentStep.taskConfig?.assigneeId,
            candidateRoles: currentStep.taskConfig?.candidateRoles,
            metadata: currentStep.metadata,
            actorUserId: executorId,
          });
        } else if (this.humanTaskService) {
          const existingTasks = await this.humanTaskService.listTasks(instance.tenantId, {
            workflowInstanceId: instance.id,
            status: 'PENDING',
          });

          const activeTaskForStep = existingTasks.find((t) => t.stepId === currentStep.id);
          if (!activeTaskForStep) {
            await this.humanTaskService.createTask({
              tenantId: instance.tenantId,
              name: currentStep.name || currentStep.id,
              description: currentStep.description,
              workflowInstanceId: instance.id,
              workflowDefinitionId: definition.id,
              stepId: currentStep.id,
              assigneeId: currentStep.taskConfig?.assigneeId,
              candidateUsers: currentStep.taskConfig?.candidateUsers,
              candidateRoles: currentStep.taskConfig?.candidateRoles,
              candidateGroups: currentStep.taskConfig?.candidateGroups,
              priority: currentStep.taskConfig?.priority || 'MEDIUM',
              formDefinitionId: currentStep.taskConfig?.formDefinitionId,
              dueDate: currentStep.taskConfig?.dueDurationMs
                ? new Date(Date.now() + currentStep.taskConfig.dueDurationMs)
                : undefined,
              actorId: executorId,
            });
          }
        }
        break;
      }

      if (currentStep.type === 'END') {
        instance.complete();
        if (this.historyService) {
          await this.historyService.recordEvent({
            tenantId: instance.tenantId,
            workflowInstanceId: instance.id,
            workflowDefinitionId: definition.id,
            stepId: currentStep.id,
            eventType: 'INSTANCE_COMPLETED',
            fromStatus: 'RUNNING',
            toStatus: 'COMPLETED',
            actorUserId: executorId,
          });
        }
        break;
      }

      if (
        currentStep.type === 'START' ||
        currentStep.type === 'AUTOMATIC_TASK'
      ) {
        if (currentStep.type === 'AUTOMATIC_TASK' && this.automaticTaskHandler) {
          try {
            const output = await this.automaticTaskHandler(currentStep, instance, executorId);
            if (output && typeof output === 'object') {
              instance.setVariables(output);
            }
          } catch (err: any) {
            instance.fail(`Automatic task '${currentStep.id}' failed: ${err.message}`);
            break;
          }
        }

        const nextTargetId = this.resolveNextStep(
          currentStep,
          instance.variables
        );
        if (!nextTargetId) {
          instance.fail(
            `No matching transition from step '${currentStep.id}' (${currentStep.type})`
          );
          break;
        }

        instance.transitionToStep(
          nextTargetId,
          definition,
          executorId
        );
      } else {
        break;
      }
    }

    if (loopGuard >= maxSteps) {
      instance.fail('Max workflow execution step limit reached (infinite loop guard)');
    }
  }
}
