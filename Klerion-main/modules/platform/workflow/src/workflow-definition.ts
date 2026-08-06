import {
  WorkflowStep,
  WorkflowMetadata,
  Trigger,
} from './value-objects.js';

export type DefinitionStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface WorkflowDefinitionParams {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  version?: number;
  status?: DefinitionStatus;
  startStepId?: string;
  steps?: WorkflowStep[];
  triggers?: Trigger[];
  metadata?: WorkflowMetadata;
  createdAt?: Date;
  updatedAt?: Date;
  publishedAt?: Date;
  archivedAt?: Date;
}

export class WorkflowDefinition {
  public readonly id: string;
  public readonly tenantId: string;
  public name: string;
  public description?: string;
  public version: number;
  public status: DefinitionStatus;
  public startStepId: string;
  private stepsMap: Map<string, WorkflowStep>;
  public triggers: Trigger[];
  public metadata: WorkflowMetadata;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public publishedAt?: Date;
  public archivedAt?: Date;

  constructor(params: WorkflowDefinitionParams) {
    if (!params.id || params.id.trim() === '') {
      throw new Error('WorkflowDefinition ID is required');
    }
    if (!params.tenantId || params.tenantId.trim() === '') {
      throw new Error('Tenant ID is required');
    }
    if (!params.name || params.name.trim() === '') {
      throw new Error('Workflow name is required');
    }

    this.id = params.id;
    this.tenantId = params.tenantId;
    this.name = params.name;
    this.description = params.description;
    this.version = params.version ?? 1;
    this.status = params.status ?? 'DRAFT';
    this.startStepId = params.startStepId ?? '';
    this.triggers = params.triggers ? [...params.triggers] : [];
    this.metadata = params.metadata ? { ...params.metadata } : {};
    this.createdAt = params.createdAt ?? new Date();
    this.updatedAt = params.updatedAt ?? new Date();
    this.publishedAt = params.publishedAt;
    this.archivedAt = params.archivedAt;

    this.stepsMap = new Map();
    if (params.steps) {
      for (const step of params.steps) {
        if (this.stepsMap.has(step.id)) {
          throw new Error(`Duplicate step ID: ${step.id}`);
        }
        this.stepsMap.set(step.id, JSON.parse(JSON.stringify(step)));
      }
    }

    // Auto-detect start step if not explicitly set and a START type step exists
    if (!this.startStepId) {
      for (const step of this.stepsMap.values()) {
        if (step.type === 'START') {
          this.startStepId = step.id;
          break;
        }
      }
    }
  }

  public static create(params: {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    steps?: WorkflowStep[];
    triggers?: Trigger[];
    metadata?: WorkflowMetadata;
  }): WorkflowDefinition {
    return new WorkflowDefinition({
      ...params,
      version: 1,
      status: 'DRAFT',
    });
  }

  public get steps(): WorkflowStep[] {
    return Array.from(this.stepsMap.values()).map((s) =>
      JSON.parse(JSON.stringify(s))
    );
  }

  public getStep(stepId: string): WorkflowStep | undefined {
    const step = this.stepsMap.get(stepId);
    return step ? JSON.parse(JSON.stringify(step)) : undefined;
  }

  public addStep(step: WorkflowStep): void {
    if (this.status !== 'DRAFT') {
      throw new Error('Cannot add steps to a non-draft workflow definition');
    }
    if (!step.id || step.id.trim() === '') {
      throw new Error('Step ID is required');
    }
    if (this.stepsMap.has(step.id)) {
      throw new Error(`Duplicate step ID: ${step.id}`);
    }

    this.stepsMap.set(step.id, JSON.parse(JSON.stringify(step)));
    if (step.type === 'START' && !this.startStepId) {
      this.startStepId = step.id;
    }
    this.updatedAt = new Date();
  }

  public updateStep(stepId: string, updatedStep: WorkflowStep): void {
    if (this.status !== 'DRAFT') {
      throw new Error('Cannot update steps in a non-draft workflow definition');
    }
    if (!this.stepsMap.has(stepId)) {
      throw new Error(`Step not found: ${stepId}`);
    }
    if (updatedStep.id !== stepId) {
      throw new Error('Step ID cannot be changed');
    }

    this.stepsMap.set(stepId, JSON.parse(JSON.stringify(updatedStep)));
    this.updatedAt = new Date();
  }

  public removeStep(stepId: string): void {
    if (this.status !== 'DRAFT') {
      throw new Error('Cannot remove steps from a non-draft workflow definition');
    }
    if (!this.stepsMap.has(stepId)) {
      throw new Error(`Step not found: ${stepId}`);
    }

    this.stepsMap.delete(stepId);

    // Remove any incoming transitions referencing this step ID
    for (const step of this.stepsMap.values()) {
      step.transitions = step.transitions.filter(
        (t) => t.targetStepId !== stepId
      );
    }

    if (this.startStepId === stepId) {
      this.startStepId = '';
    }

    this.updatedAt = new Date();
  }

