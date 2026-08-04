import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import type { Role, UserRepository } from "@adminops/identity";
import { requirePermission } from "../plugins/require-permission.js";

const ALLOWED_ROLES = new Set<Role>(["owner", "staff", "member"]);

function publicUser(user: Awaited<ReturnType<UserRepository["findById"]>>) {
  if (!user) return undefined;
  return {
    id: user.id,
    email: user.email,
    roles: user.roles,
    createdAt: user.createdAt,
  };
}

export function registerUserRoutes(
  app: FastifyInstance,
  userRepository: UserRepository,
  auditLog: AuditLog,
): void {
  app.get(
    "/users",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      const users = await userRepository.listByTenant(request.tenant!.tenantId);
      return reply.send(users.map(publicUser));
    },
  );

  app.patch<{ Params: { userId: string }; Body: { roles?: string[] } }>(
    "/users/:userId/roles",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      const tenantId = request.tenant!.tenantId;
      const requestedRoles = request.body?.roles;

      if (!Array.isArray(requestedRoles) || requestedRoles.length === 0) {
        return reply.code(400).send({ error: "At least one role is required" });
      }

      const roles = [...new Set(requestedRoles)];
      if (roles.some((role) => !ALLOWED_ROLES.has(role as Role))) {
        return reply.code(400).send({ error: "Roles must be owner, staff, or member" });
      }

      const target = await userRepository.findById(tenantId, request.params.userId);
      if (!target) {
        return reply.code(404).send({ error: "User not found" });
      }

      const removesOwner = target.roles.includes("owner") && !roles.includes("owner");
      if (removesOwner) {
        const users = await userRepository.listByTenant(tenantId);
        const ownerCount = users.filter((user: { roles: readonly string[] }) => user.roles.includes("owner")).length;
        if (ownerCount <= 1) {
          return reply.code(409).send({ error: "The tenant must retain at least one owner" });
        }
      }

      const updated = await userRepository.updateRoles(tenantId, target.id, roles as Role[]);
      await auditLog.record({
        tenantId,
        actorUserId: request.auth!.userId,
        action: "user.roles_updated",
        targetType: "user",
        targetId: target.id,
        metadata: { previousRoles: target.roles, roles },
      });

      return reply.send(publicUser(updated));
    },
  );
}
