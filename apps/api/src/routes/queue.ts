import type { FastifyInstance } from "fastify";
import type { ControlPlaneService } from "@adminops/control-plane";
import { hasPermission } from "@adminops/identity";
import {
  QueueCapacityError,
  QueueConfigurationNotFoundError,
  QueueEntryNotFoundError,
  QueueStateError,
  QueueValidationError,
  type QueueCheckInService,
  type QueuePriority,
  type QueueService,
} from "@adminops/queue";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function priority(value: unknown): QueuePriority | undefined {
  return value === "STANDARD" || value === "PRIORITY" || value === "URGENT" ? value : undefined;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}

function mapError(error: unknown): { status: number; message: string } | null {
  if (error instanceof QueueEntryNotFoundError || error instanceof QueueConfigurationNotFoundError) return { status: 404, message: error.message };
  if (error instanceof QueueCapacityError) return { status: 409, message: error.message };
  if (error instanceof QueueValidationError || error instanceof QueueStateError) return { status: 400, message: error.message };
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

function publicEntry(entry: Awaited<ReturnType<QueueService["getByPublicToken"]>>) {
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
  };
}

export function registerQueueRoutes(
  app: FastifyInstance,
  queue: QueueService,
  checkIn: QueueCheckInService,
  controlPlane: ControlPlaneService,
): void {
  const moduleGuard = requireModule(controlPlane, "queue");

  app.get("/queue/configurations", { preHandler: [moduleGuard, requirePermission("queue:view")] }, async (request, reply) => {
    const query = request.query as { branchId?: string };
    return reply.send((await queue.listConfigurations(request.tenant!.tenantId, query.branchId)).map((item) => item.toJSON()));
  });

  app.post("/queue/configurations", { preHandler: [moduleGuard, requirePermission("queue:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.branchId !== "string" || typeof body.serviceId !== "string" || typeof body.prefix !== "string") throw new QueueValidationError("branchId, serviceId and prefix are required");
    const result = await queue.createConfiguration({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth!.userId,
      id: typeof body.id === "string" ? body.id : undefined,
      branchId: body.branchId,
      serviceId: body.serviceId,
      departmentId: optionalString(body.departmentId),
      prefix: body.prefix,
      averageServiceMinutes: typeof body.averageServiceMinutes === "number" ? body.averageServiceMinutes : undefined,
      allowWalkIns: typeof body.allowWalkIns === "boolean" ? body.allowWalkIns : undefined,
      allowAppointmentCheckIn: typeof body.allowAppointmentCheckIn === "boolean" ? body.allowAppointmentCheckIn : undefined,
      maxEarlyCheckInMinutes: typeof body.maxEarlyCheckInMinutes === "number" || body.maxEarlyCheckInMinutes === null ? body.maxEarlyCheckInMinutes : undefined,
      maxLateCheckInMinutes: typeof body.maxLateCheckInMinutes === "number" || body.maxLateCheckInMinutes === null ? body.maxLateCheckInMinutes : undefined,
      maxConcurrentServing: typeof body.maxConcurrentServing === "number" ? body.maxConcurrentServing : undefined,
    });
    return reply.code(201).send(result.toJSON());
  }));

  app.patch<{ Params: { id: string } }>("/queue/configurations/:id", { preHandler: [moduleGuard, requirePermission("queue:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const result = await queue.updateConfiguration({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
      departmentId: optionalString(body.departmentId),
      prefix: typeof body.prefix === "string" ? body.prefix : undefined,
      averageServiceMinutes: typeof body.averageServiceMinutes === "number" ? body.averageServiceMinutes : undefined,
      allowWalkIns: typeof body.allowWalkIns === "boolean" ? body.allowWalkIns : undefined,
      allowAppointmentCheckIn: typeof body.allowAppointmentCheckIn === "boolean" ? body.allowAppointmentCheckIn : undefined,
      maxEarlyCheckInMinutes: typeof body.maxEarlyCheckInMinutes === "number" || body.maxEarlyCheckInMinutes === null ? body.maxEarlyCheckInMinutes : undefined,
      maxLateCheckInMinutes: typeof body.maxLateCheckInMinutes === "number" || body.maxLateCheckInMinutes === null ? body.maxLateCheckInMinutes : undefined,
      maxConcurrentServing: typeof body.maxConcurrentServing === "number" ? body.maxConcurrentServing : undefined,
    });
    return reply.send(result.toJSON());
  }));

  app.post("/queue/check-in/walk-in", { preHandler: [moduleGuard, requirePermission("queue:checkin")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.branchId !== "string" || typeof body.serviceId !== "string") throw new QueueValidationError("branchId and serviceId are required");
    const rawCustomer = isRecord(body.customer) ? body.customer : {};
    const canManage = hasPermission(request.auth!.roles, "queue:manage");
    const customer = {
      userId: canManage ? (typeof rawCustomer.userId === "string" ? rawCustomer.userId : null) : request.auth!.userId,
      employeeId: typeof rawCustomer.employeeId === "string" ? rawCustomer.employeeId : null,
      customerId: typeof rawCustomer.customerId === "string" ? rawCustomer.customerId : null,
      name: typeof rawCustomer.name === "string" ? rawCustomer.name : null,
      email: typeof rawCustomer.email === "string" ? rawCustomer.email : null,
      phone: typeof rawCustomer.phone === "string" ? rawCustomer.phone : null,
      externalReference: typeof rawCustomer.externalReference === "string" ? rawCustomer.externalReference : null,
    };
    const result = await checkIn.checkInWalkIn({
      tenantId: request.tenant!.tenantId,
      branchId: body.branchId,
      serviceId: body.serviceId,
      departmentId: optionalString(body.departmentId),
      customer,
      priority: priority(body.priority),
      priorityAdjustment: typeof body.priorityAdjustment === "number" && canManage ? body.priorityAdjustment : undefined,
      source: body.source === "STAFF" || body.source === "KIOSK" || body.source === "QR" || body.source === "PUBLIC" || body.source === "API" ? body.source : "PUBLIC",
      idempotencyKey: optionalString(body.idempotencyKey),
      metadata: isRecord(body.metadata) ? body.metadata : undefined,
      actorUserId: request.auth!.userId,
    });
    return reply.code(201).send(result.toJSON());
  }));

  app.post<{ Params: { appointmentId: string } }>("/queue/check-in/appointments/:appointmentId", { preHandler: [moduleGuard, requirePermission("queue:checkin")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const canManage = hasPermission(request.auth!.roles, "queue:manage");
    const result = await checkIn.checkInAppointment({
      tenantId: request.tenant!.tenantId,
      appointmentId: request.params.appointmentId,
      priority: priority(body.priority),
      priorityAdjustment: typeof body.priorityAdjustment === "number" && canManage ? body.priorityAdjustment : undefined,
      source: body.source === "STAFF" || body.source === "KIOSK" || body.source === "QR" || body.source === "PUBLIC" || body.source === "API" ? body.source : "PUBLIC",
      idempotencyKey: optionalString(body.idempotencyKey),
      metadata: isRecord(body.metadata) ? body.metadata : undefined,
      actorUserId: request.auth!.userId,
    });
    return reply.code(201).send(result.toJSON());
  }));

  app.get<{ Params: { publicToken: string } }>("/queue/status/:publicToken", { preHandler: [moduleGuard, requirePermission("queue:view")] }, async (request, reply) => handled(reply, async () =>
    reply.send(publicEntry(await queue.getByPublicToken(request.tenant!.tenantId, request.params.publicToken)))));

  app.get("/queue/entries", { preHandler: [moduleGuard, requirePermission("queue:view")] }, async (request, reply) => handled(reply, async () => {
    const query = request.query as { branchId?: string; serviceId?: string };
    if (!query.branchId) throw new QueueValidationError("branchId is required");
    const items = query.serviceId
      ? await queue.listQueue(request.tenant!.tenantId, query.branchId, query.serviceId)
      : await queue.listBranch(request.tenant!.tenantId, query.branchId);
    const canManage = hasPermission(request.auth!.roles, "queue:manage") || hasPermission(request.auth!.roles, "queue:serve");
    const visible = canManage ? items : items.filter((item) => item.customer.userId === request.auth!.userId);
    return reply.send(visible.map((item) => item.toJSON()));
  }));

  app.get<{ Params: { id: string } }>("/queue/entries/:id", { preHandler: [moduleGuard, requirePermission("queue:view")] }, async (request, reply) => handled(reply, async () => {
    const item = await queue.getEntry(request.tenant!.tenantId, request.params.id);
    const canManage = hasPermission(request.auth!.roles, "queue:manage") || hasPermission(request.auth!.roles, "queue:serve");
    if (!canManage && item.customer.userId !== request.auth!.userId) return reply.code(403).send({ error: "You do not have access to this queue entry" });
    return reply.send(item.toJSON());
  }));

  app.post("/queue/call-next", { preHandler: [moduleGuard, requirePermission("queue:serve")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.branchId !== "string" || typeof body.serviceId !== "string" || typeof body.stationId !== "string") throw new QueueValidationError("branchId, serviceId and stationId are required");
    const result = await queue.callNext({ tenantId: request.tenant!.tenantId, branchId: body.branchId, serviceId: body.serviceId, stationId: body.stationId, actorUserId: request.auth!.userId });
    return reply.send(result ? result.toJSON() : null);
  }));

  app.post<{ Params: { id: string } }>("/queue/entries/:id/recall", { preHandler: [moduleGuard, requirePermission("queue:serve")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await queue.recall({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, stationId: isRecord(request.body) ? optionalString(request.body.stationId) : undefined })).toJSON())));

  app.post<{ Params: { id: string } }>("/queue/entries/:id/start", { preHandler: [moduleGuard, requirePermission("queue:serve")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await queue.startService({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, stationId: isRecord(request.body) ? optionalString(request.body.stationId) : undefined })).toJSON())));

  app.post<{ Params: { id: string } }>("/queue/entries/:id/complete", { preHandler: [moduleGuard, requirePermission("queue:serve")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await queue.complete({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId })).toJSON())));

  app.post<{ Params: { id: string } }>("/queue/entries/:id/no-show", { preHandler: [moduleGuard, requirePermission("queue:serve")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await queue.noShow({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId })).toJSON())));

  app.post<{ Params: { id: string } }>("/queue/entries/:id/cancel", { preHandler: [moduleGuard, requirePermission("queue:checkin")] }, async (request, reply) => handled(reply, async () => {
    const item = await queue.getEntry(request.tenant!.tenantId, request.params.id);
    const canManage = hasPermission(request.auth!.roles, "queue:manage") || hasPermission(request.auth!.roles, "queue:serve");
    if (!canManage && item.customer.userId !== request.auth!.userId) return reply.code(403).send({ error: "You cannot cancel another user's queue entry" });
    const reason = isRecord(request.body) && typeof request.body.reason === "string" ? request.body.reason : undefined;
    return reply.send((await queue.cancel({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, reason })).toJSON());
  }));

  app.post<{ Params: { id: string } }>("/queue/entries/:id/priority", { preHandler: [moduleGuard, requirePermission("queue:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const nextPriority = priority(body.priority);
    if (!nextPriority) throw new QueueValidationError("priority must be STANDARD, PRIORITY or URGENT");
    return reply.send((await queue.adjustPriority({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, priority: nextPriority, adjustment: typeof body.adjustment === "number" ? body.adjustment : undefined })).toJSON());
  }));

  app.post<{ Params: { id: string } }>("/queue/entries/:id/transfer", { preHandler: [moduleGuard, requirePermission("queue:serve")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.branchId !== "string" || typeof body.serviceId !== "string") throw new QueueValidationError("branchId and serviceId are required");
    const result = await queue.transfer({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, branchId: body.branchId, serviceId: body.serviceId, departmentId: optionalString(body.departmentId), stationId: optionalString(body.stationId) });
    return reply.send({ from: result.from.toJSON(), to: result.to.toJSON() });
  }));

  app.get("/queue/events", { preHandler: [moduleGuard, requirePermission("queue:view")] }, async (request, reply) => handled(reply, async () => {
    const query = request.query as { afterSequence?: string; branchId?: string; serviceId?: string; limit?: string };
    const afterSequence = query.afterSequence ? Number(query.afterSequence) : 0;
    const limit = query.limit ? Number(query.limit) : undefined;
    if (!Number.isInteger(afterSequence) || afterSequence < 0) throw new QueueValidationError("afterSequence must be a non-negative integer");
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw new QueueValidationError("limit must be a positive integer");
    return reply.send(await queue.eventsAfter(request.tenant!.tenantId, afterSequence, { branchId: query.branchId, serviceId: query.serviceId, limit }));
  }));

  app.get<{ Params: { id: string } }>("/queue/entries/:id/events", { preHandler: [moduleGuard, requirePermission("queue:serve")] }, async (request, reply) => handled(reply, async () =>
    reply.send(await queue.eventsForEntry(request.tenant!.tenantId, request.params.id))));
}
