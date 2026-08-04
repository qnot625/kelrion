import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import type { AppointmentService, WaitlistEntry } from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";
import {
  validateAddToWaitlistBody,
  validateWaitlistIdParams,
  handleWaitlistDomainError,
} from "./waitlist-schemas.js";

function handleDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (error instanceof Error && error.message.includes("not found")) {
    return { status: 404, body: { error: error.message } };
  }
  return undefined;
}

export function registerWaitlistRoutes(
  app: FastifyInstance,
  appointments: AppointmentService,
  auditLog: AuditLog,
): void {
  function recordWaitlistEvent(
    request: { tenant?: { tenantId: string }; auth?: { userId: string } },
    action: string,
    entry: WaitlistEntry,
  ) {
    return auditLog.record({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth?.userId ?? null,
      action,
      targetType: "waitlist",
      targetId: entry.id,
      metadata: { branchId: entry.branchId, serviceId: entry.serviceId },
    });
  }

  app.post(
    "/waitlists",
    { preHandler: requirePermission("appointments:book") },
    async (request, reply) => {
      let body;
      try {
        body = validateAddToWaitlistBody(request.body);
      } catch (error) {
        const handled = handleWaitlistDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const entry = await appointments.addToWaitlist({
          tenantId: request.tenant!.tenantId,
          branchId: body.branchId,
          serviceId: body.serviceId,
          customerEmail: body.customerEmail,
          customerMetadata: body.customerMetadata,
        });
        await recordWaitlistEvent(request, "waitlist.created", entry);
        return reply.code(201).send(entry);
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/waitlists/:id",
    { preHandler: requirePermission("appointments:manage") },
    async (request, reply) => {
      let params;
      try {
        params = validateWaitlistIdParams(request.params);
      } catch (error) {
        const handled = handleWaitlistDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const entry = await appointments.getWaitlistEntry(request.tenant!.tenantId, params.id);
        if (!entry) {
          return reply.code(404).send({ error: `Waitlist entry ${params.id} not found` });
        }
        await appointments.removeFromWaitlist(request.tenant!.tenantId, params.id);
        await recordWaitlistEvent(request, "waitlist.deleted", entry);
        return reply.code(204).send();
      } catch (error) {
        const handled = handleDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.get(
    "/waitlists",
    { preHandler: requirePermission("appointments:view") },
    async (request, reply) => {
      const list = await appointments.listWaitlist(request.tenant!.tenantId);
      return reply.send(list);
    },
  );
}
