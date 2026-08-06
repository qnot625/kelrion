import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { DuplicateTenantSlugError } from "@adminops/tenancy";
import { isModuleKey, type BillingCycle, type ControlPlaneService, type ModuleKey, type SupportedCurrency } from "@adminops/control-plane";

interface CreateTenantBody {
  name?: unknown;
  slug?: unknown;
  enabledModules?: unknown;
  billingCycle?: unknown;
  currency?: unknown;
  trialDays?: unknown;
}

function parseModules(value: unknown): ModuleKey[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !isModuleKey(item))) return undefined;
  return value as ModuleKey[];
}

export function registerTenantRoutes(app: FastifyInstance, controlPlane: ControlPlaneService, auditLog: AuditLog): void {
  app.post("/tenants", async (request, reply) => {
    const body = request.body as CreateTenantBody;
    if (typeof body?.name !== "string" || typeof body?.slug !== "string") {
      return reply.code(400).send({ error: "name and slug are required strings" });
    }
    const enabledModules = parseModules(body.enabledModules);
    if (body.enabledModules !== undefined && !enabledModules) return reply.code(400).send({ error: "Invalid enabledModules" });
    if (body.billingCycle !== undefined && body.billingCycle !== "monthly" && body.billingCycle !== "annual") {
      return reply.code(400).send({ error: "Invalid billingCycle" });
    }
    if (body.currency !== undefined && !["NGN", "USD", "GBP", "EUR"].includes(String(body.currency))) {
      return reply.code(400).send({ error: "Invalid currency" });
    }
    try {
      const { tenant, subscription } = await controlPlane.provisionTenant({
        name: body.name,
        slug: body.slug,
        enabledModules,
        billingCycle: body.billingCycle as BillingCycle | undefined,
        currency: body.currency as SupportedCurrency | undefined,
        trialDays: typeof body.trialDays === "number" ? body.trialDays : undefined,
      });
      await auditLog.record({
        tenantId: tenant.id,
        actorUserId: null,
        action: "tenant.created",
        targetType: "tenant",
        targetId: tenant.id,
        metadata: { name: tenant.name, slug: tenant.slug, modules: subscription.enabledModules },
      });
      return reply.code(201).send(tenant);
    } catch (error) {
      if (error instanceof DuplicateTenantSlugError) return reply.code(409).send({ error: error.message });
      if (error instanceof Error) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });
}
