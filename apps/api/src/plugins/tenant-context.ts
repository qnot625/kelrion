import type { FastifyInstance } from "fastify";
import type { TenantRepository } from "@adminops/tenancy";

/**
 * Resolves the tenant from the X-Tenant-Slug header and attaches it to the
 * request. Scoped to whichever Fastify encapsulation context registers it,
 * so platform-level routes (health, tenant creation) stay tenant-free.
 */
export function registerTenantContext(app: FastifyInstance, tenantRepository: TenantRepository): void {
  app.addHook("onRequest", async (request, reply) => {
    const header = request.headers["x-tenant-slug"];
    const slug = Array.isArray(header) ? header[0] : header;
    if (!slug) {
      await reply.code(400).send({ error: "Missing X-Tenant-Slug header" });
      return;
    }

    const tenant = await tenantRepository.findBySlug(slug);
    if (!tenant) {
      await reply.code(404).send({ error: `Unknown tenant "${slug}"` });
      return;
    }
    if (tenant.status !== "active") {
      await reply.code(403).send({ error: `Organisation "${slug}" is ${tenant.status}` });
      return;
    }

    request.tenant = { tenantId: tenant.id, tenantSlug: tenant.slug };
  });
}
