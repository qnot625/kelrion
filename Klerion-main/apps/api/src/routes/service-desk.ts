import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  ticketService,
  getSecurityContext,
} from "./requests.js";
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  SLAStatus,
} from "../../../../modules/domains/internal-services/src/index.js";

export async function serviceDeskRoutes(fastify: FastifyInstance) {
  // -------------------------------------------------------------
  // AGENT DASHBOARD & METRICS SUMMARY
  // -------------------------------------------------------------
  fastify.get("/dashboard", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, role } = getSecurityContext(req);
    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const metrics = await ticketService.getMetrics(tenantId);
    return reply.status(200).send({ success: true, metrics });
  });

  fastify.get("/metrics", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, role } = getSecurityContext(req);
    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const metrics = await ticketService.getMetrics(tenantId);
    return reply.status(200).send({ success: true, metrics });
  });

  // -------------------------------------------------------------
  // TICKET QUEUE (All Tickets with Filters, Search, Pagination)
  // -------------------------------------------------------------
  fastify.get("/tickets", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, role } = getSecurityContext(req);
    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const query = req.query as {
      status?: TicketStatus;
      priority?: TicketPriority;
      category?: TicketCategory;
      assignedUserId?: string;
      assignedTeamId?: string;
      slaStatus?: SLAStatus;
      search?: string;
      page?: string;
      limit?: string;
    };

    const result = await ticketService.listTickets(tenantId, {
      status: query.status,
      priority: query.priority,
      category: query.category,
      assignedUserId: query.assignedUserId,
      assignedTeamId: query.assignedTeamId,
      slaStatus: query.slaStatus,
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
  // MY ASSIGNED TICKETS
  // -------------------------------------------------------------
  fastify.get("/tickets/my-assigned", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const result = await ticketService.listTickets(tenantId, {
      assignedUserId: userId,
      limit: 100,
    });

    return reply.status(200).send({ success: true, items: result.items, total: result.total });
  });

  // -------------------------------------------------------------
  // TEAM QUEUE (Unassigned or Team Tickets)
  // -------------------------------------------------------------
  fastify.get("/tickets/team-queue", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, role } = getSecurityContext(req);
    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const result = await ticketService.listTickets(tenantId, { limit: 100 });
    const unassigned = result.items.filter((t) => !t.assignedUserId && t.status !== "CLOSED" && t.status !== "CANCELLED");

    return reply.status(200).send({ success: true, items: unassigned, total: unassigned.length });
  });

  // -------------------------------------------------------------
  // TICKET DETAIL FOR AGENT
  // -------------------------------------------------------------
  fastify.get("/tickets/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };

    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const ticket = await ticketService.getTicket(tenantId, id);
    if (!ticket) {
      return reply.status(404).send({ success: false, error: `Ticket ${id} not found` });
    }

    return reply.status(200).send({ success: true, ticket });
  });

  // -------------------------------------------------------------
  // ASSIGN / REASSIGN TICKET
  // -------------------------------------------------------------
  fastify.post("/tickets/:id/assign", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as { assigneeUserId?: string; teamId?: string };

    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    try {
      const ticket = await ticketService.assignTicket(
        tenantId,
        id,
        userId,
        body.assigneeUserId,
        body.teamId
      );
      return reply.status(200).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // UPDATE STATUS
  // -------------------------------------------------------------
  fastify.post("/tickets/:id/status", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as { status?: TicketStatus; comment?: string; resolutionNotes?: string };

    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    if (!body.status) {
      return reply.status(400).send({ success: false, error: "status is required" });
    }

    try {
      let ticket;
      if (body.status === "RESOLVED") {
        ticket = await ticketService.resolveTicket(tenantId, id, userId, body.resolutionNotes || body.comment || "Resolved by agent");
      } else if (body.status === "CLOSED") {
        ticket = await ticketService.closeTicket(tenantId, id, userId);
      } else {
        ticket = await ticketService.updateStatus(tenantId, id, userId, body.status, body.comment);
      }
      return reply.status(200).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // UPDATE PRIORITY
  // -------------------------------------------------------------
  fastify.post("/tickets/:id/priority", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as { priority?: TicketPriority; reason?: string };

    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    if (!body.priority) {
      return reply.status(400).send({ success: false, error: "priority is required" });
    }

    try {
      const ticket = await ticketService.updatePriority(tenantId, id, userId, body.priority, body.reason);
      return reply.status(200).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // ADD COMMENT OR INTERNAL NOTE
  // -------------------------------------------------------------
  fastify.post("/tickets/:id/comments", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    const { id } = req.params as { id: string };
    const body = req.body as { content?: string; isInternal?: boolean; authorName?: string };

    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    if (!body.content || !body.content.trim()) {
      return reply.status(400).send({ success: false, error: "Comment content is required" });
    }

    try {
      const ticket = await ticketService.addComment(
        tenantId,
        id,
        userId,
        body.content,
        Boolean(body.isInternal),
        body.authorName || userId,
        role
      );
      return reply.status(201).send({ success: true, ticket });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------
  // SLA OVERVIEW & EXPIRATION CHECKS
  // -------------------------------------------------------------
  fastify.get("/sla/overview", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, role } = getSecurityContext(req);
    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const metrics = await ticketService.getMetrics(tenantId);
    return reply.status(200).send({
      success: true,
      slaOverview: {
        warningCount: metrics.slaWarningTickets,
        breachedCount: metrics.slaBreachedTickets,
      },
    });
  });

  fastify.post("/sla/check", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, role } = getSecurityContext(req);
    if (role === "employee") {
      return reply.status(403).send({ success: false, error: "Forbidden: Agent or Admin access required" });
    }

    const result = await ticketService.checkSLAExpirations(tenantId);
    return reply.status(200).send({ success: true, ...result });
  });
}
