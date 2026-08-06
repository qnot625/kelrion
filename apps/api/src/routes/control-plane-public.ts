import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import type { AuthService } from "@adminops/identity";
import {
  InvalidPlatformAdminCredentialsError,
  PlatformAdminBootstrapClosedError,
  isModuleKey,
  type BillingCycle,
  type ControlPlaneService,
  type ModuleKey,
  type PlatformAdminAuthService,
  type SupportedCurrency,
} from "@adminops/control-plane";

function parseModules(value: unknown): ModuleKey[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !isModuleKey(item))) return undefined;
  return value as ModuleKey[];
}

function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "annual";
}

function isCurrency(value: unknown): value is SupportedCurrency {
  return value === "NGN" || value === "USD" || value === "GBP" || value === "EUR";
}

export function registerControlPlanePublicRoutes(
  app: FastifyInstance,
  service: ControlPlaneService,
  authService: AuthService,
  platformAdminAuth: PlatformAdminAuthService,
  auditLog: AuditLog,
): void {
  app.get("/module-catalogue", async () => service.listModules());

  app.post("/organisations/signup", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const modules = parseModules(body.enabledModules);
    if (
      typeof body.name !== "string" || typeof body.slug !== "string" ||
      typeof body.ownerEmail !== "string" || typeof body.ownerPassword !== "string" || !modules
    ) return reply.code(400).send({ error: "name, slug, ownerEmail, ownerPassword and enabledModules are required" });
    if (body.billingCycle !== undefined && !isBillingCycle(body.billingCycle)) return reply.code(400).send({ error: "Invalid billingCycle" });
    if (body.currency !== undefined && !isCurrency(body.currency)) return reply.code(400).send({ error: "Invalid currency" });
    try {
      const result = await service.selfServiceSignUp(authService, {
        name: body.name,
        slug: body.slug,
        ownerEmail: body.ownerEmail,
        ownerPassword: body.ownerPassword,
        enabledModules: modules,
        billingCycle: body.billingCycle as BillingCycle | undefined,
        currency: body.currency as SupportedCurrency | undefined,
        trialDays: typeof body.trialDays === "number" ? body.trialDays : 14,
      });
      await auditLog.record({
        tenantId: result.tenant.id,
        actorUserId: result.auth.userId,
        action: "organisation.self_service_created",
        targetType: "tenant",
        targetId: result.tenant.id,
        metadata: { modules: result.subscription.enabledModules, billingCycle: result.subscription.billingCycle },
      });
      return reply.code(201).send({
        tenant: result.tenant,
        subscription: result.subscription,
        userId: result.auth.userId,
        token: result.auth.token,
      });
    } catch (error) {
      if (error instanceof Error) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  app.post("/platform/auth/bootstrap", async (request, reply) => {
    const configuredKey = process.env.PLATFORM_BOOTSTRAP_KEY;
    if (!configuredKey && process.env.NODE_ENV === "production") {
      return reply.code(503).send({ error: "PLATFORM_BOOTSTRAP_KEY is required in production" });
    }
    if (configuredKey && request.headers["x-platform-bootstrap-key"] !== configuredKey) {
      return reply.code(403).send({ error: "Invalid platform bootstrap key" });
    }
    const body = request.body as { email?: unknown; password?: unknown };
    if (typeof body?.email !== "string" || typeof body.password !== "string") {
      return reply.code(400).send({ error: "email and password are required strings" });
    }
    try {
      return reply.code(201).send(await platformAdminAuth.bootstrap(body.email, body.password));
    } catch (error) {
      if (error instanceof PlatformAdminBootstrapClosedError) return reply.code(409).send({ error: error.message });
      if (error instanceof Error) return reply.code(400).send({ error: error.message });
      throw error;
    }
  });

  app.post("/platform/auth/login", async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown };
    if (typeof body?.email !== "string" || typeof body.password !== "string") {
      return reply.code(400).send({ error: "email and password are required strings" });
    }
    try {
      return reply.send(await platformAdminAuth.login(body.email, body.password));
    } catch (error) {
      if (error instanceof InvalidPlatformAdminCredentialsError) return reply.code(401).send({ error: error.message });
      throw error;
    }
  });
}
