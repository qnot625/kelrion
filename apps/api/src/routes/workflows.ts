import type { FastifyInstance } from "fastify";
import type { ControlPlaneService } from "@adminops/control-plane";
import { hasPermission } from "@adminops/identity";
import {
  HumanTaskNotFoundError,
  WorkflowAccessError,
  WorkflowDefinitionNotFoundError,
  WorkflowInstanceNotFoundError,
  WorkflowValidationError,
  type WorkflowEngineService,
  type WorkflowMetadata,
  type WorkflowStep,
  type WorkflowTrigger,
} from "@adminops/workflow";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMap(error: unknown): { status: number; message: string } | null {
  if (error instanceof WorkflowDefinitionNotFoundError || error instanceof WorkflowInstanceNotFoundError || error instanceof HumanTaskNotFoundError) return { status: 404, message: error.message };
  if (error instanceof WorkflowAccessError) return { status: 403, message: error.message };
  if (error instanceof WorkflowValidationError) return { status: 400, message: error.message };
  return null;
}

async function handled(reply: { code(status: number): { send(body: unknown): unknown } }, operation: () => Promise<unknown>) {
  try { return await operation(); }
  catch (error) {
    const mapped = errorMap(error);
    if (!mapped) throw error;
    return reply.code(mapped.status).send({ error: mapped.message });
  }
}

function parseSteps(value: unknown): WorkflowStep[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new WorkflowValidationError("steps must be an array");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.type !== "string" || !Array.isArray(item.transitions)) {
      throw new WorkflowValidationError(`steps[${index}] must include id, name, type and transitions`);
    }
    return item as unknown as WorkflowStep;
  });
}

function parseTriggers(value: unknown): WorkflowTrigger[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new WorkflowValidationError("triggers must be an array");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.type !== "string") throw new WorkflowValidationError(`triggers[${index}] must include type`);
    return item as unknown as WorkflowTrigger;
  });
}

function parseMetadata(value: unknown): WorkflowMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new WorkflowValidationError("metadata must be an object");
  return value as WorkflowMetadata;
}

function variables(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new WorkflowValidationError("variables must be an object");
  return value;
}

