import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  TicketService,
  InMemoryServiceTicketRepository,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../../../../modules/domains/internal-services/src/index.js";

export const serviceTicketRepository = new InMemoryServiceTicketRepository();

export const serviceTicketAuditLog: Array<{
  id: string;
  action: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}> = [];

export const ticketService = new TicketService(
  serviceTicketRepository,
  async (action, payload) => {
    serviceTicketAuditLog.push({
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
  const role = (req.headers["x-user-role"] as string)?.trim().toLowerCase() || "employee";
  return { tenantId, userId, role };
}

export async function requestsRoutes(fastify: FastifyInstance) {
  // -------------------------------------------------------------
  // LIST EMPLOYEE REQUESTS (My Requests / Filtered / Searched)
  // -------------------------------------------------------------
  fastify.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const query = req.query as {
      status?: TicketStatus;
      category?: TicketCategory;
      priority?: TicketPriority;
      search?: string;
      page?: string;
      limit?: string;
      myRequestsOnly?: string;
    };

    const filterRequester = query.myRequestsOnly === "false" ? undefined : userId;

    const result = await ticketService.listTickets(tenantId, {
      status: query.status,
      category: query.category,
      priority: query.priority,
      requesterUserId: filterRequester,
      search: query.search,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });

    return reply.status(200).send({
      success: true,
      items: result.items,
      total: result.total,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
    });
  });

  // -------------------------------------------------------------
  // CREATE REQUEST
  // -------------------------------------------------------------
  fastify.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const body = req.body as {
      title?: string;
      description?: string;
      category?: TicketCategory;
      priority?: TicketPriority;
      requesterName?: string;
      requesterEmail?: string;
      customFields?: Record<string, unknown>;
      formSubmissionId?: string;
      workflowInstanceId?: string;
    };

    if (!body.title || !body.title.trim()) {
      return reply.status(400).send({ success: false, error: "Title is required" });
    }
    if (!body.category) {
      return reply.status(400).send({ success: false, error: "Category is required" });
    }

    try {
      const ticket = await ticketService.createTicket(tenantId, {
        title: body.title,
        description: body.description || "",
        category: body.category,
        priority: body.priority || "MEDIUM",
        requesterUserId: userId,
        requesterName: body.requesterName || userId,
        requesterEmail: body.requesterEmail,
        customFields: body.customFields,
        formSubmissionId: body.formSubmissionId,
        workflowInstanceId: body.workflowInstanceId,
      });

      return reply.status(201).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // SAVE DRAFT REQUEST
  // -------------------------------------------------------------
  fastify.post("/draft", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const body = req.body as {
      id?: string;
      title?: string;
      description?: string;
      category?: TicketCategory;
      priority?: TicketPriority;
      customFields?: Record<string, unknown>;
    };

    if (!body.title || !body.title.trim()) {
      return reply.status(400).send({ success: false, error: "Draft title is required" });
    }

    try {
      const ticket = await ticketService.saveDraft(tenantId, {
        id: body.id,
        title: body.title,
        description: body.description || "",
        category: body.category || "GENERAL",
        priority: body.priority || "LOW",
        requesterUserId: userId,
        customFields: body.customFields,
      });

      return reply.status(201).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // SUBMIT DRAFT REQUEST
  // -------------------------------------------------------------
  fastify.post("/:id/submit", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { id } = req.params as { id: string };

    const existing = await ticketService.getTicket(tenantId, id);
    if (!existing) {
      return reply.status(404).send({ success: false, error: `Request ${id} not found` });
    }

    if (existing.requesterUserId !== userId && getSecurityContext(req).role !== "admin") {
      return reply.status(403).send({ success: false, error: "Forbidden: Only requester or admin can submit draft" });
    }

    try {
      const ticket = await ticketService.submitDraft(tenantId, id, userId);
      return reply.status(200).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(409).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // GET REQUEST DETAILS
  // -------------------------------------------------------------
  fastify.get("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };

    const ticket = await ticketService.getTicket(tenantId, id);
    if (!ticket) {
      return reply.status(404).send({ success: false, error: `Request ${id} not found` });
    }

    // RBAC: employees can only view their own requests unless agent/admin
    if (role === "employee" && ticket.requesterUserId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden: Cannot view another user's request" });
    }

    // Filter out internal notes for pure employee view
    const sanitizeComments = role === "employee"
      ? ticket.comments.filter((c) => !c.isInternal)
      : ticket.comments;

    return reply.status(200).send({
      success: true,
      ticket: {
        ...ticket,
        comments: sanitizeComments,
      },
    });
  });

  // -------------------------------------------------------------
  // UPDATE REQUEST DETAILS
  // -------------------------------------------------------------
  fastify.put("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      title?: string;
      description?: string;
      category?: TicketCategory;
      customFields?: Record<string, unknown>;
    };

    const existing = await ticketService.getTicket(tenantId, id);
    if (!existing) {
      return reply.status(404).send({ success: false, error: `Request ${id} not found` });
    }

    if (role === "employee" && existing.requesterUserId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden: Cannot edit another user's request" });
    }

    try {
      const ticket = await ticketService.updateTicket(tenantId, id, userId, body);
      return reply.status(200).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // REQUEST TIMELINE & COMMENT FEED
  // -------------------------------------------------------------
  fastify.get("/:id/timeline", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };

    const ticket = await ticketService.getTicket(tenantId, id);
    if (!ticket) {
      return reply.status(404).send({ success: false, error: `Request ${id} not found` });
    }

    if (role === "employee" && ticket.requesterUserId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden: Cannot view timeline" });
    }

    const comments = role === "employee"
      ? ticket.comments.filter((c) => !c.isInternal)
      : ticket.comments;

    return reply.status(200).send({
      success: true,
      timeline: ticket.timeline,
      comments,
    });
  });

  // -------------------------------------------------------------
  // ADD PUBLIC COMMENT
  // -------------------------------------------------------------
  fastify.post("/:id/comments", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as { content?: string; authorName?: string };

    if (!body.content || !body.content.trim()) {
      return reply.status(400).send({ success: false, error: "Comment content is required" });
    }

    const ticket = await ticketService.getTicket(tenantId, id);
    if (!ticket) {
      return reply.status(404).send({ success: false, error: `Request ${id} not found` });
    }

    if (role === "employee" && ticket.requesterUserId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden: Cannot comment on this request" });
    }

    try {
      const updated = await ticketService.addComment(
        tenantId,
        id,
        userId,
        body.content,
        false,
        body.authorName || userId,
        role
      );
      return reply.status(201).send({ success: true, ticket: updated });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // ADD ATTACHMENT
  // -------------------------------------------------------------
  fastify.post("/:id/attachments", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as { fileName?: string; fileUrl?: string; fileSize?: number; mimeType?: string };

    if (!body.fileName || !body.fileUrl) {
      return reply.status(400).send({ success: false, error: "fileName and fileUrl are required" });
    }

    const ticket = await ticketService.getTicket(tenantId, id);
    if (!ticket) {
      return reply.status(404).send({ success: false, error: `Request ${id} not found` });
    }

    if (role === "employee" && ticket.requesterUserId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden: Cannot attach files to this request" });
    }

    try {
      const updated = await ticketService.addAttachment(
        tenantId,
        id,
        userId,
        body.fileName,
        body.fileUrl,
        body.fileSize || 1024,
        body.mimeType
      );
      return reply.status(201).send({ success: true, ticket: updated });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // CANCEL REQUEST
  // -------------------------------------------------------------
  fastify.post("/:id/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string };

    const ticket = await ticketService.getTicket(tenantId, id);
    if (!ticket) {
      return reply.status(404).send({ success: false, error: `Request ${id} not found` });
    }

    if (role === "employee" && ticket.requesterUserId !== userId) {
      return reply.status(403).send({ success: false, error: "Forbidden: Cannot cancel this request" });
    }

    try {
      const updated = await ticketService.cancelTicket(tenantId, id, userId, body.reason || "Cancelled by user");
      return reply.status(200).send({ success: true, ticket: updated });
    } catch (err: any) {
      return reply.status(409).send({ success: false, error: err.message });
    }
  });
}
