import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerModuleEntitlementGuard } from "./plugins/module-entitlement-guard.js";
import { registerPlatformAdminGuard } from "./plugins/platform-admin-guard.js";
import { registerTenantContext } from "./plugins/tenant-context.js";
import { registerAppointmentRoutes } from "./routes/appointments.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerControlPlanePublicRoutes } from "./routes/control-plane-public.js";
import { registerCustomerIntelligenceRoutes } from "./routes/customer-intelligence.js";
import { registerEntitlementRoutes } from "./routes/entitlements.js";
import { registerPlatformAdminRoutes } from "./routes/platform-admin.js";
import { registerTenantRoutes } from "./routes/tenants.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerWorkforceLifecycleRoutes } from "./routes/workforce-lifecycle.js";

export function buildServer(context: AppContext): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));

  registerControlPlanePublicRoutes(
    app,
    context.controlPlaneService,
    context.authService,
    context.platformAdminAuthService,
    context.auditLog,
  );
  registerTenantRoutes(app, context.controlPlaneService, context.auditLog);

  app.register(async (platformScope) => {
    registerPlatformAdminGuard(platformScope, context.platformAdminAuthService);
    registerPlatformAdminRoutes(platformScope, context.controlPlaneService);
  });

  app.register(async (tenantScope) => {
    registerTenantContext(tenantScope, context.tenantRepository);
    registerAuthRoutes(tenantScope, context.authService, context.auditLog);

    tenantScope.register(async (protectedScope) => {
      registerAuthGuard(protectedScope, context.authService);
      registerEntitlementRoutes(protectedScope, context.controlPlaneService, context.tenantRepository);
      registerAuditRoutes(protectedScope, context.auditLog);
      registerUserRoutes(protectedScope, context.userRepository, context.auditLog);

      protectedScope.register(async (appointmentsScope) => {
        registerModuleEntitlementGuard(appointmentsScope, context.controlPlaneService, "appointments");
        registerAppointmentRoutes(appointmentsScope, context.appointmentService, context.auditLog);
      });

      registerWorkforceLifecycleRoutes(
        protectedScope,
        context.workforceLifecycleService,
        context.controlPlaneService,
        context.auditLog,
      );
      registerCustomerIntelligenceRoutes(
        protectedScope,
        context.customerCaseService,
        context.executiveSummaryService,
        context.controlPlaneService,
        context.auditLog,
      );
    });
  });

  return app;
}
