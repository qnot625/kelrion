import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  AppointmentConfigurationError,
  InvalidAppointmentWindowError,
  WaitlistEntryNotFoundError,
  type AppointmentService,
  type WaitlistEntry,
} from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";

interface WaitlistBody {
  customerEmail?: unknown;
  branchId?: unknown;
  serviceId?: unknown;
  customerMetadata?: unknown;
  desiredStartAt?: unknown;
  desiredEndAt?: unknown;
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseBody(body: WaitlistBody) {
  const desiredStartAt = parseDate(body.desiredStartAt);
  const desiredEndAt = parseDate(body.desiredEndAt);
  const metadata = body.customerMetadata === undefined ? {} : body.customerMetadata;
  if (
    typeof body.customerEmail !== "string" ||
    typeof body.branchId !== "string" ||
    typeof body.serviceId !== "string" ||
    desiredStartAt === undefined || desiredEndAt === undefined ||
    !metadata || typeof metadata !== "object" || Array.isArray(metadata)
  ) return undefined;
  if ((desiredStartAt === null) !== (desiredEndAt === null)) return undefined;
  return {
    customerEmail: body.customerEmail,
    branchId: body.branchId,
    serviceId: body.serviceId,
    customerMetadata: metadata as Record<string, unknown>,
    desiredStartAt: desiredStartAt ?? undefined,
    desiredEndAt: desiredEndAt ?? undefined,
  };
}

function metadata(entry: WaitlistEntry): Record<string, unknown> {
  return {
    branchId: entry.branchId,
    serviceId: entry.serviceId,
    queuePosition: entry.queuePosition,
    status: entry.status,
  };
}

function handle(error: unknown) {
  if (error instanceof WaitlistEntryNotFoundError) return { status: 404, error: error.message };
  if (error instanceof AppointmentConfigurationError || error instanceof InvalidAppointmentWindowError) {
    return { status: 400, error: error.message };
  }
  return undefined;
}

async function add(
  request: { body: unknown; tenant?: { tenantId: string }; auth?: { userId: string } },
  appointments: AppointmentService,
  auditLog: AuditLog,
  action: string,
) {
  const parsed = parseBody(request.body as WaitlistBody);
  if (!parsed) return { status: 400, payload: { error: "customerEmail, branchId and serviceId are required; desired dates must be supplied together" } };
  try {
    const entry = await appointments.addToWaitlist({ tenantId: request.tenant!.tenantId, ...parsed });
    await auditLog.record({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth?.userId ?? null,
      action,
      targetType: "appointment_waitlist",
      targetId: entry.id,
      metadata: metadata(entry),
    });
    return { status: 201, payload: entry };
  } catch (error) {
    const handled = handle(error);
    if (handled) return { status: handled.status, payload: { error: handled.error } };
    throw error;
  }
}

export function registerPublicWaitlistRoutes(
  app: FastifyInstance,
  appointments: AppointmentService,
  auditLog: AuditLog,
): void {
  app.post("/public/waitlists", async (request, reply) => {
    const result = await add(request, appointments, auditLog, "appointment_waitlist.public_joined");
    return reply.code(result.status).send(result.payload);
  });
}

export function registerWaitlistRoutes(
  app: FastifyInstance,
  appointments: AppointmentService,
  auditLog: AuditLog,
): void {
  app.get("/waitlists", { preHandler: requirePermission("appointments:view") }, async (request, reply) => {
    return reply.send(await appointments.listWaitlist(request.tenant!.tenantId));
  });

  app.post("/waitlists", { preHandler: requirePermission("appointments:book") }, async (request, reply) => {
    const result = await add(request, appointments, auditLog, "appointment_waitlist.joined");
    return reply.code(result.status).send(result.payload);
  });

  app.delete<{ Params: { id: string } }>(
    "/waitlists/:id",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      try {
        const entry = await appointments.removeFromWaitlist(request.tenant!.tenantId, request.params.id);
        await auditLog.record({
          tenantId: request.tenant!.tenantId,
          actorUserId: request.auth!.userId,
          action: "appointment_waitlist.removed",
          targetType: "appointment_waitlist",
          targetId: entry.id,
          metadata: metadata(entry),
        });
        return reply.send(entry);
      } catch (error) {
        const handled = handle(error);
        if (handled) return reply.code(handled.status).send({ error: handled.error });
        throw error;
      }
    },
  );
}
