import type { FastifyInstance } from "fastify";
import { DuplicateTenantSlugError, type TenantRepository } from "@adminops/tenancy";

interface CreateTenantBody {
  name?: unknown;
  slug?: unknown;
}

export function registerTenantRoutes(app: FastifyInstance, tenantRepository: TenantRepository): void {
  app.post("/tenants", async (request, reply) => {
    const body = request.body as CreateTenantBody;
    if (typeof body?.name !== "string" || typeof body?.slug !== "string") {
      return reply.code(400).send({ error: "name and slug are required strings" });
    }

    try {
      const tenant = await tenantRepository.create({ name: body.name, slug: body.slug });
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
