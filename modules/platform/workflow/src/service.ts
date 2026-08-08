import { randomUUID } from "node:crypto";
import type { AuditLog } from "@adminops/audit";
import { WorkflowDefinition } from "./definition.js";
import {
  HumanTaskNotFoundError,
  WorkflowAccessError,
  WorkflowDefinitionNotFoundError,
  WorkflowInstanceNotFoundError,
  WorkflowValidationError,
} from "./errors.js";
import { HumanTask, WorkflowInstance } from "./instance.js";
import type { HumanTaskRepository, WorkflowDefinitionRepository, WorkflowInstanceRepository } from "./repositories.js";
import type {
  HumanTaskData,
  WorkflowCondition,
  WorkflowInstanceStatus,
  WorkflowMetadata,
  WorkflowStep,
  WorkflowTransition,
  WorkflowTrigger,
  WorkflowTriggerType,
} from "./types.js";

function valueAt(source: Readonly<Record<string, unknown>>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

export function evaluateWorkflowCondition(condition: WorkflowCondition, variables: Readonly<Record<string, unknown>>): boolean {
  if (condition.operator === "ALWAYS") return true;
  const actual = valueAt(variables, condition.field);
  switch (condition.operator) {
    case "EQUALS": return actual === condition.value;
    case "NOT_EQUALS": return actual !== condition.value;
    case "GREATER_THAN": return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "LESS_THAN": return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "CONTAINS": return typeof actual === "string" && typeof condition.value === "string"
      ? actual.includes(condition.value)
      : Array.isArray(actual) && actual.some((item) => item === condition.value);
    case "IN": return Array.isArray(condition.value) && condition.value.some((item) => item === actual);
    case "IS_SET": return actual !== undefined && actual !== null && actual !== "";
    case "IS_NOT_SET": return actual === undefined || actual === null || actual === "";
    case "ALWAYS": return true;
  }
}

export class WorkflowEngineService {
  constructor(
    private readonly definitions: WorkflowDefinitionRepository,
    private readonly instances: WorkflowInstanceRepository,
    private readonly tasks: HumanTaskRepository,
    private readonly auditLog?: AuditLog,
  ) {}

  async createDefinition(input: {
    tenantId: string;
    name: string;
    description?: string;
    startStepId?: string;
    steps?: readonly WorkflowStep[];
    triggers?: readonly WorkflowTrigger[];
    metadata?: WorkflowMetadata;
    actorUserId: string;
    id?: string;
  }): Promise<WorkflowDefinition> {
    const id = input.id?.trim() || randomUUID();
    if (await this.definitions.findById(input.tenantId, id)) throw new WorkflowValidationError(`Workflow definition '${id}' already exists`);
    let definition: WorkflowDefinition;
    try {
      definition = WorkflowDefinition.create({
        id,
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        startStepId: input.startStepId,
        steps: input.steps,
        triggers: input.triggers,
        metadata: { ...input.metadata, authorUserId: input.actorUserId },
      });
    } catch (error) { throw this.validation(error); }
    await this.definitions.save(definition);
    await this.audit("workflow.definition_created", input.tenantId, input.actorUserId, "workflow_definition", id, { version: 1 });
    return definition;
  }

  async updateDefinition(input: {
    tenantId: string;
    id: string;
    name?: string;
    description?: string;
    startStepId?: string;
    steps?: readonly WorkflowStep[];
    triggers?: readonly WorkflowTrigger[];
    metadata?: WorkflowMetadata;
    actorUserId: string;
  }): Promise<WorkflowDefinition> {
    const definition = await this.requireDefinition(input.tenantId, input.id);
    try {
      definition.prepareDraftRevision();
      definition.updateDraft(input);
    } catch (error) { throw this.validation(error); }
    await this.definitions.save(definition);
    await this.audit("workflow.definition_updated", input.tenantId, input.actorUserId, "workflow_definition", definition.id, { version: definition.version });
    return definition;
  }

  async publishDefinition(tenantId: string, id: string, actorUserId: string): Promise<WorkflowDefinition> {
    const definition = await this.requireDefinition(tenantId, id);
    try { definition.publish(); } catch (error) { throw this.validation(error); }
    await this.definitions.save(definition);
    await this.definitions.savePublishedVersion(definition);
    await this.audit("workflow.definition_published", tenantId, actorUserId, "workflow_definition", id, { version: definition.version });
    return definition;
  }

  async archiveDefinition(tenantId: string, id: string, actorUserId: string): Promise<WorkflowDefinition> {
    const definition = await this.requireDefinition(tenantId, id);
    definition.archive();
    await this.definitions.save(definition);
    await this.audit("workflow.definition_archived", tenantId, actorUserId, "workflow_definition", id, { version: definition.version });
    return definition;
  }

  listDefinitions(tenantId: string) { return this.definitions.listByTenant(tenantId); }
  async listPublishedDefinitions(tenantId: string) {
    const current = await this.definitions.listByTenant(tenantId);
    const results: WorkflowDefinition[] = [];
    for (const definition of current) {
      if (definition.status === "ARCHIVED") continue;
      const published = await this.definitions.findLatestPublishedVersion(tenantId, definition.id);
      if (published) results.push(published);
    }
    return results;
  }
  getDefinition(tenantId: string, id: string) { return this.requireDefinition(tenantId, id); }
  async getPublishedDefinition(tenantId: string, id: string, version?: number) {
    const definition = version === undefined
      ? await this.definitions.findLatestPublishedVersion(tenantId, id)
      : await this.definitions.findPublishedVersion(tenantId, id, version);
    if (!definition) throw new WorkflowDefinitionNotFoundError(id);
    return definition;
  }
  async listVersions(tenantId: string, id: string) {
    await this.requireDefinition(tenantId, id);
    return this.definitions.listPublishedVersions(tenantId, id);
  }

  async startWorkflow(input: {
    tenantId: string;
    definitionId: string;
    actorUserId: string;
    version?: number;
    variables?: Readonly<Record<string, unknown>>;
    sourceType?: WorkflowTriggerType;
    sourceReferenceId?: string | null;
  }): Promise<WorkflowInstance> {
    const definition = await this.getPublishedDefinition(input.tenantId, input.definitionId, input.version);
    const sourceType = input.sourceType ?? "MANUAL";
    if (input.sourceReferenceId) {
      const existing = await this.instances.findBySource(input.tenantId, sourceType, input.sourceReferenceId);
      const same = existing.find((item) => item.workflowDefinitionId === definition.id && item.workflowVersion === definition.version);
      if (same) return same;
    }
    const startStep = definition.getStep(definition.startStepId);
    if (!startStep) throw new WorkflowValidationError("Published workflow has no valid START step");
    const instance = WorkflowInstance.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      workflowDefinitionId: definition.id,
      workflowVersion: definition.version,
      startedByUserId: input.actorUserId,
      sourceType,
      sourceReferenceId: input.sourceReferenceId,
      variables: input.variables,
      startStep,
    });
    await this.runUntilWaitOrTerminal(instance, definition, input.actorUserId);
    await this.instances.save(instance);
    await this.audit("workflow.instance_started", input.tenantId, input.actorUserId, "workflow_instance", instance.id, {
      definitionId: definition.id,
      version: definition.version,
      sourceType,
      sourceReferenceId: input.sourceReferenceId ?? null,
      status: instance.status,
    });
    return instance;
  }

  async triggerFormSubmission(input: {
    tenantId: string;
    formDefinitionId: string;
    formSubmissionId: string;
    actorUserId: string;
    variables: Readonly<Record<string, unknown>>;
  }): Promise<WorkflowInstance[]> {
    const definitions = await this.definitions.findPublishedByTrigger(input.tenantId, "FORM_SUBMISSION", input.formDefinitionId);
    return Promise.all(definitions.map((definition) => this.startWorkflow({
      tenantId: input.tenantId,
      definitionId: definition.id,
      version: definition.version,
      actorUserId: input.actorUserId,
      sourceType: "FORM_SUBMISSION",
      sourceReferenceId: input.formSubmissionId,
      variables: { ...input.variables, formDefinitionId: input.formDefinitionId, formSubmissionId: input.formSubmissionId },
    })));
  }

  async triggerEvent(input: {
    tenantId: string;
    eventName: string;
    eventId: string;
    actorUserId: string;
    variables?: Readonly<Record<string, unknown>>;
  }): Promise<WorkflowInstance[]> {
    const definitions = await this.definitions.findPublishedByTrigger(input.tenantId, "EVENT", input.eventName);
    return Promise.all(definitions.map((definition) => this.startWorkflow({
      tenantId: input.tenantId,
      definitionId: definition.id,
      version: definition.version,
      actorUserId: input.actorUserId,
      sourceType: "EVENT",
      sourceReferenceId: input.eventId,
      variables: { ...input.variables, eventName: input.eventName, eventId: input.eventId },
    })));
  }

  async getInstance(tenantId: string, id: string): Promise<WorkflowInstance> {
    const instance = await this.instances.findById(tenantId, id);
    if (!instance) throw new WorkflowInstanceNotFoundError(id);
    return instance;
  }

  listInstances(tenantId: string, status?: WorkflowInstanceStatus) { return this.instances.listByTenant(tenantId, status); }

  async cancelInstance(tenantId: string, id: string, actorUserId: string, reason?: string): Promise<WorkflowInstance> {
    const instance = await this.getInstance(tenantId, id);
    try { instance.cancel(reason?.trim() || null); } catch (error) { throw this.validation(error); }
    const tasks = (await this.tasks.listByTenant(tenantId)).filter((task) => task.workflowInstanceId === id && !["COMPLETED", "CANCELLED"].includes(task.status));
    for (const task of tasks) { task.cancel(); await this.tasks.save(task); }
    await this.instances.save(instance);
    await this.audit("workflow.instance_cancelled", tenantId, actorUserId, "workflow_instance", id, { reason: reason ?? null });
    return instance;
  }

  listTasks(tenantId: string) { return this.tasks.listByTenant(tenantId); }
  listTasksForUser(tenantId: string, userId: string, roles: readonly string[]) { return this.tasks.listForUser(tenantId, userId, roles); }

  async claimTask(tenantId: string, id: string, actorUserId: string, roles: readonly string[]): Promise<HumanTask> {
    const task = await this.requireTask(tenantId, id);
    try { task.claim(actorUserId, roles); } catch (error) { throw this.validation(error); }
    await this.tasks.save(task);
    await this.audit("workflow.task_claimed", tenantId, actorUserId, "human_task", id, {});
    return task;
  }

  async completeTask(input: {
    tenantId: string;
    id: string;
    actorUserId: string;
    actorRoles: readonly string[];
    output?: Readonly<Record<string, unknown>>;
    canManage?: boolean;
  }): Promise<{ task: HumanTask; instance: WorkflowInstance }> {
    const task = await this.requireTask(input.tenantId, input.id);
    if (!input.canManage && !task.isEligible(input.actorUserId, input.actorRoles)) throw new WorkflowAccessError();
    const instance = await this.getInstance(input.tenantId, task.workflowInstanceId);
    if (instance.status !== "WAITING" || instance.currentStepId !== task.stepId) {
      throw new WorkflowValidationError("Workflow instance is not waiting on this task");
    }
    const definition = await this.getPublishedDefinition(input.tenantId, instance.workflowDefinitionId, instance.workflowVersion);
    const step = definition.getStep(task.stepId);
    if (!step) throw new WorkflowValidationError("Task step no longer exists in the published workflow version");
    try { task.complete(input.actorUserId, input.output); } catch (error) { throw this.validation(error); }
    await this.tasks.save(task);
    instance.resume();
    if (input.output) instance.setVariables(input.output);
    instance.recordStep(step, "COMPLETED", input.actorUserId, input.output ?? null);
    const next = this.resolveTransition(step.transitions, instance.variables);
    if (!next) {
      instance.fail(`No transition matched after human task '${step.id}'`, step);
    } else {
      instance.moveTo(next);
      await this.runUntilWaitOrTerminal(instance, definition, input.actorUserId);
    }
    await this.instances.save(instance);
    await this.audit("workflow.task_completed", input.tenantId, input.actorUserId, "human_task", task.id, { instanceId: instance.id, status: instance.status });
    return { task, instance };
  }

  private async runUntilWaitOrTerminal(instance: WorkflowInstance, definition: WorkflowDefinition, actorUserId: string): Promise<void> {
    for (let count = 0; count < 100 && instance.status === "RUNNING" && instance.currentStepId; count += 1) {
      const step = definition.getStep(instance.currentStepId);
      if (!step) { instance.fail(`Step '${instance.currentStepId}' not found`); return; }
      if (step.type === "END") { instance.complete(step, actorUserId); return; }
      if (step.type === "MANUAL_TASK" || step.type === "APPROVAL_TASK") {
        const existing = await this.tasks.findOpenByInstanceStep(instance.tenantId, instance.id, step.id);
        if (!existing) {
          const config = step.taskConfig ?? {};
          const dueAt = config.dueInMinutes && config.dueInMinutes > 0 ? new Date(Date.now() + config.dueInMinutes * 60_000) : null;
          const task = HumanTask.create({
            id: randomUUID(),
            tenantId: instance.tenantId,
            workflowInstanceId: instance.id,
            workflowDefinitionId: definition.id,
            workflowVersion: definition.version,
            stepId: step.id,
            kind: step.type === "APPROVAL_TASK" ? "APPROVAL" : "MANUAL",
            name: step.name,
            description: step.description ?? "",
            assigneeUserId: config.assigneeUserId ?? null,
            candidateUserIds: [...(config.candidateUserIds ?? [])],
            candidateRoles: [...(config.candidateRoles ?? [])],
            formDefinitionId: config.formDefinitionId ?? null,
            dueAt,
          });
          await this.tasks.save(task);
          instance.recordStep(step, "WAITING", actorUserId);
        }
        instance.enterWaiting(step);
        return;
      }

      let output: Readonly<Record<string, unknown>> | null = null;
      if (step.type === "AUTOMATIC_TASK") {
        const config = step.automaticConfig;
        if (!config || config.operation !== "SET_VARIABLES") { instance.fail(`Unsupported automatic task '${step.id}'`, step); return; }
        output = structuredClone(config.values);
        instance.setVariables(output);
      }
      instance.recordStep(step, "COMPLETED", actorUserId, output);
      const next = this.resolveTransition(step.transitions, instance.variables);
      if (!next) { instance.fail(`No transition matched for step '${step.id}'`, step); return; }
      instance.moveTo(next);
    }
    if (instance.status === "RUNNING") instance.fail("Workflow exceeded the 100-step automatic execution guard");
  }

  private resolveTransition(transitions: readonly WorkflowTransition[], variables: Readonly<Record<string, unknown>>): string | null {
    let fallback: string | null = null;
    for (const transition of transitions) {
      if (transition.isDefault) fallback = transition.targetStepId;
      if (!transition.condition || evaluateWorkflowCondition(transition.condition, variables)) return transition.targetStepId;
    }
    return fallback;
  }

  private async requireDefinition(tenantId: string, id: string) {
    const definition = await this.definitions.findById(tenantId, id);
    if (!definition) throw new WorkflowDefinitionNotFoundError(id);
    return definition;
  }
  private async requireTask(tenantId: string, id: string) {
    const task = await this.tasks.findById(tenantId, id);
    if (!task) throw new HumanTaskNotFoundError(id);
    return task;
  }
  private validation(error: unknown) { return new WorkflowValidationError(error instanceof Error ? error.message : "Invalid workflow operation"); }
  private async audit(action: string, tenantId: string, actorUserId: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
    if (!this.auditLog) return;
    await this.auditLog.record({ tenantId, actorUserId, action, targetType, targetId, metadata });
  }
}
