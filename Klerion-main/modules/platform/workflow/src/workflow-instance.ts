import { StepType } from './value-objects.js';
import { WorkflowDefinition } from './workflow-definition.js';

export type InstanceState =
  | 'NOT_STARTED'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export interface StepExecutionLog {
  stepId: string;
  stepName: string;
  stepType: StepType;
  status: 'STARTED' | 'WAITING' | 'COMPLETED' | 'SKIPPED' | 'FAILED';
  startedAt: Date;
  completedAt?: Date;
  executedBy?: string;
  output?: Record<string, any>;
  error?: string;
}

export interface WorkflowInstanceParams {
  id: string;
  tenantId: string;
  workflowDefinitionId: string;
  workflowVersion: number;
  status?: InstanceState;
  currentStepId?: string | null;
  completedStepIds?: string[];
  variables?: Record<string, any>;
  executionHistory?: StepExecutionLog[];
  startedBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  failedAt?: Date;
  failureReason?: string;
}

export class WorkflowInstance {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly workflowDefinitionId: string;
  public readonly workflowVersion: number;
  public status: InstanceState;
  public currentStepId: string | null;
  public completedStepIds: string[];
  public variables: Record<string, any>;
  public executionHistory: StepExecutionLog[];
  public readonly startedBy: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public startedAt?: Date;
  public completedAt?: Date;
  public cancelledAt?: Date;
  public failedAt?: Date;
  public failureReason?: string;

  constructor(params: WorkflowInstanceParams) {
    if (!params.id || params.id.trim() === '') {
      throw new Error('WorkflowInstance ID is required');
    }
    if (!params.tenantId || params.tenantId.trim() === '') {
      throw new Error('Tenant ID is required');
    }
    if (!params.workflowDefinitionId || params.workflowDefinitionId.trim() === '') {
      throw new Error('WorkflowDefinition ID is required');
    }

    this.id = params.id;
    this.tenantId = params.tenantId;
    this.workflowDefinitionId = params.workflowDefinitionId;
    this.workflowVersion = params.workflowVersion;
    this.status = params.status ?? 'NOT_STARTED';
    this.currentStepId = params.currentStepId ?? null;
    this.completedStepIds = params.completedStepIds ? [...params.completedStepIds] : [];
    this.variables = params.variables ? { ...params.variables } : {};
    this.executionHistory = params.executionHistory
      ? params.executionHistory.map((h) => ({
          ...h,
          startedAt: new Date(h.startedAt),
          completedAt: h.completedAt ? new Date(h.completedAt) : undefined,
          output: h.output ? { ...h.output } : undefined,
        }))
      : [];
    this.startedBy = params.startedBy;
    this.createdAt = params.createdAt ?? new Date();
    this.updatedAt = params.updatedAt ?? new Date();
    this.startedAt = params.startedAt;
    this.completedAt = params.completedAt;
    this.cancelledAt = params.cancelledAt;
    this.failedAt = params.failedAt;
    this.failureReason = params.failureReason;
  }

  public static create(params: {
    id: string;
    tenantId: string;
    workflowDefinitionId: string;
    workflowVersion: number;
    startedBy: string;
    variables?: Record<string, any>;
  }): WorkflowInstance {
    return new WorkflowInstance({
      ...params,
      status: 'NOT_STARTED',
    });
  }

  public start(definition: WorkflowDefinition, executorId: string): void {
    if (this.status !== 'NOT_STARTED') {
      throw new Error(`Cannot start workflow instance in state '${this.status}'`);
    }
    if (definition.id !== this.workflowDefinitionId) {
      throw new Error(
        `Definition ID mismatch: expected '${this.workflowDefinitionId}', got '${definition.id}'`
      );
    }
    if (definition.version !== this.workflowVersion) {
      throw new Error(
        `Definition version mismatch: expected ${this.workflowVersion}, got ${definition.version}`
      );
    }
    if (definition.status !== 'PUBLISHED') {
      throw new Error(
        `Cannot start workflow instance against non-published definition (status: ${definition.status})`
      );
    }

    definition.validateGraph();

    const startStep = definition.getStep(definition.startStepId);
    if (!startStep) {
      throw new Error(`Start step '${definition.startStepId}' not found in definition`);
    }

    this.status = 'RUNNING';
    this.currentStepId = startStep.id;
    this.startedAt = new Date();
    this.updatedAt = new Date();

    this.executionHistory.push({
      stepId: startStep.id,
      stepName: startStep.name,
      stepType: startStep.type,
      status: 'STARTED',
      startedAt: new Date(),
      executedBy: executorId,
    });
  }

