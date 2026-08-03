import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  TicketApplicationService,
  QueueId,
  TicketId,
  TenantId,
  UserRole,
  UserContext,
  UnauthorizedError,
  TenantMismatchError,
  QueueNotFoundError,
  TicketNotFoundError,
  QueueInactiveError,
  QueuePausedError,
  QueueTicket,
} from "@klerion/queue";
import { formatTicket } from "./check-in.js";

export interface TicketRoutesOptions {
  ticketApplicationService: TicketApplicationService;
}

function getUserContext(req: FastifyRequest): UserContext {
  const tenantHeader =
    (req.headers["x-tenant-id"] as string | undefined) ||
    (req.query as { tenantId?: string })?.tenantId;
  const userIdHeader =
    (req.headers["x-user-id"] as string | undefined) ||
    (req.query as { userId?: string })?.userId;
  const roleHeader =
    (req.headers["x-user-role"] as string | undefined) ||
    (req.query as { role?: string })?.role;

  const tenantId = tenantHeader ? TenantId.fromString(tenantHeader) : TenantId.generate();
  const userId = userIdHeader || "anonymous-user";

  let role = UserRole.MEMBER;
  if (roleHeader) {
    const upperRole = roleHeader.toUpperCase();
    if (upperRole === "OWNER") role = UserRole.OWNER;
    else if (upperRole === "STAFF") role = UserRole.STAFF;
    else if (upperRole === "MEMBER") role = UserRole.MEMBER;
  }

  return { userId, tenantId, role };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof UnauthorizedError) {
    return reply.status(401).send({ error: "Unauthorized", message: err.message });
  }
  if (err instanceof TenantMismatchError) {
    return reply.status(403).send({ error: "Forbidden", message: err.message });
  }
  if (err instanceof QueueNotFoundError || err instanceof TicketNotFoundError) {
    return reply.status(404).send({ error: "Not Found", message: (err as Error).message });
  }
  if (err instanceof QueueInactiveError || err instanceof QueuePausedError) {
    return reply.status(400).send({ error: "Bad Request", message: (err as Error).message });
  }
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return reply.status(500).send({ error: "Internal Server Error", message });
}

const callNextSchema = z.object({
  counterId: z.string().optional().default("Counter 1"),
});

const transferSchema = z.object({
  targetQueueId: z.string().min(1, "targetQueueId is required"),
});

export async function ticketRoutes(
  fastify: FastifyInstance,
  options: TicketRoutesOptions
) {
  const { ticketApplicationService } = options;

  // POST /api/queues/:queueId/tickets/call-next
  fastify.post(
    "/api/queues/:queueId/tickets/call-next",
    async (
      req: FastifyRequest<{ Params: { queueId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userContext = getUserContext(req);
        const parseResult = callNextSchema.safeParse(req.body || {});
        if (!parseResult.success) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Validation failed",
            details: parseResult.error.flatten().fieldErrors,
          });
        }

        const queueId = QueueId.fromString(req.params.queueId);
        const ticket = await ticketApplicationService.callNextTicket(
          userContext,
          queueId,
          parseResult.data.counterId
        );

        if (!ticket) {
          return reply.status(200).send({ ticket: null, message: "No waiting tickets in queue" });
        }

        return reply.status(200).send({ ticket: formatTicket(ticket) });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tickets/:ticketId/recall
  fastify.post(
    "/api/tickets/:ticketId/recall",
    async (
      req: FastifyRequest<{ Params: { ticketId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userContext = getUserContext(req);
        const ticketId = TicketId.fromString(req.params.ticketId);
        const ticket = await ticketApplicationService.recallTicket(userContext, ticketId);
        return reply.status(200).send({ ticket: formatTicket(ticket) });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tickets/:ticketId/skip
  fastify.post(
    "/api/tickets/:ticketId/skip",
    async (
      req: FastifyRequest<{ Params: { ticketId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userContext = getUserContext(req);
        const ticketId = TicketId.fromString(req.params.ticketId);
        const ticket = await ticketApplicationService.skipTicket(userContext, ticketId);
        return reply.status(200).send({ ticket: formatTicket(ticket) });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tickets/:ticketId/complete
  fastify.post(
    "/api/tickets/:ticketId/complete",
    async (
      req: FastifyRequest<{ Params: { ticketId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userContext = getUserContext(req);
        const ticketId = TicketId.fromString(req.params.ticketId);
        const ticket = await ticketApplicationService.completeTicket(userContext, ticketId);
        return reply.status(200).send({ ticket: formatTicket(ticket) });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );

  // POST /api/tickets/:ticketId/transfer
  fastify.post(
    "/api/tickets/:ticketId/transfer",
    async (
      req: FastifyRequest<{ Params: { ticketId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userContext = getUserContext(req);
        const parseResult = transferSchema.safeParse(req.body);
        if (!parseResult.success) {
          return reply.status(400).send({
            error: "Bad Request",
            message: "Validation failed",
            details: parseResult.error.flatten().fieldErrors,
          });
        }

        const ticketId = TicketId.fromString(req.params.ticketId);
        const targetQueueId = QueueId.fromString(parseResult.data.targetQueueId);
        const ticket = await ticketApplicationService.transferTicket(
          userContext,
          ticketId,
          targetQueueId
        );

        return reply.status(200).send({ ticket: formatTicket(ticket) });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );
}