  public updateDraft(params: {
    name?: string;
    description?: string;
    triggers?: Trigger[];
    metadata?: WorkflowMetadata;
    startStepId?: string;
  }): void {
    if (this.status !== 'DRAFT') {
      throw new Error('Cannot edit non-draft workflow definition');
    }

    if (params.name !== undefined) {
      if (!params.name || params.name.trim() === '') {
        throw new Error('Workflow name cannot be empty');
      }
      this.name = params.name;
    }

    if (params.description !== undefined) {
      this.description = params.description;
    }

    if (params.triggers !== undefined) {
      this.triggers = [...params.triggers];
    }

    if (params.metadata !== undefined) {
      this.metadata = { ...params.metadata };
    }

    if (params.startStepId !== undefined) {
      if (params.startStepId && !this.stepsMap.has(params.startStepId)) {
        throw new Error(`Start step ID not found in steps: ${params.startStepId}`);
      }
      this.startStepId = params.startStepId;
    }

    this.updatedAt = new Date();
  }

  public validateGraph(): void {
    if (this.stepsMap.size === 0) {
      throw new Error('Workflow definition must contain at least one step');
    }

    if (!this.startStepId || !this.stepsMap.has(this.startStepId)) {
      throw new Error(
        `Invalid or missing start step ID: ${this.startStepId || 'none'}`
      );
    }

    const startStep = this.stepsMap.get(this.startStepId)!;
    if (startStep.type !== 'START') {
      throw new Error(
        `Start step '${this.startStepId}' must be of type 'START'`
      );
    }

    const endSteps = Array.from(this.stepsMap.values()).filter(
      (s) => s.type === 'END'
    );
    if (endSteps.length === 0) {
      throw new Error('Workflow definition must contain at least one END step');
    }

    // Validate each step's transitions
    for (const step of this.stepsMap.values()) {
      if (step.type === 'END') {
        if (step.transitions && step.transitions.length > 0) {
          throw new Error(
            `END step '${step.id}' cannot have outgoing transitions`
          );
        }
      } else {
        if (!step.transitions || step.transitions.length === 0) {
          throw new Error(
            `Step '${step.id}' of type '${step.type}' must have at least one outgoing transition`
          );
        }

        for (const t of step.transitions) {
          if (!t.targetStepId) {
            throw new Error(
              `Step '${step.id}' has a transition without a targetStepId`
            );
          }
          if (!this.stepsMap.has(t.targetStepId)) {
            throw new Error(
              `Step '${step.id}' references non-existent target step '${t.targetStepId}'`
            );
          }
        }
      }
    }

    // Graph Reachability: Verify at least one path from start step to an END step
    const visited = new Set<string>();
    const hasPathToEnd = (stepId: string): boolean => {
      if (visited.has(stepId)) return false;
      visited.add(stepId);

      const step = this.stepsMap.get(stepId);
      if (!step) return false;
      if (step.type === 'END') return true;

      for (const t of step.transitions) {
        if (hasPathToEnd(t.targetStepId)) {
          return true;
        }
      }
      return false;
    };

    if (!hasPathToEnd(this.startStepId)) {
      throw new Error(
        `Start step '${this.startStepId}' cannot reach any END step`
      );
    }
  }

  public publish(): void {
    if (this.status === 'ARCHIVED') {
      throw new Error('Cannot publish an archived workflow definition');
    }

    this.validateGraph();
    this.status = 'PUBLISHED';
    this.publishedAt = new Date();
    this.updatedAt = new Date();
  }

  public archive(): void {
    if (this.status === 'ARCHIVED') {
      throw new Error('Workflow definition is already archived');
    }

    this.status = 'ARCHIVED';
    this.archivedAt = new Date();
    this.updatedAt = new Date();
  }

  public createNewVersion(newId?: string): WorkflowDefinition {
    if (this.status !== 'PUBLISHED') {
      throw new Error(
        'Can only create a new version from a published workflow definition'
      );
    }

    return new WorkflowDefinition({
      id: newId ?? this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      version: this.version + 1,
      status: 'DRAFT',
      startStepId: this.startStepId,
      steps: this.steps,
      triggers: [...this.triggers],
      metadata: { ...this.metadata },
    });
  }

  public toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      name: this.name,
      description: this.description,
      version: this.version,
      status: this.status,
      startStepId: this.startStepId,
      steps: this.steps,
      triggers: this.triggers,
      metadata: this.metadata,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      publishedAt: this.publishedAt?.toISOString(),
      archivedAt: this.archivedAt?.toISOString(),
    };
  }
}
