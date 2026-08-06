import type { FastifyInstance } from "fastify";
import type { ControlPlaneService } from "@adminops/control-plane";
import type { TenantRepository } from "@adminops/tenancy";
import { requirePermission } from "../plugins/require-permission.js";

export function registerEntitlementRoutes(
  app: FastifyInstance,
  service: ControlPlaneService,
  tenants: TenantRepository,
): void {
  app.get("/organisation", async (request, reply) => {
    const tenant = await tenants.findById(request.tenant!.tenantId);
    return tenant ? reply.send(tenant) : reply.code(404).send({ error: "Organisation not found" });
  });
  app.get("/entitlements", async (request) => service.getEntitlements(request.tenant!.tenantId));
  app.get("/billing/subscription", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    const subscription = await service.getSubscription(request.tenant!.tenantId);
    return subscription ? reply.send(subscription) : reply.code(404).send({ error: "Subscription not found" });
  });
  app.get("/billing/invoices", { preHandler: requirePermission("tenant:manage") }, async (request) =>
    service.listInvoices(request.tenant!.tenantId));
}
