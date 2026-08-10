import type { FastifyInstance } from "fastify";
import type { ControlPlaneService } from "@adminops/control-plane";
import type { QueueService } from "@adminops/queue";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";
import { parseSseCursor, startSsePolling } from "../realtime/sse.js";

export function registerQueueRealtimeRoutes(
  app: FastifyInstance,
  queue: QueueService,
  controlPlane: ControlPlaneService,
): void {
  app.get("/queue/events/stream", {
    preHandler: [requireModule(controlPlane, "queue"), requirePermission("queue:view")],
  }, async (request, reply) => {
    const query = request.query as { afterSequence?: string; branchId?: string; serviceId?: string };
    startSsePolling({
      request,
      reply,
      cursor: parseSseCursor(request, query.afterSequence),
      eventName: "queue",
      load: (afterSequence) => queue.eventsAfter(request.tenant!.tenantId, afterSequence, {
        branchId: query.branchId,
        serviceId: query.serviceId,
        limit: 200,
      }),
    });
  });
}
