import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PlatformAdminAuthService, PlatformAdminRole } from "@adminops/control-plane";

export function registerPlatformAdminGuard(app: FastifyInstance, authService: PlatformAdminAuthService): void {
  app.addHook("onRequest", async (request, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      await reply.code(401).send({ error: "Missing platform administrator bearer token" });
      return;
    }
    try {
      request.platformAuth = await authService.verifyToken(token);
    } catch {
      await reply.code(401).send({ error: "Invalid or expired platform administrator token" });
    }
  });
}

export function requirePlatformRole(role: PlatformAdminRole) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.platformAuth?.roles.includes(role) && !request.platformAuth?.roles.includes("god_admin")) {
      await reply.code(403).send({ error: `Missing required platform role: ${role}` });
    }
  };
}