  public pauseWaiting(_reason?: string): void {
    if (this.status !== 'RUNNING') {
      throw new Error(`Cannot transition to WAITING state from '${this.status}'`);
    }
    this.status = 'WAITING';
    this.updatedAt = new Date();

    if (this.currentStepId && this.executionHistory.length > 0) {
      const currentLog = this.executionHistory[this.executionHistory.length - 1];
      if (currentLog.stepId === this.currentStepId) {
        currentLog.status = 'WAITING';
      }
    }
  }

  public resumeRunning(): void {
    if (this.status !== 'WAITING') {
      throw new Error(`Cannot resume workflow instance from state '${this.status}'`);
    }
    this.status = 'RUNNING';
    this.updatedAt = new Date();

    if (this.currentStepId && this.executionHistory.length > 0) {
      const currentLog = this.executionHistory[this.executionHistory.length - 1];
      if (currentLog.stepId === this.currentStepId) {
        currentLog.status = 'STARTED';
      }
    }
  }

  public transitionToStep(
    targetStepId: string,
    definition: WorkflowDefinition,
    executorId?: string,
    output?: Record<string, any>
  ): void {
    if (this.status !== 'RUNNING' && this.status !== 'WAITING') {
      throw new Error(`Cannot transition step when workflow status is '${this.status}'`);
    }

    const targetStep = definition.getStep(targetStepId);
    if (!targetStep) {
      throw new Error(`Target step '${targetStepId}' not found in workflow definition`);
    }

    // Complete current step in history
    if (this.currentStepId) {
      this.completedStepIds.push(this.currentStepId);

      const lastLog = this.executionHistory[this.executionHistory.length - 1];
      if (lastLog && lastLog.stepId === this.currentStepId) {
        lastLog.status = 'COMPLETED';
        lastLog.completedAt = new Date();
        if (output) lastLog.output = { ...output };
      }
    }

    // Merge output into instance variables if provided
    if (output) {
      this.variables = { ...this.variables, ...output };
    }

    this.currentStepId = targetStep.id;
    this.updatedAt = new Date();

    if (targetStep.type === 'END') {
      this.executionHistory.push({
        stepId: targetStep.id,
        stepName: targetStep.name,
        stepType: targetStep.type,
        status: 'COMPLETED',
        startedAt: new Date(),
        completedAt: new Date(),
        executedBy: executorId,
      });
      this.completedStepIds.push(targetStep.id);
      this.status = 'COMPLETED';
      this.completedAt = new Date();
      this.currentStepId = null;
    } else {
      this.status = 'RUNNING';
      this.executionHistory.push({
        stepId: targetStep.id,
        stepName: targetStep.name,
        stepType: targetStep.type,
        status: 'STARTED',
        startedAt: new Date(),
        executedBy: executorId,
      });
    }
  }

  public complete(_reason?: string): void {
    if (this.status === 'COMPLETED') return;
    if (this.status === 'CANCELLED' || this.status === 'FAILED') {
      throw new Error(`Cannot complete instance in '${this.status}' state`);
    }

    this.status = 'COMPLETED';
    this.currentStepId = null;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  public cancel(cancelledBy: string, reason?: string): void {
    if (this.status === 'COMPLETED' || this.status === 'CANCELLED' || this.status === 'FAILED') {
      throw new Error(`Cannot cancel workflow instance in state '${this.status}'`);
    }

    this.status = 'CANCELLED';
    this.currentStepId = null;
    this.cancelledAt = new Date();
    this.failureReason = reason;
    this.updatedAt = new Date();
  }

  public fail(reason: string): void {
    if (this.status === 'COMPLETED' || this.status === 'CANCELLED' || this.status === 'FAILED') {
      throw new Error(`Cannot fail workflow instance in state '${this.status}'`);
    }

    this.status = 'FAILED';
    this.currentStepId = null;
    this.failedAt = new Date();
    this.failureReason = reason;
    this.updatedAt = new Date();

    if (this.executionHistory.length > 0) {
      const lastLog = this.executionHistory[this.executionHistory.length - 1];
      if (lastLog.status === 'STARTED' || lastLog.status === 'WAITING') {
        lastLog.status = 'FAILED';
        lastLog.error = reason;
        lastLog.completedAt = new Date();
      }
    }
  }

  public setVariables(newVars: Record<string, any>): void {
    this.variables = { ...this.variables, ...newVars };
    this.updatedAt = new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      workflowDefinitionId: this.workflowDefinitionId,
      workflowVersion: this.workflowVersion,
      status: this.status,
      currentStepId: this.currentStepId,
      completedStepIds: [...this.completedStepIds],
      variables: { ...this.variables },
      executionHistory: this.executionHistory.map((h) => ({
        ...h,
        startedAt: h.startedAt.toISOString(),
        completedAt: h.completedAt?.toISOString(),
      })),
      startedBy: this.startedBy,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      startedAt: this.startedAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      cancelledAt: this.cancelledAt?.toISOString(),
      failedAt: this.failedAt?.toISOString(),
      failureReason: this.failureReason,
    };
  }
}
