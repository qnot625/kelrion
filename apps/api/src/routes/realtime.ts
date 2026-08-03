import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  IQueueRepository,
  TicketApplicationService,
  QueueId,
  TenantMismatchError,
  UnauthorizedError,
  QueueNotFoundError,
} from "@klerion/queue";
import { SSEManager, SSEClient, BroadcastEvent } from "../realtime/sse-manager.js";
import { getUserContext } from "./queues.js";

export interface RealtimeRoutesOptions {
  sseManager: SSEManager;
  queueRepository: IQueueRepository;
  ticketApplicationService?: TicketApplicationService;
}

export async function realtimeRoutes(
  server: FastifyInstance,
  options: RealtimeRoutesOptions
) {
  const { sseManager, queueRepository, ticketApplicationService } = options;

  server.get(
    "/api/realtime/queues/:queueId/stream",
    async (
      req: FastifyRequest<{ Params: { queueId: string }; Querystring: { lastEventId?: string } }>,
      reply: FastifyReply
    ) => {
      // 1. Authenticate and extract user context
      const tenantHeader =
        (req.headers["x-tenant-id"] as string | undefined) ||
        (req.query as { tenantId?: string })?.tenantId;
      if (!tenantHeader) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Missing tenant identification header ('x-tenant-id') or parameter ('tenantId')",
        });
      }

      let userContext;
      try {
        userContext = getUserContext(req);
      } catch (err: unknown) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: err instanceof Error ? err.message : "Invalid authentication context",
        });
      }

      const queueIdStr = req.params.queueId;
      let queueId: QueueId;
      try {
        queueId = QueueId.fromString(queueIdStr);
      } catch {
        return reply.status(400).send({
          error: "BadRequest",
          message: `Invalid queue identifier: '${queueIdStr}'`,
        });
      }

      // 2. Verify queue existence and tenant authorization
      const queue = await queueRepository.findById(userContext.tenantId, queueId);
      if (!queue) {
        return reply.status(404).send({
          error: "NotFound",
          message: `Queue not found: '${queueIdStr}'`,
        });
      }

      if (!queue.tenantId.equals(userContext.tenantId)) {
        return reply.status(403).send({
          error: "Forbidden",
          message: "Cross-tenant queue stream access prohibited",
        });
      }

      // 3. Hijack reply & write SSE headers
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      // 4. Send initial snapshot if ticketApplicationService is available
      if (ticketApplicationService) {
        try {
          const snapshot = await ticketApplicationService.getQueueSnapshot(
            userContext,
            queueId
          );
          const snapshotEvent: BroadcastEvent = {
            eventId: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            eventType: "queue.snapshot.v1",
            tenantId: userContext.tenantId.value,
            aggregateId: queueIdStr,
            occurredAt: new Date(),
            payload: snapshot,
          };
          reply.raw.write(sseManager.formatSSEMessage(snapshotEvent));
        } catch {
          // Ignore initial snapshot retrieval errors
        }
      }

      // 5. Check Last-Event-ID header or query string
      const lastEventId =
        (req.headers["last-event-id"] as string | undefined) || req.query.lastEventId;

      // 6. Register SSE client connection
      const clientId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const client: SSEClient = {
        id: clientId,
        tenantId: userContext.tenantId.value,
        queueId: queueIdStr,
        userId: userContext.userId,
        send: (data: string) => {
          try {
            reply.raw.write(data);
          } catch {
            sseManager.removeClient(clientId);
          }
        },
        close: () => {
          try {
            reply.raw.end();
          } catch {
            // Socket already closed
          }
        },
      };

      sseManager.addClient(client, lastEventId);

      // 7. Cleanup connection on client disconnect
      req.raw.on("close", () => {
        sseManager.removeClient(clientId);
      });
      req.raw.on("aborted", () => {
        sseManager.removeClient(clientId);
      });
    }
  );
}
