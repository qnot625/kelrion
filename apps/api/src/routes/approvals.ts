import type { FastifyInstance } from "fastify";
import {
  ApprovalAccessError,
  ApprovalPolicyNotFoundError,
  ApprovalRequestNotFoundError,
  ApprovalValidationError,
  type ApprovalEngineService,
  type ApprovalPolicyMetadata,
  type ApprovalStage,
} from "@adminops/approvals";
import type { ControlPlaneService } from "@adminops/control-plane";
import { hasPermission } from "@adminops/identity";
import type { WorkflowEngineService } from "@adminops/workflow";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStages(value: unknown): ApprovalStage[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ApprovalValidationError("stages must be an array");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || !["ANY", "QUORUM", "ALL_NAMED"].includes(String(item.mode))) {
      throw new ApprovalValidationError(`stages[${index}] must include id, name and a valid mode`);
    }
    return {
      id: item.id,
      name: item.name,
      mode: item.mode as ApprovalStage["mode"],
      approverUserIds: Array.isArray(item.approverUserIds) ? item.approverUserIds.filter((entry): entry is string => typeof entry === "string") : [],
      approverRoles: Array.isArray(item.approverRoles) ? item.approverRoles.filter((entry): entry is string => typeof entry === "string") : [],
      requiredApprovals: typeof item.requiredApprovals === "number" ? item.requiredApprovals : null,
      dueInMinutes: typeof item.dueInMinutes === "number" ? item.dueInMinutes : null,
      allowSelfApproval: item.allowSelfApproval === true,
      description: typeof item.description === "string" ? item.description : undefined,
    };
  });
}

function parseMetadata(value: unknown): ApprovalPolicyMetadata | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new ApprovalValidationError("metadata must be an object");
  return value as ApprovalPolicyMetadata;
}

function parseContext(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new ApprovalValidationError("context must be an object");
  return value;
}

function mapError(error: unknown): { status: number; message: string } | null {
  if (error instanceof ApprovalPolicyNotFoundError || error instanceof ApprovalRequestNotFoundError) return { status: 404, message: error.message };
  if (error instanceof ApprovalAccessError) return { status: 403, message: error.message };
  if (error instanceof ApprovalValidationError) return { status: 400, message: error.message };
  return null;
}

async function handled(reply: { code(status: number): { send(body: unknown): unknown } }, operation: () => Promise<unknown>) {
  try { return await operation(); }
  catch (error) {
    const mapped = mapError(error);
    if (!mapped) throw error;
    return reply.code(mapped.status).send({ error: mapped.message });
  }
}

