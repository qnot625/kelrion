import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import { registerSecurityPlugin } from "./plugins/security.js";
import { authRoutes } from "./routes/auth.js";
import { formsRoutes } from "./routes/forms.js";
import { workflowsRoutes } from "./routes/workflows.js";
import { approvalsRoutes } from "./routes/approvals.js";
import { requestsRoutes } from "./routes/requests.js";
import { serviceDeskRoutes } from "./routes/service-desk.js";

export function createServer() {
  const app = Fastify({ logger: false });

  // 1. Register Fastify Cookie Parser
  app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || "klerion-adminops-cookie-secret-key-2026",
  });

  // 2. Register Security Plugin (Helmet, Security Headers, Rate Limiter, Global Error Handler)
  app.register(registerSecurityPlugin);

  app.get("/health", async () => {
    return { status: "Healthy", system: "Klerion AdminOps OS API" };
  });

  app.get("/api/health", async () => {
    return { status: "Healthy", system: "Klerion AdminOps OS API" };
  });

  // 3. Register Domain API Routes
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(formsRoutes, { prefix: "/api/forms" });
  app.register(workflowsRoutes, { prefix: "/api/workflows" });
  app.register(approvalsRoutes, { prefix: "/api/approvals" });
  app.register(requestsRoutes, { prefix: "/api/requests" });
  app.register(serviceDeskRoutes, { prefix: "/api/service-desk" });

  return app;
}
