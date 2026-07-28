import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.js";
import { registerAuthGuard } from "./plugins/auth-guard.js";
import { registerTenantContext } from "./plugins/tenant-context.js";
import { registerAppointmentRoutes } from "./routes/appointments.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerTenantRoutes } from "./routes/tenants.js";

export function buildServer(context: AppContext): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  registerTenantRoutes(app, context.tenantRepository);

  app.register(async (tenantScope) => {
    registerTenantContext(tenantScope, context.tenantRepository);
    registerAuthRoutes(tenantScope, context.authService);

    tenantScope.register(async (protectedScope) => {
      registerAuthGuard(protectedScope, context.authService);
      registerAppointmentRoutes(protectedScope, context.appointmentService);
    });
  });

  return app;
}
