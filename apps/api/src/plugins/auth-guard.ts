import type { FastifyInstance } from "fastify";
import type { AuthService } from "@adminops/identity";

/**
 * Verifies the bearer session token and confirms it was issued for the
 * tenant already resolved by the tenant-context hook, so a token minted
 * under one tenant slug can never authorize a request against another.
 */
export function registerAuthGuard(app: FastifyInstance, authService: AuthService): void {
  app.addHook("onRequest", async (request, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      await reply.code(401).send({ error: "Missing Authorization bearer token" });
      return;
    }

    try {
      const claims = await authService.verifyToken(token);
      if (claims.tenantId !== request.tenant?.tenantId) {
        await reply.code(401).send({ error: "Token does not match the requested tenant" });
        return;
      }
      request.auth = claims;
    } catch {
      await reply.code(401).send({ error: "Invalid or expired session token" });
    }
  });
}
