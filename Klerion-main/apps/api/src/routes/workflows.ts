import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  WorkflowDefinitionService,
  InMemoryWorkflowDefinitionRepository,
  WorkflowExecutionService,
  InMemoryWorkflowInstanceRepository,
  HumanTaskService,
  InMemoryHumanTaskRepository,
  WorkflowExecutionHistoryService,
  InMemoryWorkflowExecutionHistoryRepository,
  WorkflowStep,
  DefinitionStatus,
} from "../../../../modules/platform/workflow/src/index.js";

// Singletons for in-memory persistence across routes
export const workflowDefinitionRepository = new InMemoryWorkflowDefinitionRepository();
export const workflowInstanceRepository = new InMemoryWorkflowInstanceRepository();
export const humanTaskRepository = new InMemoryHumanTaskRepository();
export const workflowExecutionHistoryRepository = new InMemoryWorkflowExecutionHistoryRepository();

export const workflowExecutionHistoryService = new WorkflowExecutionHistoryService(
  workflowExecutionHistoryRepository
);

export const humanTaskService = new HumanTaskService(
  humanTaskRepository,
  workflowExecutionHistoryRepository,
  async (_action, _payload) => {
    // Integration logger
  }
);

export const workflowDefinitionService = new WorkflowDefinitionService(
  workflowDefinitionRepository
);

export const workflowExecutionService = new WorkflowExecutionService(
  workflowDefinitionRepository,
  workflowInstanceRepository,
  humanTaskService,
  workflowExecutionHistoryService
);

export function getSecurityContext(req: FastifyRequest) {
  const tenantId = (req.headers["x-tenant-id"] as string)?.trim() || "tenant-default";
  const userId = (req.headers["x-user-id"] as string)?.trim() || "user-1";
  const role = (req.headers["x-user-role"] as string)?.trim().toLowerCase() || "admin";
  return { tenantId, userId, role };
}

function checkAdminOrOwner(role: string, reply: FastifyReply): boolean {
  if (role !== "admin" && role !== "owner") {
    reply.status(403).send({ error: "Forbidden: Admin or Owner role required" });
    return false;
  }
  return true;
}

