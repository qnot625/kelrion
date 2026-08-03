import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  NotificationService,
  NotificationChannel,
  NotificationStatus,
  UserContext,
  UserRole,
  TenantId,
  UnauthorizedError,
  TenantMismatchError,
  NotificationNotFoundError,
  InvalidNotificationDataError,
  InvalidNotificationStateError,
  InvalidTemplateError,
  MissingTemplateVariableError,
  UnsupportedChannelError,
} from "@klerion/notifications";

export interface NotificationRoutesOptions {
  notificationService: NotificationService;
}

export function getUserContext(req: FastifyRequest): UserContext {
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

const sendTestNotificationSchema = z.object({
  recipient: z.string().min(1, "Recipient is required"),
  channel: z.enum(["email", "sms", "EMAIL", "SMS"]),
  templateId: z.string().optional(),
  variables: z.record(z.string(), z.unknown()).optional(),
});

const getNotificationsQuerySchema = z.object({
  status: z.string().optional(),
  recipient: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function notificationRoutes(
  server: FastifyInstance,
  options: NotificationRoutesOptions
) {
  const { notificationService } = options;

  // Register default test templates on the service's template engine
  const engine = notificationService.getTemplateEngine();
  try {
    engine.registerTemplate({
      id: "test_email_template",
      channel: NotificationChannel.EMAIL,
      subject: "Test Notification: {{ name }}",
      body: "Hello {{ name }}, this is a test email notification sent at {{ time }}.",
    });
  } catch {
    // Already registered or ignored
  }

  try {
    engine.registerTemplate({
      id: "test_sms_template",
      channel: NotificationChannel.SMS,
      subject: "Test SMS",
      body: "Hello {{ name }}, test SMS notification sent at {{ time }}.",
    });
  } catch {
    // Already registered or ignored
  }

  // Error handler wrapper helper
  const handleError = (error: unknown, reply: FastifyReply) => {
    if (error instanceof UnauthorizedError) {
      return reply.status(401).send({ error: error.name, message: error.message });
    }
    if (error instanceof TenantMismatchError) {
      return reply.status(403).send({ error: error.name, message: error.message });
    }
    if (error instanceof NotificationNotFoundError) {
      return reply.status(404).send({ error: error.name, message: error.message });
    }
    if (
      error instanceof InvalidNotificationDataError ||
      error instanceof InvalidNotificationStateError ||
      error instanceof InvalidTemplateError ||
      error instanceof MissingTemplateVariableError ||
      error instanceof UnsupportedChannelError ||
      error instanceof z.ZodError
    ) {
      return reply.status(400).send({
        error: (error as any).name || "ValidationError",
        message: error.message,
      });
    }

    server.log.error(error);
    return reply.status(500).send({
      error: "InternalServerError",
      message: error instanceof Error ? error.message : "An unexpected error occurred",
    });
  };

  // GET /api/notifications
  server.get("/api/notifications", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const query = getNotificationsQuerySchema.parse(req.query);

      let parsedStatus: NotificationStatus | undefined = undefined;
      if (query.status) {
        parsedStatus = query.status.toLowerCase() as NotificationStatus;
      }

      const { notifications, total } = await notificationService.getNotifications(userContext, {
        status: parsedStatus,
        recipient: query.recipient,
        limit: query.limit,
        offset: query.offset,
      });

      return reply.status(200).send({
        data: notifications,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          total,
        },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // POST /api/notifications/test
  server.post("/api/notifications/test", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const body = sendTestNotificationSchema.parse(req.body);

      const channel = body.channel.toLowerCase() as NotificationChannel;
      const defaultTemplateId =
        channel === NotificationChannel.SMS ? "test_sms_template" : "test_email_template";

      const templateId = body.templateId || defaultTemplateId;

      const variables = {
        name: "Test User",
        time: new Date().toISOString(),
        ...(body.variables || {}),
      };

      const result = await notificationService.sendNotification(
        {
          recipient: body.recipient,
          channel,
          templateId,
          variables,
        },
        userContext
      );

      const statusCode = result.success ? 200 : 400;
      return reply.status(statusCode).send(result);
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // POST /api/notifications/:id/retry
  server.post("/api/notifications/:id/retry", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userContext = getUserContext(req);
      const { id } = req.params as { id: string };

      const result = await notificationService.retryNotification(id, userContext);
      const statusCode = result.success ? 200 : 400;
      return reply.status(statusCode).send(result);
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
