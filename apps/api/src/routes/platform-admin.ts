import type { FastifyInstance } from "fastify";
import {
  isModuleKey,
  type BillingCycle,
  type ControlPlaneService,
  type ModuleKey,
  type SubscriptionStatus,
  type SupportedCurrency,
} from "@adminops/control-plane";
import type { TenantStatus } from "@adminops/tenancy";
import { requirePlatformRole } from "../plugins/platform-admin-guard.js";

const TENANT_STATUSES = new Set<TenantStatus>(["provisioning", "active", "suspended"]);
const SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>(["trialing", "active", "past_due", "suspended", "cancelled"]);

function modules(value: unknown): ModuleKey[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && isModuleKey(item)) ? value as ModuleKey[] : undefined;
}
function billingCycle(value: unknown): value is BillingCycle { return value === "monthly" || value === "annual"; }
function currency(value: unknown): value is SupportedCurrency { return value === "NGN" || value === "USD" || value === "GBP" || value === "EUR"; }

export function registerPlatformAdminRoutes(app: FastifyInstance, service: ControlPlaneService): void {
  app.get("/platform/modules", async () => service.listModules());

  app.get("/platform/organisations", async () => service.listOrganisations());

  app.post("/platform/organisations", { preHandler: requirePlatformRole("god_admin") }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const enabledModules = modules(body.enabledModules);
    if (
      typeof body.name !== "string" || typeof body.slug !== "string" ||
      typeof body.ownerEmail !== "string" || typeof body.ownerPassword !== "string" || !enabledModules
    ) return reply.code(400).send({ error: "name, slug, ownerEmail, ownerPassword and enabledModules are required" });
    if (body.billingCycle !== undefined && !billingCycle(body.billingCycle)) return reply.code(400).send({ error: "Invalid billingCycle" });
    if (body.currency !== undefined && !currency(body.currency)) return reply.code(400).send({ error: "Invalid currency" });
    try {
      return reply.code(201).send(await service.createOrganisation({
        name: body.name,
        slug: body.slug,
        ownerEmail: body.ownerEmail,
        ownerPassword: body.ownerPassword,
        enabledModules,
        billingCycle: body.billingCycle as BillingCycle | undefined,
        currency: body.currency as SupportedCurrency | undefined,
        trialDays: typeof body.trialDays === "number" ? body.trialDays : 14,
      }));
    } catch (error) {
      if (error instanceof Error) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  app.patch<{ Params: { tenantId: string } }>("/platform/organisations/:tenantId/status", { preHandler: requirePlatformRole("god_admin") }, async (request, reply) => {
    const body = request.body as { status?: unknown };
    if (typeof body?.status !== "string" || !TENANT_STATUSES.has(body.status as TenantStatus)) {
      return reply.code(400).send({ error: "Invalid organisation status" });
    }
    const updated = await service.updateOrganisationStatus(request.params.tenantId, body.status as TenantStatus);
    return updated ? reply.send(updated) : reply.code(404).send({ error: "Organisation not found" });
  });

  app.patch<{ Params: { tenantId: string } }>("/platform/organisations/:tenantId/subscription", { preHandler: requirePlatformRole("billing_admin") }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const enabledModules = body.enabledModules === undefined ? undefined : modules(body.enabledModules);
    if (body.enabledModules !== undefined && !enabledModules) return reply.code(400).send({ error: "Invalid enabledModules" });
    if (body.billingCycle !== undefined && !billingCycle(body.billingCycle)) return reply.code(400).send({ error: "Invalid billingCycle" });
    if (body.currency !== undefined && !currency(body.currency)) return reply.code(400).send({ error: "Invalid currency" });
    if (body.status !== undefined && (typeof body.status !== "string" || !SUBSCRIPTION_STATUSES.has(body.status as SubscriptionStatus))) {
      return reply.code(400).send({ error: "Invalid subscription status" });
    }
    try {
      return reply.send(await service.updateSubscription(request.params.tenantId, {
        enabledModules,
        billingCycle: body.billingCycle as BillingCycle | undefined,
        currency: body.currency as SupportedCurrency | undefined,
        status: body.status as SubscriptionStatus | undefined,
      }));
    } catch (error) {
      if (error instanceof Error && error.message === "Subscription not found") return reply.code(404).send({ error: error.message });
      throw error;
    }
  });

  app.get("/platform/invoices", { preHandler: requirePlatformRole("billing_admin") }, async (request) => {
    const tenantId = (request.query as { tenantId?: string }).tenantId;
    return service.listInvoices(tenantId);
  });

  app.post<{ Params: { id: string } }>("/platform/invoices/:id/mark-paid", { preHandler: requirePlatformRole("billing_admin") }, async (request, reply) => {
    const body = request.body as { paymentReference?: unknown };
    if (typeof body?.paymentReference !== "string" || !body.paymentReference.trim()) {
      return reply.code(400).send({ error: "paymentReference is required" });
    }
    const invoice = await service.markInvoicePaid(request.params.id, body.paymentReference.trim());
    return invoice ? reply.send(invoice) : reply.code(404).send({ error: "Invoice not found" });
  });
}
