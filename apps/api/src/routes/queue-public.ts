import type { FastifyInstance } from "fastify";
import type { QueueService } from "@adminops/queue";

function required(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function publicStatus(entry: Awaited<ReturnType<QueueService["getByPublicToken"]>>) {
  return {
    publicToken: entry.publicToken,
    ticketNumber: entry.ticketNumber,
    branchId: entry.branchId,
    serviceId: entry.serviceId,
    departmentId: entry.departmentId,
    status: entry.status,
    priority: entry.priority,
    stationId: entry.stationId,
    recallCount: entry.recallCount,
    checkedInAt: entry.checkedInAt.toISOString(),
    calledAt: entry.calledAt?.toISOString() ?? null,
    serviceStartedAt: entry.serviceStartedAt?.toISOString() ?? null,
    completedAt: entry.completedAt?.toISOString() ?? null,
    cancelledAt: entry.cancelledAt?.toISOString() ?? null,
    noShowAt: entry.noShowAt?.toISOString() ?? null,
  };
}

export function registerPublicQueueRoutes(app: FastifyInstance, queue: QueueService): void {
  app.get<{ Params: { publicToken: string } }>("/public/queue/status/:publicToken", async (request, reply) => {
    try {
      return reply.send(publicStatus(await queue.getByPublicToken(request.tenant!.tenantId, request.params.publicToken)));
    } catch {
      return reply.code(404).send({ error: "Queue ticket not found" });
    }
  });

  app.get("/public/queue/display", async (request, reply) => {
    const query = request.query as { branchId?: string; serviceId?: string };
    let branchId: string;
    try { branchId = required(query.branchId, "branchId"); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid request" }); }
    const entries = query.serviceId
      ? await queue.listQueue(request.tenant!.tenantId, branchId, query.serviceId)
      : await queue.listBranch(request.tenant!.tenantId, branchId);
    const active = entries
      .filter((entry) => entry.status === "CALLED" || entry.status === "SERVING")
      .sort((a, b) => (b.calledAt?.getTime() ?? b.updatedAt.getTime()) - (a.calledAt?.getTime() ?? a.updatedAt.getTime()))
      .slice(0, 30)
      .map((entry) => ({
        ticketNumber: entry.ticketNumber,
        branchId: entry.branchId,
        serviceId: entry.serviceId,
        status: entry.status,
        stationId: entry.stationId,
        calledAt: entry.calledAt?.toISOString() ?? null,
        serviceStartedAt: entry.serviceStartedAt?.toISOString() ?? null,
      }));
    const waiting = entries.filter((entry) => entry.status === "WAITING").length;
    return reply.send({ generatedAt: new Date().toISOString(), branchId, serviceId: query.serviceId ?? null, waiting, active });
  });
}
