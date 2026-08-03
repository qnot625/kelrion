import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  QueueApplicationService,
  TicketApplicationService,
  BranchId,
  QueueId,
  TenantId,
  UserRole,
  UserContext,
  UnauthorizedError,
  TenantMismatchError,
  QueueNotFoundError,
  QueueInactiveError,
  QueuePausedError,
  QueueTicket,
  Queue,
} from "@klerion/queue";

export interface QueueRoutesOptions {
  queueApplicationService: QueueApplicationService;
  ticketApplicationService: TicketApplicationService;
}

export function getUserContext(req: FastifyRequest): UserContext {
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

export function formatQueue(queue: Queue) {
  return {
    id: queue.id.value,
    tenantId: queue.tenantId.value,
    branchId: queue.branchId.value,
    code: queue.code,
    name: queue.name,
    prefix: queue.prefix,
    isActive: queue.isActive,
    isPaused: queue.isPaused,
    currentSequence: queue.currentSequence,
    avgServiceTimeMinutes: queue.avgServiceTimeMinutes,
    createdAt: queue.createdAt.toISOString(),
    updatedAt: queue.updatedAt.toISOString(),
  };
}

export function handleError(err: unknown, reply: FastifyReply) {
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

const createQueueSchema = z.object({
  branchId: z.string().min(1, "branchId is required"),
  code: z.string().min(1, "code is required"),
  name: z.string().min(1, "name is required"),
  prefix: z.string().min(1, "prefix is required"),
  avgServiceTimeMinutes: z.number().positive().optional(),
});

export async function queueRoutes(
  fastify: FastifyInstance,
  options: QueueRoutesOptions
) {
  const { queueApplicationService, ticketApplicationService } = options;

  // GET /api/queues
  fastify.get("/api/queues", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const queues = await queueApplicationService.getQueuesByTenant(userContext);
      return reply.send({ queues: queues.map(formatQueue) });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // POST /api/queues
  fastify.post("/api/queues", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const parseResult = createQueueSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "Validation failed",
          details: parseResult.error.flatten().fieldErrors,
        });
      }

      const body = parseResult.data;
      const queue = await queueApplicationService.createQueue(userContext, {
        branchId: BranchId.fromString(body.branchId),
        code: body.code,
        name: body.name,
        prefix: body.prefix,
        avgServiceTimeMinutes: body.avgServiceTimeMinutes,
      });

      return reply.status(201).send({ queue: formatQueue(queue) });
    } catch (err) {
      return handleError(err, reply);
    }
  });

  // GET /api/queues/:id/snapshot
  fastify.get(
    "/api/queues/:id/snapshot",
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const userContext = getUserContext(req);
        const queueId = QueueId.fromString(req.params.id);
        const snapshot = await ticketApplicationService.getQueueSnapshot(
          userContext,
          queueId
        );
        return reply.send({ snapshot });
      } catch (err) {
        return handleError(err, reply);
      }
    }
  );
}