export function registerWorkflowRoutes(
  app: FastifyInstance,
  workflow: WorkflowEngineService,
  controlPlane: ControlPlaneService,
): void {
  const moduleGuard = requireModule(controlPlane, "workflow");

  app.get("/workflow-definitions", { preHandler: [moduleGuard, requirePermission("workflow:view")] }, async (request, reply) => {
    const canManage = hasPermission(request.auth!.roles, "workflow:manage");
    const definitions = canManage ? await workflow.listDefinitions(request.tenant!.tenantId) : await workflow.listPublishedDefinitions(request.tenant!.tenantId);
    return reply.send(definitions.map((item) => item.toJSON()));
  });

  app.get<{ Params: { id: string } }>("/workflow-definitions/:id", { preHandler: [moduleGuard, requirePermission("workflow:view")] }, async (request, reply) =>
    handled(reply, async () => {
      const canManage = hasPermission(request.auth!.roles, "workflow:manage");
      const query = request.query as { version?: string };
      const version = query.version ? Number(query.version) : undefined;
      if (query.version && (!Number.isInteger(version) || (version ?? 0) < 1)) throw new WorkflowValidationError("version must be a positive integer");
      const definition = canManage && version === undefined
        ? await workflow.getDefinition(request.tenant!.tenantId, request.params.id)
        : await workflow.getPublishedDefinition(request.tenant!.tenantId, request.params.id, version);
      return reply.send(definition.toJSON());
    }));

  app.get<{ Params: { id: string } }>("/workflow-definitions/:id/versions", { preHandler: [moduleGuard, requirePermission("workflow:manage")] }, async (request, reply) =>
    handled(reply, async () => reply.send((await workflow.listVersions(request.tenant!.tenantId, request.params.id)).map((item) => item.toJSON()))));

  app.post("/workflow-definitions", { preHandler: [moduleGuard, requirePermission("workflow:manage")] }, async (request, reply) =>
    handled(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      if (typeof body.name !== "string" || !body.name.trim()) throw new WorkflowValidationError("name is required");
      const definition = await workflow.createDefinition({
        tenantId: request.tenant!.tenantId,
        id: typeof body.id === "string" ? body.id : undefined,
        name: body.name,
        description: typeof body.description === "string" ? body.description : undefined,
        startStepId: typeof body.startStepId === "string" ? body.startStepId : undefined,
        steps: parseSteps(body.steps),
        triggers: parseTriggers(body.triggers),
        metadata: parseMetadata(body.metadata),
        actorUserId: request.auth!.userId,
      });
      return reply.code(201).send(definition.toJSON());
    }));

  app.patch<{ Params: { id: string } }>("/workflow-definitions/:id", { preHandler: [moduleGuard, requirePermission("workflow:manage")] }, async (request, reply) =>
    handled(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      const definition = await workflow.updateDefinition({
        tenantId: request.tenant!.tenantId,
        id: request.params.id,
        name: typeof body.name === "string" ? body.name : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        startStepId: typeof body.startStepId === "string" ? body.startStepId : undefined,
        steps: parseSteps(body.steps),
        triggers: parseTriggers(body.triggers),
        metadata: parseMetadata(body.metadata),
        actorUserId: request.auth!.userId,
      });
      return reply.send(definition.toJSON());
    }));

  app.post<{ Params: { id: string } }>("/workflow-definitions/:id/publish", { preHandler: [moduleGuard, requirePermission("workflow:manage")] }, async (request, reply) =>
    handled(reply, async () => reply.send((await workflow.publishDefinition(request.tenant!.tenantId, request.params.id, request.auth!.userId)).toJSON())));

  app.post<{ Params: { id: string } }>("/workflow-definitions/:id/archive", { preHandler: [moduleGuard, requirePermission("workflow:manage")] }, async (request, reply) =>
    handled(reply, async () => reply.send((await workflow.archiveDefinition(request.tenant!.tenantId, request.params.id, request.auth!.userId)).toJSON())));

  app.post<{ Params: { id: string } }>("/workflow-definitions/:id/start", { preHandler: [moduleGuard, requirePermission("workflow:start")] }, async (request, reply) =>
    handled(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      const instance = await workflow.startWorkflow({
        tenantId: request.tenant!.tenantId,
        definitionId: request.params.id,
        actorUserId: request.auth!.userId,
        version: typeof body.version === "number" ? body.version : undefined,
        variables: variables(body.variables),
        sourceType: "MANUAL",
      });
      return reply.code(201).send(instance.toJSON());
    }));

  app.get("/workflow-instances", { preHandler: [moduleGuard, requirePermission("workflow:view")] }, async (request, reply) => {
    const all = await workflow.listInstances(request.tenant!.tenantId);
    if (hasPermission(request.auth!.roles, "workflow:manage")) return reply.send(all.map((item) => item.toJSON()));
    const tasks = await workflow.listTasksForUser(request.tenant!.tenantId, request.auth!.userId, request.auth!.roles);
    const visibleInstances = new Set(tasks.map((task) => task.workflowInstanceId));
    return reply.send(all.filter((item) => item.startedByUserId === request.auth!.userId || visibleInstances.has(item.id)).map((item) => item.toJSON()));
  });

  app.get<{ Params: { id: string } }>("/workflow-instances/:id", { preHandler: [moduleGuard, requirePermission("workflow:view")] }, async (request, reply) =>
    handled(reply, async () => {
      const instance = await workflow.getInstance(request.tenant!.tenantId, request.params.id);
      if (!hasPermission(request.auth!.roles, "workflow:manage") && instance.startedByUserId !== request.auth!.userId) {
        const tasks = await workflow.listTasksForUser(request.tenant!.tenantId, request.auth!.userId, request.auth!.roles);
        if (!tasks.some((task) => task.workflowInstanceId === instance.id)) throw new WorkflowAccessError("You do not have access to this workflow instance");
      }
      return reply.send(instance.toJSON());
    }));

  app.post<{ Params: { id: string } }>("/workflow-instances/:id/cancel", { preHandler: [moduleGuard, requirePermission("workflow:manage")] }, async (request, reply) =>
    handled(reply, async () => reply.send((await workflow.cancelInstance(
      request.tenant!.tenantId,
      request.params.id,
      request.auth!.userId,
      isRecord(request.body) && typeof request.body.reason === "string" ? request.body.reason : undefined,
    )).toJSON())));

  app.get("/workflow-tasks", { preHandler: [moduleGuard, requirePermission("workflow:task")] }, async (request, reply) => {
    const scope = (request.query as { scope?: string }).scope;
    if (scope === "all") {
      if (!hasPermission(request.auth!.roles, "workflow:manage")) return reply.code(403).send({ error: 'Missing permission "workflow:manage"' });
      return reply.send((await workflow.listTasks(request.tenant!.tenantId)).map((task) => task.toJSON()));
    }
    return reply.send((await workflow.listTasksForUser(request.tenant!.tenantId, request.auth!.userId, request.auth!.roles)).map((task) => task.toJSON()));
  });

  app.post<{ Params: { id: string } }>("/workflow-tasks/:id/claim", { preHandler: [moduleGuard, requirePermission("workflow:task")] }, async (request, reply) =>
    handled(reply, async () => reply.send((await workflow.claimTask(request.tenant!.tenantId, request.params.id, request.auth!.userId, request.auth!.roles)).toJSON())));

  app.post<{ Params: { id: string } }>("/workflow-tasks/:id/complete", { preHandler: [moduleGuard, requirePermission("workflow:task")] }, async (request, reply) =>
    handled(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      const result = await workflow.completeTask({
        tenantId: request.tenant!.tenantId,
        id: request.params.id,
        actorUserId: request.auth!.userId,
        actorRoles: request.auth!.roles,
        output: isRecord(body.output) ? body.output : undefined,
        canManage: hasPermission(request.auth!.roles, "workflow:manage"),
      });
      return reply.send({ task: result.task.toJSON(), instance: result.instance.toJSON() });
    }));

  app.post("/workflow-events", { preHandler: [moduleGuard, requirePermission("workflow:manage")] }, async (request, reply) =>
    handled(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      if (typeof body.eventName !== "string" || typeof body.eventId !== "string") throw new WorkflowValidationError("eventName and eventId are required");
      const instances = await workflow.triggerEvent({
        tenantId: request.tenant!.tenantId,
        eventName: body.eventName,
        eventId: body.eventId,
        actorUserId: request.auth!.userId,
        variables: variables(body.variables),
      });
      return reply.code(201).send(instances.map((instance) => instance.toJSON()));
    }));
}
