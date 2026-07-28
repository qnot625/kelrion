import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { requirePermission } from "../plugins/require-permission.js";

export function registerAuditRoutes(app: FastifyInstance, auditLog: AuditLog): void {
  app.get(
    "/audit-events",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      const events = await auditLog.listByTenant(request.tenant!.tenantId);
      return reply.send(events);
    },
  );
}
