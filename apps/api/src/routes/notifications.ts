import type { FastifyInstance } from "fastify";
import type { ControlPlaneService } from "@adminops/control-plane";
import type { UserRepository } from "@adminops/identity";
import {
  NotificationNotFoundError,
  type NotificationService,
  NotificationTemplateNotFoundError,
  NotificationValidationError,
  type NotificationChannel,
  type NotificationDeliveryStatus,
  type NotificationProviderMap,
  type NotificationSeverity,
  type NotificationTemplateData,
} from "@adminops/notifications";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";
import { parseSseCursor, startSsePolling } from "../realtime/sse.js";

const CHANNELS = new Set<NotificationChannel>(["IN_APP", "EMAIL", "SMS", "PUSH"]);
const SEVERITIES = new Set<NotificationSeverity>(["INFO", "SUCCESS", "WARNING", "ERROR"]);
const DELIVERY_STATUSES = new Set<NotificationDeliveryStatus>(["PENDING", "SENT", "FAILED", "SKIPPED", "EXHAUSTED"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function optionalString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" ? value.trim() || null : undefined;
}
function number(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}
function domainError(error: unknown) {
  if (error instanceof NotificationNotFoundError || error instanceof NotificationTemplateNotFoundError) return { status: 404, error: error.message };
  if (error instanceof NotificationValidationError) return { status: 400, error: error.message };
  return null;
}
async function handled(reply: { code(status: number): { send(body: unknown): unknown } }, action: () => Promise<unknown>) {
  try { return await action(); }
  catch (error) {
    const mapped = domainError(error);
    if (!mapped) throw error;
    return reply.code(mapped.status).send({ error: mapped.error });
  }
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  notifications: NotificationService,
  users: UserRepository,
  controlPlane: ControlPlaneService,
  providers: NotificationProviderMap,
): void {
  const moduleGuard = requireModule(controlPlane, "notifications");

  app.get("/notifications", { preHandler: [moduleGuard, requirePermission("notifications:view")] }, async (request, reply) => {
    const query = request.query as { afterSequence?: string; limit?: string; unreadOnly?: string };
    const afterSequence = number(query.afterSequence, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = number(query.limit, 100, 1, 500);
    const unreadOnly = query.unreadOnly === "true";
    return reply.send(await notifications.listForUser(request.tenant!.tenantId, request.auth!.userId, { afterSequence, limit, unreadOnly }));
  });

  app.get("/notifications/unread-count", { preHandler: [moduleGuard, requirePermission("notifications:view")] }, async (request, reply) =>
    reply.send({ unread: await notifications.unreadCount(request.tenant!.tenantId, request.auth!.userId) }));

  app.post<{ Params: { id: string } }>("/notifications/:id/read", { preHandler: [moduleGuard, requirePermission("notifications:view")] }, async (request, reply) => handled(reply, async () =>
    reply.send(await notifications.markRead(request.tenant!.tenantId, request.auth!.userId, request.params.id))));

  app.post("/notifications/read-all", { preHandler: [moduleGuard, requirePermission("notifications:view")] }, async (request, reply) =>
    reply.send({ updated: await notifications.markAllRead(request.tenant!.tenantId, request.auth!.userId) }));

  app.get("/notifications/preferences", { preHandler: [moduleGuard, requirePermission("notifications:preferences")] }, async (request, reply) =>
    reply.send(await notifications.getPreferences(request.tenant!.tenantId, request.auth!.userId)));

  app.put("/notifications/preferences", { preHandler: [moduleGuard, requirePermission("notifications:preferences")] }, async (request, reply) => handled(reply, async () => {
    const body = record(request.body);
    return reply.send(await notifications.updatePreferences({
      tenantId: request.tenant!.tenantId,
      userId: request.auth!.userId,
      emailEnabled: typeof body.emailEnabled === "boolean" ? body.emailEnabled : undefined,
      smsEnabled: typeof body.smsEnabled === "boolean" ? body.smsEnabled : undefined,
      pushEnabled: typeof body.pushEnabled === "boolean" ? body.pushEnabled : undefined,
      emailAddress: optionalString(body.emailAddress),
      smsNumber: optionalString(body.smsNumber),
      pushEndpoint: optionalString(body.pushEndpoint),
    }));
  }));

  app.post("/notifications/send", { preHandler: [moduleGuard, requirePermission("notifications:send")] }, async (request, reply) => handled(reply, async () => {
    const body = record(request.body);
    if (typeof body.title !== "string" || typeof body.message !== "string" || typeof body.kind !== "string") {
      throw new NotificationValidationError("kind, title and message are required");
    }
    const recipientUserId = optionalString(body.recipientUserId);
    if (recipientUserId && !(await users.findById(request.tenant!.tenantId, recipientUserId))) {
      throw new NotificationValidationError("The selected recipient is not a user in this organisation");
    }
    const channels = Array.isArray(body.channels)
      ? body.channels.filter((value): value is NotificationChannel => typeof value === "string" && CHANNELS.has(value as NotificationChannel))
      : undefined;
    const severity = typeof body.severity === "string" && SEVERITIES.has(body.severity as NotificationSeverity)
      ? body.severity as NotificationSeverity
      : undefined;
    const destinations = record(body.destinations);
    const created = await notifications.notify({
      tenantId: request.tenant!.tenantId,
      recipientUserId,
      kind: body.kind,
      title: body.title,
      message: body.message,
      severity,
      entityType: optionalString(body.entityType),
      entityId: optionalString(body.entityId),
      data: record(body.data),
      channels,
      usePreferences: body.usePreferences === true,
      destinations: {
        EMAIL: optionalString(destinations.EMAIL),
        SMS: optionalString(destinations.SMS),
        PUSH: optionalString(destinations.PUSH),
      },
      actorUserId: request.auth!.userId,
    });
    return reply.code(201).send(created);
  }));

  app.get("/notifications/templates", { preHandler: [moduleGuard, requirePermission("notifications:manage")] }, async (request, reply) =>
    reply.send(await notifications.listTemplates(request.tenant!.tenantId)));

  app.post("/notifications/templates", { preHandler: [moduleGuard, requirePermission("notifications:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = record(request.body);
    if (typeof body.key !== "string" || typeof body.channel !== "string" || !CHANNELS.has(body.channel as NotificationChannel) || typeof body.titleTemplate !== "string" || typeof body.bodyTemplate !== "string") {
      throw new NotificationValidationError("key, channel, titleTemplate and bodyTemplate are required");
    }
    const template = await notifications.createTemplate({
      tenantId: request.tenant!.tenantId,
      key: body.key,
      channel: body.channel as NotificationTemplateData["channel"],
      titleTemplate: body.titleTemplate,
      bodyTemplate: body.bodyTemplate,
      actorUserId: request.auth!.userId,
    });
    return reply.code(201).send(template);
  }));

  app.patch<{ Params: { id: string } }>("/notifications/templates/:id", { preHandler: [moduleGuard, requirePermission("notifications:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = record(request.body);
    const status = body.status === "ACTIVE" || body.status === "INACTIVE" ? body.status : undefined;
    return reply.send(await notifications.updateTemplate({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      titleTemplate: typeof body.titleTemplate === "string" ? body.titleTemplate : undefined,
      bodyTemplate: typeof body.bodyTemplate === "string" ? body.bodyTemplate : undefined,
      status,
      actorUserId: request.auth!.userId,
    }));
  }));

  app.post("/notifications/templates/send", { preHandler: [moduleGuard, requirePermission("notifications:send")] }, async (request, reply) => handled(reply, async () => {
    const body = record(request.body);
    if (typeof body.key !== "string" || typeof body.channel !== "string" || !CHANNELS.has(body.channel as NotificationChannel)) {
      throw new NotificationValidationError("key and a valid channel are required");
    }
    const recipientUserId = optionalString(body.recipientUserId);
    if (recipientUserId && !(await users.findById(request.tenant!.tenantId, recipientUserId))) {
      throw new NotificationValidationError("The selected recipient is not a user in this organisation");
    }
    const created = await notifications.sendTemplate({
      tenantId: request.tenant!.tenantId,
      key: body.key,
      channel: body.channel as NotificationTemplateData["channel"],
      recipientUserId,
      values: record(body.values),
      destination: optionalString(body.destination),
      actorUserId: request.auth!.userId,
    });
    return reply.code(201).send(created);
  }));

  app.get("/notifications/deliveries", { preHandler: [moduleGuard, requirePermission("notifications:manage")] }, async (request, reply) => {
    const query = request.query as { notificationId?: string; status?: string; limit?: string };
    const status = query.status && DELIVERY_STATUSES.has(query.status as NotificationDeliveryStatus) ? query.status as NotificationDeliveryStatus : undefined;
    return reply.send(await notifications.listDeliveries(request.tenant!.tenantId, {
      notificationId: query.notificationId,
      status,
      limit: number(query.limit, 100, 1, 500),
    }));
  });

  app.post("/notifications/deliveries/process", { preHandler: [moduleGuard, requirePermission("notifications:manage")] }, async (request, reply) => {
    const body = record(request.body);
    const processed = await notifications.processPending(request.tenant!.tenantId, providers, number(body.limit, 50, 1, 200));
    return reply.send({ processed: processed.length, deliveries: processed });
  });

  app.get("/notifications/stream", { preHandler: [moduleGuard, requirePermission("notifications:view")] }, async (request, reply) => {
    const query = request.query as { afterSequence?: string };
    startSsePolling({
      request,
      reply,
      cursor: parseSseCursor(request, query.afterSequence),
      eventName: "notification",
      load: (afterSequence) => notifications.listForUser(request.tenant!.tenantId, request.auth!.userId, { afterSequence, limit: 100 }),
    });
  });
}
