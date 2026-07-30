import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerTenantContext } from "./plugins/tenant-context.js";
import { registerAppointmentRoutes } from "./routes/appointments.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTenantRoutes } from "./routes/tenants.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerWorkforceLifecycleRoutes } from "./routes/workforce-lifecycle.js";

export function buildServer(context: AppContext): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  registerTenantRoutes(app, context.tenantRepository, context.auditLog);

  app.register(async (tenantScope) => {
    registerTenantContext(tenantScope, context.tenantRepository);
    registerAuthRoutes(tenantScope, context.authService, context.auditLog);

    tenantScope.register(async (protectedScope) => {
      registerAuthGuard(protectedScope, context.authService);
      registerAppointmentRoutes(protectedScope, context.appointmentService, context.auditLog);
      registerAuditRoutes(protectedScope, context.auditLog);
      registerUserRoutes(protectedScope, context.userRepository, context.auditLog);
      registerWorkforceLifecycleRoutes(
        protectedScope,
        context.workforceLifecycleService,
        context.auditLog,
      );
    });
  });

  return app;
}
