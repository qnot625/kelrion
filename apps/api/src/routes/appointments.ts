import type { FastifyInstance } from "fastify";
import {
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
  type AppointmentService,
} from "@adminops/branch-flow";

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

export function registerAppointmentRoutes(app: FastifyInstance, appointments: AppointmentService): void {
  app.post("/appointments", async (request, reply) => {
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
      return reply.code(201).send(appointment);
    } catch (error) {
      const handled = handleDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/check-in", async (request, reply) => {
    try {
      const appointment = await appointments.checkIn(request.tenant!.tenantId, request.params.id);
      return reply.send(appointment);
    } catch (error) {
      const handled = handleDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.post<{ Params: { id: string } }>("/appointments/:id/complete", async (request, reply) => {
    try {
      const appointment = await appointments.complete(request.tenant!.tenantId, request.params.id);
      return reply.send(appointment);
    } catch (error) {
      const handled = handleDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.get("/appointments", async (request, reply) => {
    const list = await appointments.list(request.tenant!.tenantId);
    return reply.send(list);
  });
}
