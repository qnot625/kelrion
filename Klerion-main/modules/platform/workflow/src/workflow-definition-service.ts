import { WorkflowDefinition } from './workflow-definition.js';
import { WorkflowDefinitionRepository, WorkflowDefinitionFilter } from './workflow-definition-repository.js';
import { WorkflowStep, Trigger, WorkflowMetadata } from './value-objects.js';

export interface CreateWorkflowDefinitionParams {
  id?: string;
  tenantId: string;
  name: string;
  description?: string;
  startStepId?: string;
  steps?: WorkflowStep[];
  triggers?: Trigger[];
  metadata?: WorkflowMetadata;
  actorUserId: string;
}

export interface UpdateWorkflowDraftParams {
  id: string;
  tenantId: string;
  name?: string;
  description?: string;
  startStepId?: string;
  steps?: WorkflowStep[];
  triggers?: Trigger[];
  metadata?: WorkflowMetadata;
  actorUserId: string;
}

export interface WorkflowDefinitionServiceParams {
  repository: WorkflowDefinitionRepository;
  auditLogger?: (action: string, payload: Record<string, any>) => Promise<void>;
}

export class WorkflowDefinitionService {
  private repository: WorkflowDefinitionRepository;
  private auditLogger?: (action: string, payload: Record<string, any>) => Promise<void>;

  constructor(
    repository: WorkflowDefinitionRepository,
    auditLogger?: (action: string, payload: Record<string, any>) => Promise<void>
  ) {
    this.repository = repository;
    this.auditLogger = auditLogger;
  }

  public async createDefinition(
    params: CreateWorkflowDefinitionParams
  ): Promise<WorkflowDefinition> {
    const id =
      params.id && params.id.trim() !== ''
        ? params.id
        : `wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const existing = await this.repository.findById(id, params.tenantId);
    if (existing) {
      throw new Error(`Workflow definition with ID '${id}' already exists for tenant '${params.tenantId}'`);
    }

    const definition = WorkflowDefinition.create({
      id,
      tenantId: params.tenantId,
      name: params.name,
      description: params.description,
      startStepId: params.startStepId,
      steps: params.steps,
      triggers: params.triggers,
      metadata: params.metadata,
    });

    await this.repository.save(definition);

    if (this.auditLogger) {
      await this.auditLogger('workflow.definition.created', {
        workflowDefinitionId: definition.id,
        tenantId: definition.tenantId,
        actorUserId: params.actorUserId,
        name: definition.name,
        version: definition.version,
      });
    }

    return definition;
  }

  public async updateDraft(
    params: UpdateWorkflowDraftParams
  ): Promise<WorkflowDefinition> {
    const definition = await this.repository.findById(params.id, params.tenantId);
    if (!definition) {
      throw new Error(`Workflow definition '${params.id}' not found for tenant '${params.tenantId}'`);
    }

    definition.updateDraft({
      name: params.name,
      description: params.description,
      startStepId: params.startStepId,
      steps: params.steps,
      triggers: params.triggers,
      metadata: params.metadata,
    });

    await this.repository.save(definition);

    if (this.auditLogger) {
      await this.auditLogger('workflow.definition.updated', {
        workflowDefinitionId: definition.id,
        tenantId: definition.tenantId,
        actorUserId: params.actorUserId,
        name: definition.name,
        version: definition.version,
      });
    }

    return definition;
  }

  public async publishDefinition(params: {
    id: string;
    tenantId: string;
    actorUserId: string;
  }): Promise<WorkflowDefinition> {
    const definition = await this.repository.findById(params.id, params.tenantId);
    if (!definition) {
      throw new Error(`Workflow definition '${params.id}' not found for tenant '${params.tenantId}'`);
    }

    definition.publish();
    await this.repository.save(definition);

    if (this.auditLogger) {
      await this.auditLogger('workflow.definition.published', {
        workflowDefinitionId: definition.id,
        tenantId: definition.tenantId,
        actorUserId: params.actorUserId,
        version: definition.version,
      });
    }

    return definition;
  }

  public async createNewVersion(params: {
    id: string;
    tenantId: string;
    actorUserId: string;
  }): Promise<WorkflowDefinition> {
    const definition = await this.repository.findById(params.id, params.tenantId);
    if (!definition) {
      throw new Error(`Workflow definition '${params.id}' not found for tenant '${params.tenantId}'`);
    }

    const newVersion = definition.createNewVersion();
    await this.repository.save(newVersion);

    if (this.auditLogger) {
      await this.auditLogger('workflow.definition.new_version_created', {
        workflowDefinitionId: newVersion.id,
        tenantId: newVersion.tenantId,
        actorUserId: params.actorUserId,
        version: newVersion.version,
      });
    }

    return newVersion;
  }

  public async archiveDefinition(params: {
    id: string;
    tenantId: string;
    actorUserId: string;
  }): Promise<WorkflowDefinition> {
    const definition = await this.repository.findById(params.id, params.tenantId);
    if (!definition) {
      throw new Error(`Workflow definition '${params.id}' not found for tenant '${params.tenantId}'`);
    }

    definition.archive();
    await this.repository.save(definition);

    if (this.auditLogger) {
      await this.auditLogger('workflow.definition.archived', {
        workflowDefinitionId: definition.id,
        tenantId: definition.tenantId,
        actorUserId: params.actorUserId,
      });
    }

    return definition;
  }

  public async getDefinition(
    id: string,
    tenantId: string,
    version?: number
  ): Promise<WorkflowDefinition> {
    let definition: WorkflowDefinition | null = null;
    if (version !== undefined) {
      definition = await this.repository.findByIdAndVersion(id, version, tenantId);
    } else {
      definition = await this.repository.findById(id, tenantId);
    }

    if (!definition) {
      throw new Error(
        `Workflow definition '${id}'${version ? ` (version ${version})` : ''} not found for tenant '${tenantId}'`
      );
    }

    return definition;
  }

  public async listDefinitions(
    tenantId: string,
    filter?: WorkflowDefinitionFilter
  ): Promise<WorkflowDefinition[]> {
    return this.repository.list(tenantId, filter);
  }
}
