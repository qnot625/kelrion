import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  AppointmentConfigurationError,
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
  SlotNotAvailableError,
  type Appointment,
  type AppointmentService,
} from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";

interface BookAppointmentBody {
  customerEmail?: unknown;
  branchId?: unknown;
  serviceId?: unknown;
  serviceName?: unknown;
  customerMetadata?: unknown;
  startAt?: unknown;
  endAt?: unknown;
}

interface AvailabilityQuery {
  branchId?: unknown;
  serviceId?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  slotIntervalMinutes?: unknown;
}

interface RescheduleBody {
  startAt?: unknown;
  endAt?: unknown;
}

function handleDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (
    error instanceof InvalidAppointmentWindowError ||
    error instanceof InvalidAppointmentTransitionError ||
    error instanceof AppointmentConfigurationError
  ) return { status: 400, body: { error: error.message } };
  if (error instanceof SlotNotAvailableError) return { status: 409, body: { error: error.message } };
  if (error instanceof AppointmentNotFoundError) return { status: 404, body: { error: error.message } };
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return {};
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parseBookBody(body: BookAppointmentBody) {
  const startAt = parseDate(body.startAt);
  const endAt = parseDate(body.endAt);
  const customerMetadata = parseMetadata(body.customerMetadata);
  if (typeof body.customerEmail !== "string" || !startAt || !endAt || !customerMetadata) return undefined;
  const branchId = typeof body.branchId === "string" ? body.branchId : undefined;
  const serviceId = typeof body.serviceId === "string" ? body.serviceId : undefined;
  const serviceName = typeof body.serviceName === "string" ? body.serviceName : undefined;
  if ((branchId && !serviceId) || (!branchId && serviceId) || (!branchId && !serviceName)) return undefined;
  return { customerEmail: body.customerEmail, branchId, serviceId, serviceName, customerMetadata, startAt, endAt };
}

function eventMetadata(appointment: Appointment): Record<string, unknown> {
  return {
    status: appointment.status,
    branchId: appointment.branchId,
    serviceId: appointment.serviceId,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
  };
}

async function bookAppointment(
  request: FastifyRequest,
  appointments: AppointmentService,
  auditLog: AuditLog,
  action: string,
) {
  const parsed = parseBookBody(request.body as BookAppointmentBody);
  if (!parsed) return { status: 400, payload: { error: "customerEmail, startAt and endAt are required; provide serviceName or both branchId and serviceId" } };
  try {
    const appointment = await appointments.book({ tenantId: request.tenant!.tenantId, ...parsed });
    await auditLog.record({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth?.userId ?? null,
      action,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: eventMetadata(appointment),
    });
    return { status: 201, payload: appointment };
  } catch (error) {
    const handled = handleDomainError(error);
    if (handled) return { status: handled.status, payload: handled.body };
    throw error;
  }
}

export function registerPublicAppointmentRoutes(
  app: FastifyInstance,
  appointments: AppointmentService,
  auditLog: AuditLog,
): void {
  app.get<{ Querystring: AvailabilityQuery }>("/public/appointments/availability", async (request, reply) => {
    const startAt = parseDate(request.query.startAt);
    const endAt = parseDate(request.query.endAt);
    const interval = request.query.slotIntervalMinutes === undefined
      ? undefined
      : Number(request.query.slotIntervalMinutes);
    if (
      typeof request.query.branchId !== "string" ||
      typeof request.query.serviceId !== "string" ||
      !startAt || !endAt ||
      (interval !== undefined && (!Number.isInteger(interval) || interval < 1 || interval > 480))
    ) return reply.code(400).send({ error: "branchId, serviceId, valid startAt and endAt are required" });
    try {
      return reply.send(await appointments.availability({
        tenantId: request.tenant!.tenantId,
        branchId: request.query.branchId,
        serviceId: request.query.serviceId,
        startAt,
        endAt,
        slotIntervalMinutes: interval,
      }));
    } catch (error) {
      const handled = handleDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.post("/public/appointments", async (request, reply) => {
    const result = await bookAppointment(request, appointments, auditLog, "appointment.public_booked");
    return reply.code(result.status).send(result.payload);
  });
}

export function registerAppointmentRoutes(
  app: FastifyInstance,
  appointments: AppointmentService,
  auditLog: AuditLog,
): void {
  async function record(request: FastifyRequest, action: string, appointment: Appointment) {
    return auditLog.record({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth?.userId ?? null,
      action,
      targetType: "appointment",
      targetId: appointment.id,
      metadata: eventMetadata(appointment),
    });
  }

  app.post("/appointments", { preHandler: requirePermission("appointments:book") }, async (request, reply) => {
    const result = await bookAppointment(request, appointments, auditLog, "appointment.booked");
    return reply.code(result.status).send(result.payload);
  });

  app.patch<{ Params: { id: string }; Body: RescheduleBody }>(
    "/appointments/:id/reschedule",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      const startAt = parseDate(request.body?.startAt);
      const endAt = parseDate(request.body?.endAt);
      if (!startAt || !endAt) return reply.code(400).send({ error: "valid startAt and endAt are required" });
      try {
        const appointment = await appointments.reschedule({
          tenantId: request.tenant!.tenantId,
          appointmentId: request.params.id,
          startAt,
          endAt,
        });
        await record(request, "appointment.rescheduled", appointment);
        return reply.send(appointment);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  const transitions: readonly [string, "checkIn" | "complete" | "cancel" | "noShow", string][] = [
    ["check-in", "checkIn", "appointment.checked_in"],
    ["complete", "complete", "appointment.completed"],
    ["cancel", "cancel", "appointment.cancelled"],
    ["no-show", "noShow", "appointment.no_show"],
  ];
  for (const [path, method, action] of transitions) {
    app.post<{ Params: { id: string } }>(
      `/appointments/:id/${path}`,
      { preHandler: requirePermission("appointments:manage") },
      async (request, reply) => {
        try {
          const appointment = await appointments[method](request.tenant!.tenantId, request.params.id);
          await record(request, action, appointment);
          return reply.send(appointment);
        } catch (error) {
          const handled = handleDomainError(error);
          if (handled) return reply.code(handled.status).send(handled.body);
          throw error;
        }
      },
    );
  }

  app.get("/appointments", { preHandler: requirePermission("appointments:view") }, async (request, reply) => {
    return reply.send(await appointments.list(request.tenant!.tenantId));
  });
}
