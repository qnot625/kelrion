import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
  type Appointment,
  type AppointmentService,
} from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";

interface BookAppointmentBody {
  customerEmail?: unknown;
  serviceName?: unknown;
  startAt?: unknown;
  endAt?: unknown;
}

function handleDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (
    error instanceof InvalidAppointmentWindowError ||
    error instanceof InvalidAppointmentTransitionError
  ) {
    return { status: 400, body: { error: error.message } };
  }
  if (error instanceof AppointmentNotFoundError) {
    return { status: 404, body: { error: error.message } };
  }
  return undefined;
}

export function registerAppointmentRoutes(
  app: FastifyInstance,
  appointments: AppointmentService,
  auditLog: AuditLog,
): void {
  function recordAppointmentEvent(
    request: { tenant?: { tenantId: string }; auth?: { userId: string } },
    action: string,
    appointment: Appointment,
  ) {
    return auditLog.record({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth?.userId ?? null,
      action,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: { status: appointment.status },
    });
  }

  app.post(
    "/appointments",
    { preHandler: requirePermission("appointments:book") },
    async (request, reply) => {
      const body = request.body as BookAppointmentBody;
      if (
        typeof body?.customerEmail !== "string" ||
        typeof body?.serviceName !== "string" ||
        typeof body?.startAt !== "string" ||
        typeof body?.endAt !== "string"
      ) {
        return reply
          .code(400)
          .send({ error: "customerEmail, serviceName, startAt and endAt are required" });
      }

      try {
        const appointment = await appointments.book({
          tenantId: request.tenant!.tenantId,
          customerEmail: body.customerEmail,
          serviceName: body.serviceName,
          startAt: new Date(body.startAt),
          endAt: new Date(body.endAt),
        });
        await recordAppointmentEvent(request, "appointment.booked", appointment);
        return reply.code(201).send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/appointments/:id/check-in",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      try {
        const appointment = await appointments.checkIn(request.tenant!.tenantId, request.params.id);
        await recordAppointmentEvent(request, "appointment.checked_in", appointment);
        return reply.send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/appointments/:id/complete",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      try {
        const appointment = await appointments.complete(request.tenant!.tenantId, request.params.id);
        await recordAppointmentEvent(request, "appointment.completed", appointment);
        return reply.send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.get(
    "/appointments",
    { preHandler: requirePermission("appointments:view") },
    async (request, reply) => {
      const list = await appointments.list(request.tenant!.tenantId);
      return reply.send(list);
    },
  );
}