function approvalPolicyId(step: { metadata?: Readonly<Record<string, unknown>> } | null | undefined): string | null {
  const value = step?.metadata?.approvalPolicyId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function registerApprovalRoutes(
  app: FastifyInstance,
  approvals: ApprovalEngineService,
  workflow: WorkflowEngineService,
  controlPlane: ControlPlaneService,
): void {
  const moduleGuard = requireModule(controlPlane, "approvals");

  async function materializeWorkflowApprovals(tenantId: string) {
    const tasks = await workflow.listTasks(tenantId);
    for (const task of tasks) {
      if (task.kind !== "APPROVAL" || ["COMPLETED", "CANCELLED"].includes(task.status)) continue;
      const definition = await workflow.getPublishedDefinition(tenantId, task.workflowDefinitionId, task.workflowVersion);
      const step = definition.getStep(task.stepId);
      const policyId = approvalPolicyId(step);
      if (!policyId) continue;
      const instance = await workflow.getInstance(tenantId, task.workflowInstanceId);
      await approvals.createRequest({
        tenantId,
        policyId,
        title: task.name,
        description: step?.description || `Workflow approval for ${definition.name} v${definition.version}`,
        requestedByUserId: instance.startedByUserId,
        sourceType: "WORKFLOW_TASK",
        sourceReferenceId: task.id,
        workflowTaskId: task.id,
        context: {
          ...instance.variables,
          workflowInstanceId: instance.id,
          workflowDefinitionId: instance.workflowDefinitionId,
          workflowVersion: instance.workflowVersion,
          workflowStepId: task.stepId,
        },
      });
    }
  }

  async function resolveWorkflowTask(
    tenantId: string,
    workflowTaskId: string,
    actorUserId: string,
    actorRoles: readonly string[],
    status: "APPROVED" | "REJECTED" | "CANCELLED",
    approval: { id: string; policyId: string; policyVersion: number },
  ) {
    await workflow.completeTask({
      tenantId,
      id: workflowTaskId,
      actorUserId,
      actorRoles,
      canManage: true,
      output: {
        approvalDecision: status,
        approvalRequestId: approval.id,
        approvalPolicyId: approval.policyId,
        approvalPolicyVersion: approval.policyVersion,
      },
    });
  }

  app.get("/approval-policies", { preHandler: [moduleGuard, requirePermission("approvals:view")] }, async (request, reply) => {
    const policies = hasPermission(request.auth!.roles, "approvals:manage")
      ? await approvals.listPolicies(request.tenant!.tenantId)
      : await approvals.listPublishedPolicies(request.tenant!.tenantId);
    return reply.send(policies.map((policy) => policy.toJSON()));
  });

  app.get<{ Params: { id: string } }>("/approval-policies/:id", { preHandler: [moduleGuard, requirePermission("approvals:view")] }, async (request, reply) => handled(reply, async () => {
    const query = request.query as { version?: string };
    const version = query.version ? Number(query.version) : undefined;
    if (query.version && (!Number.isInteger(version) || (version ?? 0) < 1)) throw new ApprovalValidationError("version must be a positive integer");
    const policy = hasPermission(request.auth!.roles, "approvals:manage") && version === undefined
      ? await approvals.getPolicy(request.tenant!.tenantId, request.params.id)
      : await approvals.getPublishedPolicy(request.tenant!.tenantId, request.params.id, version);
    return reply.send(policy.toJSON());
  }));

  app.get<{ Params: { id: string } }>("/approval-policies/:id/versions", { preHandler: [moduleGuard, requirePermission("approvals:manage")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await approvals.listPolicyVersions(request.tenant!.tenantId, request.params.id)).map((policy) => policy.toJSON()))));

  app.post("/approval-policies", { preHandler: [moduleGuard, requirePermission("approvals:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.name !== "string" || !body.name.trim()) throw new ApprovalValidationError("name is required");
    const policy = await approvals.createPolicy({
      tenantId: request.tenant!.tenantId,
      id: typeof body.id === "string" ? body.id : undefined,
      name: body.name,
      description: typeof body.description === "string" ? body.description : undefined,
      stages: parseStages(body.stages),
      metadata: parseMetadata(body.metadata),
      actorUserId: request.auth!.userId,
    });
    return reply.code(201).send(policy.toJSON());
  }));

  app.patch<{ Params: { id: string } }>("/approval-policies/:id", { preHandler: [moduleGuard, requirePermission("approvals:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const policy = await approvals.updatePolicy({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      stages: parseStages(body.stages),
      metadata: parseMetadata(body.metadata),
      actorUserId: request.auth!.userId,
    });
    return reply.send(policy.toJSON());
  }));

  app.post<{ Params: { id: string } }>("/approval-policies/:id/publish", { preHandler: [moduleGuard, requirePermission("approvals:manage")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await approvals.publishPolicy(request.tenant!.tenantId, request.params.id, request.auth!.userId)).toJSON())));

  app.post<{ Params: { id: string } }>("/approval-policies/:id/archive", { preHandler: [moduleGuard, requirePermission("approvals:manage")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await approvals.archivePolicy(request.tenant!.tenantId, request.params.id, request.auth!.userId)).toJSON())));

  app.post("/approval-requests", { preHandler: [moduleGuard, requirePermission("approvals:request")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.policyId !== "string" || typeof body.title !== "string") throw new ApprovalValidationError("policyId and title are required");
    const result = await approvals.createRequest({
      tenantId: request.tenant!.tenantId,
      policyId: body.policyId,
      policyVersion: typeof body.policyVersion === "number" ? body.policyVersion : undefined,
      title: body.title,
      description: typeof body.description === "string" ? body.description : undefined,
      requestedByUserId: request.auth!.userId,
      sourceType: "MANUAL",
      context: parseContext(body.context),
    });
    return reply.code(201).send(result.toJSON());
  }));

  app.get("/approval-requests", { preHandler: [moduleGuard, requirePermission("approvals:view")] }, async (request, reply) => handled(reply, async () => {
    await materializeWorkflowApprovals(request.tenant!.tenantId);
    const canManage = hasPermission(request.auth!.roles, "approvals:manage");
    const scope = (request.query as { scope?: string }).scope;
    if (scope === "all") {
      if (!canManage) throw new ApprovalAccessError('Missing permission "approvals:manage"');
      return reply.send((await approvals.listRequests(request.tenant!.tenantId)).map((item) => item.toJSON()));
    }
    if (scope === "overdue") {
      if (!canManage) throw new ApprovalAccessError('Missing permission "approvals:manage"');
      return reply.send((await approvals.listOverdue(request.tenant!.tenantId)).map((item) => item.toJSON()));
    }
    if (scope === "actionable") {
      return reply.send((await approvals.listActionable(request.tenant!.tenantId, request.auth!.userId, request.auth!.roles)).map((item) => item.toJSON()));
    }
    const [own, actionable] = await Promise.all([
      approvals.listOwnRequests(request.tenant!.tenantId, request.auth!.userId),
      approvals.listActionable(request.tenant!.tenantId, request.auth!.userId, request.auth!.roles),
    ]);
    const byId = new Map([...own, ...actionable].map((item) => [item.id, item]));
    return reply.send([...byId.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map((item) => item.toJSON()));
  }));

  app.get<{ Params: { id: string } }>("/approval-requests/:id", { preHandler: [moduleGuard, requirePermission("approvals:view")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await approvals.getRequest({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
      actorRoles: request.auth!.roles,
      canManage: hasPermission(request.auth!.roles, "approvals:manage"),
    })).toJSON())));

  async function decide(request: { tenantId: string; id: string; actorUserId: string; actorRoles: readonly string[]; decision: "APPROVE" | "REJECT"; comment?: string }) {
    const result = await approvals.decide(request);
    if (result.workflowTaskId && (result.status === "APPROVED" || result.status === "REJECTED")) {
      await resolveWorkflowTask(request.tenantId, result.workflowTaskId, request.actorUserId, request.actorRoles, result.status, result);
    }
    return result;
  }

  app.post<{ Params: { id: string } }>("/approval-requests/:id/approve", { preHandler: [moduleGuard, requirePermission("approvals:decide")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await decide({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
      actorRoles: request.auth!.roles,
      decision: "APPROVE",
      comment: isRecord(request.body) && typeof request.body.comment === "string" ? request.body.comment : undefined,
    })).toJSON())));

  app.post<{ Params: { id: string } }>("/approval-requests/:id/reject", { preHandler: [moduleGuard, requirePermission("approvals:decide")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await decide({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
      actorRoles: request.auth!.roles,
      decision: "REJECT",
      comment: isRecord(request.body) && typeof request.body.comment === "string" ? request.body.comment : undefined,
    })).toJSON())));

  app.post<{ Params: { id: string } }>("/approval-requests/:id/cancel", { preHandler: [moduleGuard, requirePermission("approvals:request")] }, async (request, reply) => handled(reply, async () => {
    const result = await approvals.cancelRequest({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
      canManage: hasPermission(request.auth!.roles, "approvals:manage"),
      reason: isRecord(request.body) && typeof request.body.reason === "string" ? request.body.reason : undefined,
    });
    if (result.workflowTaskId) {
      await resolveWorkflowTask(request.tenant!.tenantId, result.workflowTaskId, request.auth!.userId, request.auth!.roles, "CANCELLED", result);
    }
    return reply.send(result.toJSON());
  }));
}
