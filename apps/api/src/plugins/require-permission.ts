import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type Permission } from "@adminops/identity";

/** Route-level preHandler; must run after registerAuthGuard so request.auth is set. */
export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.auth || !hasPermission(request.auth.roles, permission)) {
      await reply.code(403).send({ error: `Missing required permission: ${permission}` });
    }
  };
}
