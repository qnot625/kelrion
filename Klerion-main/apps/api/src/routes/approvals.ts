import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  ApprovalService,
  InMemoryApprovalRequestRepository,
  ApprovalStatus,
} from "../../../../modules/domains/internal-services/src/index.js";

export const approvalRepository = new InMemoryApprovalRequestRepository();

// In-memory audit log collector for approvals
export const approvalAuditLog: Array<{
  id: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}> = [];

export const approvalService = new ApprovalService(
  approvalRepository,
  async (action, payload) => {
    approvalAuditLog.push({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      action,
      payload,
      timestamp: new Date(),
    });
  }
);

export function getSecurityContext(req: FastifyRequest) {
  const tenantId = (req.headers["x-tenant-id"] as string)?.trim() || "tenant-default";
  const userId = (req.headers["x-user-id"] as string)?.trim() || "user-1";
  const role = (req.headers["x-user-role"] as string)?.trim().toLowerCase() || "admin";
  return { tenantId, userId, role };
}

export async function approvalsRoutes(fastify: FastifyInstance) {
  // -------------------------------------------------------------
  // LIST APPROVAL REQUESTS (Filtered, Searched, Paginated, Inbox)
  // -------------------------------------------------------------
  fastify.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const query = req.query as {
      status?: ApprovalStatus;
      requesterUserId?: string;
      assigneeUserId?: string;
      workflowInstanceId?: string;
      search?: string;
      inbox?: string; // "true" or "1"
      page?: string;
      limit?: string;
      pageSize?: string;
    };

    try {
      const page = Math.max(1, parseInt(query.page || "1", 10));
      const limit = Math.max(1, Math.min(100, parseInt(query.limit || query.pageSize || "10", 10)));

      let effectiveAssignee = query.assigneeUserId;
      if (query.inbox === "true" || query.inbox === "1") {
        effectiveAssignee = userId;
      }

      let list = await approvalService.listApprovalRequests(tenantId, {
        status: query.status,
        requesterUserId: query.requesterUserId,
        assigneeUserId: effectiveAssignee,
        workflowInstanceId: query.workflowInstanceId,
      });

      // Optional text search filter (title or description)
      if (query.search && query.search.trim() !== "") {
        const q = query.search.trim().toLowerCase();
        list = list.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            (item.description && item.description.toLowerCase().includes(q))
        );
      }

      // Sort by createdAt descending
      list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const total = list.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const startIndex = (page - 1) * limit;
      const paginatedItems = list.slice(startIndex, startIndex + limit);

      return reply.status(200).send({
        approvals: paginatedItems.map((item) => item.toJSON()),
        total,
        page,
        limit,
        totalPages,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message || "Failed to list approval requests" });
    }
  });

  // -------------------------------------------------------------
  // GET APPROVAL AUDIT LOG / TIMELINE (fixed subpath before /:id)
  // -------------------------------------------------------------
  fastify.get("/audit-logs", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const filteredLogs = approvalAuditLog.filter(
      (log) => log.payload.tenantId === tenantId
    );
    return reply.status(200).send({ logs: filteredLogs });
  });

  // -------------------------------------------------------------
  // SLA ESCALATION CHECK ROUTE
  // -------------------------------------------------------------
  fastify.post("/escalations/check", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    try {
      const count = await approvalService.checkEscalations(tenantId);
      return reply.status(200).send({ escalatedCount: count });
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message || "Failed SLA escalation check" });
    }
  });

  // -------------------------------------------------------------
  // CREATE APPROVAL REQUEST
  // -------------------------------------------------------------
  fastify.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const body = req.body as {
      id?: string;
      title?: string;
      description?: string;
      workflowInstanceId?: string;
      workflowStepId?: string;
      steps?: {
        id?: string;
        name: string;
        assignedUserIds?: string[];
        assignedRoles?: string[];
        requiredApproversCount?: number;
        dueDurationMs?: number;
        escalationTargetUserId?: string;
      }[];
      metadata?: Record<string, unknown>;
    };

    if (!body || !body.title || body.title.trim() === "") {
      return reply.status(400).send({ error: "Approval title is required" });
    }

    if (!body.steps || !Array.isArray(body.steps) || body.steps.length === 0) {
      return reply.status(400).send({ error: "Approval request must include at least one step" });
    }

    try {
      const request = await approvalService.createApprovalRequest({
        id: body.id,
        tenantId,
        title: body.title,
        description: body.description,
        workflowInstanceId: body.workflowInstanceId,
        workflowStepId: body.workflowStepId,
        requesterUserId: userId,
        steps: body.steps,
        metadata: body.metadata,
      });

      return reply.status(201).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(400).send({ error: error.message || "Failed to create approval request" });
    }
  });

  // -------------------------------------------------------------
  // GET APPROVAL REQUEST BY ID
  // -------------------------------------------------------------
  fastify.get("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { id } = req.params as { id: string };

    try {
      const request = await approvalService.getApprovalRequest(id, tenantId);
      if (!request) {
        return reply.status(404).send({ error: `ApprovalRequest '${id}' not found` });
      }

      return reply.status(200).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message || "Failed to retrieve approval request" });
    }
  });

  // -------------------------------------------------------------
  // APPROVE ACTION
  // -------------------------------------------------------------
  fastify.post("/:id/approve", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = (req.body as {
      stepId?: string;
      comment?: string;
      data?: Record<string, unknown>;
    }) || {};

    try {
      const request = await approvalService.approve({
        id,
        tenantId,
        stepId: body.stepId,
        actorUserId: userId,
        actorRole: role,
        comment: body.comment,
        data: body.data,
      });

      return reply.status(200).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      const status = error.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: error.message || "Failed to approve request" });
    }
  });

  // -------------------------------------------------------------
  // REJECT ACTION
  // -------------------------------------------------------------
  fastify.post("/:id/reject", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = (req.body as {
      stepId?: string;
      comment?: string;
      reason?: string;
      data?: Record<string, unknown>;
    }) || {};

    try {
      const request = await approvalService.reject({
        id,
        tenantId,
        stepId: body.stepId,
        actorUserId: userId,
        actorRole: role,
        comment: body.comment,
        reason: body.reason,
        data: body.data,
      });

      return reply.status(200).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      const status = error.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: error.message || "Failed to reject request" });
    }
  });

  // -------------------------------------------------------------
  // DELEGATE ACTION
  // -------------------------------------------------------------
  fastify.post("/:id/delegate", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      stepId?: string;
      targetUserId?: string;
      comment?: string;
    };

    if (!body || !body.targetUserId || body.targetUserId.trim() === "") {
      return reply.status(400).send({ error: "targetUserId is required for delegation" });
    }

    try {
      const request = await approvalService.delegate({
        id,
        tenantId,
        stepId: body.stepId,
        actorUserId: userId,
        targetUserId: body.targetUserId,
        comment: body.comment,
      });

      return reply.status(200).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      const status = error.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: error.message || "Failed to delegate request" });
    }
  });

  // -------------------------------------------------------------
  // REQUEST MORE INFO ACTION
  // -------------------------------------------------------------
  fastify.post("/:id/request-info", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      stepId?: string;
      question?: string;
      targetUserId?: string;
    };

    if (!body || !body.question || body.question.trim() === "") {
      return reply.status(400).send({ error: "question is required when requesting more information" });
    }

    try {
      const request = await approvalService.requestMoreInfo({
        id,
        tenantId,
        stepId: body.stepId,
        actorUserId: userId,
        question: body.question,
        targetUserId: body.targetUserId,
      });

      return reply.status(200).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      const status = error.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: error.message || "Failed to request more info" });
    }
  });

  // -------------------------------------------------------------
  // RESUME ACTION
  // -------------------------------------------------------------
  fastify.post("/:id/resume", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = (req.body as {
      comment?: string;
      responseData?: Record<string, unknown>;
    }) || {};

    try {
      const request = await approvalService.resume({
        id,
        tenantId,
        actorUserId: userId,
        comment: body.comment,
        responseData: body.responseData,
      });

      return reply.status(200).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      const status = error.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: error.message || "Failed to resume request" });
    }
  });

  // -------------------------------------------------------------
  // CANCEL ACTION
  // -------------------------------------------------------------
  fastify.post("/:id/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = (req.body as { reason?: string }) || {};

    try {
      const request = await approvalService.cancel({
        id,
        tenantId,
        actorUserId: userId,
        reason: body.reason,
      });

      return reply.status(200).send({ approval: request.toJSON() });
    } catch (err: unknown) {
      const error = err as Error;
      const status = error.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: error.message || "Failed to cancel request" });
    }
  });

  // -------------------------------------------------------------
  // GET APPROVAL HISTORY & TIMELINE
  // -------------------------------------------------------------
  fastify.get("/:id/history", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { id } = req.params as { id: string };

    try {
      const request = await approvalService.getApprovalRequest(id, tenantId);
      if (!request) {
        return reply.status(404).send({ error: `ApprovalRequest '${id}' not found` });
      }

      const decisions = request.steps.flatMap((step) =>
        step.decisions.map((d) => ({
          stepId: step.id,
          stepName: step.name,
          ...d,
        }))
      );

      const logs = approvalAuditLog.filter(
        (l) => l.payload.approvalRequestId === id && l.payload.tenantId === tenantId
      );

      return reply.status(200).send({
        approvalRequestId: request.id,
        currentStatus: request.status,
        decisions,
        auditTimeline: logs,
      });
    } catch (err: unknown) {
      const error = err as Error;
      return reply.status(500).send({ error: error.message || "Failed to retrieve approval history" });
    }
  });
}
