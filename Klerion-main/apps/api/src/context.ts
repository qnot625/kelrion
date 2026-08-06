import type { FastifyRequest, FastifyReply } from "fastify";
import {
  JwtService,
  AuthorizationService,
  ROLE_PERMISSIONS,
  type Role,
  type Permission,
} from "../../../modules/platform/identity/src/index.js";

export interface SecurityContext {
  userId: string;
  tenantId: string;
  role: Role;
  permissions: Permission[];
  sessionId?: string;
  isAuthenticated: boolean;
}

/**
 * Derives authenticated security context from JWT Bearer token or fallback headers.
 */
export function getSecurityContext(req: FastifyRequest): SecurityContext {
  const authHeader = req.headers["authorization"];
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }

  if (token) {
    try {
      const payload = JwtService.verifyAccessToken(token);
      return {
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        permissions: payload.permissions || ROLE_PERMISSIONS[payload.role] || [],
        sessionId: payload.sessionId,
        isAuthenticated: true,
      };
    } catch {
      // Token invalid or expired - proceed to fallback/reject
    }
  }

  // Fallback for development & integration test headers
  const tenantId = (req.headers["x-tenant-id"] as string)?.trim() || "tenant-default";
  const userId = (req.headers["x-user-id"] as string)?.trim() || "user-1";
  const rawRole = (req.headers["x-user-role"] as string)?.trim().toLowerCase() || "admin";
  const role: Role = (["owner", "admin", "agent", "member"].includes(rawRole) ? rawRole : "admin") as Role;
  const permissions = ROLE_PERMISSIONS[role] || [];

  return {
    userId,
    tenantId,
    role,
    permissions,
    isAuthenticated: false,
  };
}

/**
 * Enforces role requirement. Returns 403 Forbidden if not authorized.
 */
export function checkRole(requiredRoles: Role[], ctx: SecurityContext, reply: FastifyReply): boolean {
  if (!requiredRoles.includes(ctx.role)) {
    reply.status(403).send({
      error: `Forbidden: Required role matching [${requiredRoles.join(", ")}]. Current role: '${ctx.role}'`,
      statusCode: 403,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
  return true;
}

/**
 * Enforces fine-grained permission requirement. Returns 403 Forbidden if permission missing.
 */
export function checkPermission(permission: Permission, ctx: SecurityContext, reply: FastifyReply): boolean {
  const hasPerm = AuthorizationService.hasPermission(
    { userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role, permissions: ctx.permissions },
    permission
  );

  if (!hasPerm) {
    reply.status(403).send({
      error: `Forbidden: Missing required permission '${permission}'`,
      statusCode: 403,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
  return true;
}
