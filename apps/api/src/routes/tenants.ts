import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { DuplicateTenantSlugError, type TenantRepository } from "@adminops/tenancy";

interface CreateTenantBody {
  name?: unknown;
  slug?: unknown;
}

export function registerTenantRoutes(
  app: FastifyInstance,
  tenantRepository: TenantRepository,
  auditLog: AuditLog,
): void {
  app.post("/tenants", async (request, reply) => {
    const body = request.body as CreateTenantBody;
    if (typeof body?.name !== "string" || typeof body?.slug !== "string") {
      return reply.code(400).send({ error: "name and slug are required strings" });
    }

    try {
      const tenant = await tenantRepository.create({ name: body.name, slug: body.slug });
      await auditLog.record({
        tenantId: tenant.id,
        actorUserId: null,
        action: "tenant.created",
        targetType: "tenant",
        targetId: tenant.id,
        metadata: { name: tenant.name, slug: tenant.slug },
      });
      return reply.code(201).send(tenant);
    } catch (error) {
      if (error instanceof DuplicateTenantSlugError) {
        return reply.code(409).send({ error: error.message });
      }
      if (error instanceof Error) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });
}
