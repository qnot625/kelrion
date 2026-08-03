import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  TicketApplicationService,
  QueueId,
  QueuePriority,
  TenantId,
  UserRole,
  UserContext,
  UnauthorizedError,
  TenantMismatchError,
  QueueNotFoundError,
  QueueInactiveError,
  QueuePausedError,
  QueueTicket,
} from "@klerion/queue";

export interface CheckInRoutesOptions {
  ticketApplicationService: TicketApplicationService;
}

function getUserContext(req: FastifyRequest): UserContext {
  const tenantHeader = req.headers["x-tenant-id"] as string | undefined;
  const userIdHeader = req.headers["x-user-id"] as string | undefined;
  const roleHeader = req.headers["x-user-role"] as string | undefined;

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

export function formatTicket(ticket: QueueTicket) {
  return {
    id: ticket.id.value,
    queueId: ticket.queueId.value,
    tenantId: ticket.tenantId.value,
    number: ticket.number.formatted,
    sequence: ticket.number.sequence,
    status: ticket.status,
    priority: ticket.priority,
    customerName: ticket.customerName,
    customerPhone: ticket.customerPhone,
    serviceId: ticket.serviceId,
    counterId: ticket.counterId,
    servedByUserId: ticket.servedByUserId,
    estimatedWaitMinutes: ticket.estimatedWaitMinutes,
    joinedAt: ticket.createdAt.toISOString(),
    calledAt: ticket.calledAt ? ticket.calledAt.toISOString() : null,
    completedAt: ticket.completedAt ? ticket.completedAt.toISOString() : null,
  };
}

function handleError(err: unknown, reply: FastifyReply) {
  if (err instanceof UnauthorizedError) {
    return reply.status(401).send({ error: "Unauthorized", message: err.message });
  }
  if (err instanceof TenantMismatchError) {
    return reply.status(403).send({ error: "Forbidden", message: err.message });
  }
  if (err instanceof QueueNotFoundError) {
    return reply.status(404).send({ error: "Not Found", message: (err as Error).message });
  }
  if (err instanceof QueueInactiveError || err instanceof QueuePausedError) {
    return reply.status(400).send({ error: "Bad Request", message: (err as Error).message });
  }
  const message = err instanceof Error ? err.message : "Internal Server Error";
  return reply.status(500).send({ error: "Internal Server Error", message });
}

function parsePriority(p?: string): QueuePriority {
  if (!p) return QueuePriority.STANDARD;
  const lower = p.toLowerCase();
  if (lower === "vip") return QueuePriority.VIP;
  if (lower === "appointment") return QueuePriority.APPOINTMENT;
  if (lower === "emergency") return QueuePriority.EMERGENCY;
  return QueuePriority.STANDARD;
}

const remoteCheckInSchema = z.object({
  queueId: z.string().min(1, "queueId is required"),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  priority: z.enum(["standard", "vip", "emergency", "appointment", "STANDARD", "VIP", "EMERGENCY", "APPOINTMENT"]).optional(),
  serviceId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const walkInCheckInSchema = z.object({
  queueId: z.string().min(1, "queueId is required"),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  serviceId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

const appointmentCheckInSchema = z.object({
  queueId: z.string().min(1, "queueId is required"),
  appointmentId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  serviceId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export async function checkInRoutes(
  fastify: FastifyInstance,
  options: CheckInRoutesOptions
) {
  const { ticketApplicationService } = options;

  // POST /api/check-in/remote
  fastify.post("/api/check-in/remote", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const parseResult = remoteCheckInSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const body = parseResult.data;
      const ticket = await ticketApplicationService.joinQueue(userContext, {
        queueId: QueueId.fromString(body.queueId),
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        priority: parsePriority(body.priority),
        serviceId: body.serviceId,
        idempotencyKey: body.idempotencyKey,
      });

      return reply.status(201).send({ ticket: formatTicket(ticket) });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // POST /api/check-in/walk-in
  fastify.post("/api/check-in/walk-in", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const parseResult = walkInCheckInSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const body = parseResult.data;
      const ticket = await ticketApplicationService.joinQueue(userContext, {
        queueId: QueueId.fromString(body.queueId),
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        priority: QueuePriority.STANDARD,
        serviceId: body.serviceId,
        idempotencyKey: body.idempotencyKey,
      });

      return reply.status(201).send({ ticket: formatTicket(ticket) });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // POST /api/check-in/appointment
  fastify.post("/api/check-in/appointment", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const parseResult = appointmentCheckInSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const body = parseResult.data;
      const ticket = await ticketApplicationService.joinQueue(userContext, {
        queueId: QueueId.fromString(body.queueId),
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        priority: QueuePriority.APPOINTMENT,
        serviceId: body.serviceId,
        idempotencyKey: body.idempotencyKey,
      });

      return reply.status(201).send({ ticket: formatTicket(ticket) });
    } catch (err) {
      return handleError(err, reply);
    }
  });
}
