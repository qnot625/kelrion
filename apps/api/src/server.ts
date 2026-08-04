import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerTenantContext } from "./plugins/tenant-context.js";
import { registerAppointmentRoutes, registerPublicAppointmentRoutes } from "./routes/appointments.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBranchRoutes, registerPublicBranchRoutes } from "./routes/branches.js";
import { registerServiceRoutes, registerPublicServiceRoutes } from "./routes/services.js";
import { registerTenantRoutes } from "./routes/tenants.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerWaitlistRoutes } from "./routes/waitlists.js";

export function buildServer(context: AppContext): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  registerTenantRoutes(app, context.tenantRepository, context.auditLog);

  app.register(async (tenantScope) => {
    registerTenantContext(tenantScope, context.tenantRepository);
    registerAuthRoutes(tenantScope, context.authService, context.auditLog);
    registerPublicBranchRoutes(tenantScope, context.branchRepository);
    registerPublicAppointmentRoutes(tenantScope, context.appointmentService, context.auditLog, context.authService);
    registerPublicServiceRoutes(tenantScope, context.serviceRepository, context.branchRepository);

    tenantScope.register(async (protectedScope) => {
      registerAuthGuard(protectedScope, context.authService);
      registerAppointmentRoutes(protectedScope, context.appointmentService, context.auditLog);
      registerWaitlistRoutes(protectedScope, context.appointmentService, context.auditLog);
      registerAuditRoutes(protectedScope, context.auditLog);
      registerBranchRoutes(protectedScope, context.branchRepository, context.auditLog);
      registerServiceRoutes(protectedScope, context.serviceRepository, context.branchRepository, context.auditLog);
      registerUserRoutes(protectedScope, context.userRepository, context.auditLog);
    });
  });

  return app;
}
