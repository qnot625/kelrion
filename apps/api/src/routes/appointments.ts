import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import type { AuthService } from "@adminops/identity";
import {
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
  type Appointment,
  type AppointmentService,
} from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";
import {
  validateBookAppointmentBody,
  validateRescheduleAppointmentBody,
  validateAppointmentIdParams,
  handleAppointmentDomainError,
} from "./appointment-schemas.js";

function handleDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (
    error instanceof InvalidAppointmentWindowError ||
    error instanceof InvalidAppointmentTransitionError ||
    (error as Error).name === "SlotNotAvailableError"
  ) {
    return { status: 400, body: { error: (error as Error).message } };
  }
  if (error instanceof AppointmentNotFoundError) {
    return { status: 404, body: { error: (error as Error).message } };
  }
  return undefined;
}

export function registerPublicAppointmentRoutes(
  app: FastifyInstance,
  appointments: AppointmentService,
  auditLog: AuditLog,
  authService: AuthService,
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
    async (request, reply) => {
      // Optional authentication parsing
      const header = request.headers.authorization;
      const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
      if (token) {
        try {
          const claims = await authService.verifyToken(token);
          if (claims.tenantId === request.tenant?.tenantId) {
            request.auth = claims;
          }
        } catch {
          // Ignore invalid token for public requests
        }
      }

      let body;
      try {
        body = validateBookAppointmentBody(request.body);
      } catch (error) {
        const handled = handleAppointmentDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const appointment = await appointments.book({
          tenantId: request.tenant!.tenantId,
          customerEmail: body.customerEmail,
          branchId: body.branchId,
          serviceId: body.serviceId,
          customerMetadata: (body.customerMetadata as Record<string, unknown>) ?? {},
          startAt: new Date(body.startAt),
          endAt: new Date(body.endAt),
        });
        await recordAppointmentEvent(request, "appointment.booked", appointment);
        return reply.code(201).send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        
        // Handle external not found errors e.g. branch or service not found
        if (error instanceof Error && error.message.includes("not found")) {
          return reply.code(404).send({ error: error.message });
        }
        throw error;
      }
    },
  );
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

  app.put<{ Params: { id: string } }>(
    "/appointments/:id/reschedule",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      let body;
      try {
        body = validateRescheduleAppointmentBody(request.body);
      } catch (error) {
        const handled = handleAppointmentDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const appointment = await appointments.reschedule({
          tenantId: request.tenant!.tenantId,
          appointmentId: request.params.id,
          startAt: new Date(body.startAt),
          endAt: new Date(body.endAt),
        });
        await recordAppointmentEvent(request, "appointment.rescheduled", appointment);
        return reply.send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.put<{ Params: { id: string } }>(
    "/appointments/:id/cancel",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      try {
        const appointment = await appointments.cancel(request.tenant!.tenantId, request.params.id);
        await recordAppointmentEvent(request, "appointment.cancelled", appointment);
        return reply.send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.put<{ Params: { id: string } }>(
    "/appointments/:id/no-show",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      let params;
      try {
        params = validateAppointmentIdParams(request.params);
      } catch (error) {
        const handled = handleAppointmentDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const appointment = await appointments.noShow(request.tenant!.tenantId, params.id);
        await recordAppointmentEvent(request, "appointment.no_show", appointment);
        return reply.send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/appointments/:id",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      try {
        const appointment = await appointments.cancel(request.tenant!.tenantId, request.params.id);
        await recordAppointmentEvent(request, "appointment.cancelled", appointment);
        return reply.send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );
}