export async function workflowsRoutes(fastify: FastifyInstance) {
  // -------------------------------------------------------------
  // SPECIFIC FIXED SUB-PATHS MUST BE REGISTERED BEFORE /:id WILDCARDS
  // -------------------------------------------------------------

  // List Workflows
  fastify.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const query = req.query as { status?: DefinitionStatus; name?: string };

    try {
      const list = await workflowDefinitionService.listDefinitions(tenantId, {
        status: query.status,
        name: query.name,
      });

      return reply.status(200).send({ workflows: list.map((w) => w.toJSON()) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to list workflows" });
    }
  });

  // Create Workflow Definition
  fastify.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const body = req.body as {
      id?: string;
      name?: string;
      description?: string;
      startStepId?: string;
      steps?: WorkflowStep[];
      triggers?: any[];
      metadata?: any;
    };

    if (!body || !body.name || body.name.trim() === "") {
      return reply.status(400).send({ error: "Workflow name is required" });
    }

    try {
      const def = await workflowDefinitionService.createDefinition({
        id: body.id,
        tenantId,
        name: body.name,
        description: body.description,
        startStepId: body.startStepId,
        steps: body.steps,
        triggers: body.triggers,
        metadata: body.metadata,
        actorUserId: userId,
      });

      return reply.status(201).send({ workflow: def.toJSON() });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to create workflow definition" });
    }
  });

  // -------------------------------------------------------------
  // WORKFLOW INSTANCES & EXECUTION API
  // -------------------------------------------------------------

  // Create Workflow Instance
  fastify.post("/instances", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);

    const body = req.body as {
      workflowDefinitionId?: string;
      workflowVersion?: number;
      initialContext?: Record<string, any>;
      parentInstanceId?: string;
    };

    if (!body || !body.workflowDefinitionId) {
      return reply.status(400).send({ error: "workflowDefinitionId is required" });
    }

    try {
      const instance = await workflowExecutionService.createInstance({
        tenantId,
        workflowDefinitionId: body.workflowDefinitionId,
        workflowVersion: body.workflowVersion,
        initialContext: body.initialContext,
        parentInstanceId: body.parentInstanceId,
        actorUserId: userId,
      });

      return reply.status(201).send({ instance: instance.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to create workflow instance" });
    }
  });

  // Get Workflow Instance
  fastify.get("/instances/:instanceId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { instanceId } = req.params as { instanceId: string };

    try {
      const instance = await workflowExecutionService.getInstance(instanceId, tenantId);
      if (!instance) {
        return reply.status(404).send({ error: `WorkflowInstance '${instanceId}' not found` });
      }

      return reply.status(200).send({ instance: instance.toJSON() });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to get workflow instance" });
    }
  });

  // Start Workflow Instance
  fastify.post("/instances/:instanceId/start", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { instanceId } = req.params as { instanceId: string };

    try {
      const instance = await workflowExecutionService.startWorkflow(instanceId, tenantId, userId);
      return reply.status(200).send({ instance: instance.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to start workflow instance" });
    }
  });

  // Advance Workflow Instance
  fastify.post("/instances/:instanceId/advance", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { instanceId } = req.params as { instanceId: string };
    const body = (req.body as { contextUpdates?: Record<string, any> }) || {};

    try {
      const instance = await workflowExecutionService.advanceWorkflow(
        instanceId,
        tenantId,
        body.contextUpdates || {},
        userId
      );

      return reply.status(200).send({ instance: instance.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to advance workflow instance" });
    }
  });

  // Cancel Workflow Instance
  fastify.post("/instances/:instanceId/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { instanceId } = req.params as { instanceId: string };
    const body = (req.body as { reason?: string }) || {};

    try {
      const instance = await workflowExecutionService.cancelWorkflow(
        instanceId,
        tenantId,
        body.reason || "Cancelled via API",
        userId
      );

      return reply.status(200).send({ instance: instance.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to cancel workflow instance" });
    }
  });

  // Get Workflow Instance Execution History
  fastify.get("/instances/:instanceId/history", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { instanceId } = req.params as { instanceId: string };

    try {
      const history = await workflowExecutionHistoryService.getHistory(instanceId, tenantId);
      return reply.status(200).send({ history: history.map((h) => h.toJSON()) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to get execution history" });
    }
  });

  // -------------------------------------------------------------
  // HUMAN TASKS API
  // -------------------------------------------------------------

  // List Human Tasks
  fastify.get("/tasks", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const query = req.query as {
      assigneeId?: string;
      candidateUserId?: string;
      candidateRole?: string;
      workflowInstanceId?: string;
      status?: any;
    };

    try {
      const tasks = await humanTaskService.listTasks(tenantId, {
        assigneeId: query.assigneeId,
        candidateUserId: query.candidateUserId,
        candidateRole: query.candidateRole,
        workflowInstanceId: query.workflowInstanceId,
        status: query.status,
      });

      return reply.status(200).send({ tasks: tasks.map((t) => t.toJSON()) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to list human tasks" });
    }
  });

  // Complete Human Task
  fastify.post("/tasks/:taskId/complete", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { taskId } = req.params as { taskId: string };
    const body = req.body as { outcome?: string; outputData?: Record<string, any> };

    if (!body || !body.outcome) {
      return reply.status(400).send({ error: "Task completion outcome is required" });
    }

    try {
      const task = await humanTaskService.completeTask({
        taskId,
        tenantId,
        actorUserId: userId,
        outcome: body.outcome,
        outputData: body.outputData,
      });

      let instance = null;
      if (task.workflowInstanceId) {
        instance = await workflowExecutionService.advanceWorkflow(
          task.workflowInstanceId,
          tenantId,
          { [task.stepId]: { outcome: body.outcome, outputData: body.outputData || {} } },
          userId
        );
      }

      return reply.status(200).send({
        task: task.toJSON(),
        instance: instance ? instance.toJSON() : null,
      });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to complete human task" });
    }
  });

  // -------------------------------------------------------------
  // WORKFLOW DEFINITIONS PARAMETERIZED WILDCARD ROUTES (GET/PUT/POST /:id)
  // -------------------------------------------------------------

  // Get Workflow Definition by ID
  fastify.get("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const query = req.query as { version?: string };

    const versionNum = query.version ? parseInt(query.version, 10) : undefined;

    try {
      const def = await workflowDefinitionService.getDefinition(id, tenantId, versionNum);
      return reply.status(200).send({ workflow: def.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      return reply.status(status).send({ error: err.message || "Failed to get workflow definition" });
    }
  });

  // Update Draft Workflow Definition
  fastify.put("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      description?: string;
      startStepId?: string;
      steps?: WorkflowStep[];
      triggers?: any[];
      metadata?: any;
    };

    try {
      const def = await workflowDefinitionService.updateDraft({
        id,
        tenantId,
        name: body.name,
        description: body.description,
        startStepId: body.startStepId,
        steps: body.steps,
        triggers: body.triggers,
        metadata: body.metadata,
        actorUserId: userId,
      });

      return reply.status(200).send({ workflow: def.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to update workflow draft" });
    }
  });

  // Publish Workflow Version
  fastify.post("/:id/publish", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const { id } = req.params as { id: string };

    try {
      const def = await workflowDefinitionService.publishDefinition({
        id,
        tenantId,
        actorUserId: userId,
      });

      return reply.status(200).send({ workflow: def.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to publish workflow definition" });
    }
  });

  // Archive Workflow Definition
  fastify.post("/:id/archive", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const { id } = req.params as { id: string };

    try {
      const def = await workflowDefinitionService.archiveDefinition({
        id,
        tenantId,
        actorUserId: userId,
      });

      return reply.status(200).send({ workflow: def.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to archive workflow definition" });
    }
  });
}
