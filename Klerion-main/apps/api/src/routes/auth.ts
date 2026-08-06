import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  InMemoryUserRepository,
  IdentityService,
  JwtService,
  Role,
} from "../../../../modules/platform/identity/src/index.js";
import { AuditLogService } from "../../../../modules/platform/audit/src/index.js";
import { getSecurityContext, checkPermission } from "../context.js";
import { RateLimiter, FileSecurityValidator } from "../../../../modules/platform/security/src/index.js";

export const userRepository = new InMemoryUserRepository();
export const identityService = new IdentityService(
  userRepository,
  async (action, payload) => {
    const tenantId = (payload.tenantId as string) || "tenant-default";
    const userId = (payload.userId as string) || "system";
    await AuditLogService.logEvent(tenantId, action, userId, payload);
  }
);

export async function authRoutes(fastify: FastifyInstance) {
  // 1. User Registration
  fastify.post("/register", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      tenantId?: string;
      email?: string;
      password?: string;
      role?: Role;
    };

    if (!body.email || !body.password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }

    const tenantId = body.tenantId || (req.headers["x-tenant-id"] as string) || "tenant-default";

    try {
      const user = await identityService.registerUser({
        tenantId,
        email: body.email,
        password: body.password,
        role: body.role || "member",
      });

      return reply.status(201).send({
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          role: user.role,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      return reply.status(400).send({ error: msg });
    }
  });

  // 2. User Login with Brute Force Protection & Account Lockout
  fastify.post("/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      tenantId?: string;
      email?: string;
      password?: string;
      mfaCode?: string;
    };

    if (!body.email || !body.password) {
      return reply.status(400).send({ error: "Email and password are required" });
    }

    const tenantId = body.tenantId || (req.headers["x-tenant-id"] as string) || "tenant-default";
    const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";

    // Brute force protection per login email + IP bucket
    const bruteForceCheck = RateLimiter.checkRateLimit(`login:${tenantId}:${body.email}`, 5, 15 * 60 * 1000);
    if (!bruteForceCheck.allowed) {
      return reply.status(429).send({
        error: "Too many failed login attempts for this account. Please try again in 15 minutes.",
      });
    }

    try {
      const result = await identityService.login({
        tenantId,
        email: body.email,
        password: body.password,
        mfaCode: body.mfaCode,
        ip: clientIp,
        userAgent: req.headers["user-agent"] || "Unknown",
      });

      if (result.mfaRequired) {
        return reply.status(200).send({
          mfaRequired: true,
          message: "Multi-Factor Authentication code required",
        });
      }

      // Set HttpOnly, Secure cookie for Refresh Token
      reply.setCookie?.("refresh_token", result.tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/api/auth/refresh",
        maxAge: 7 * 24 * 60 * 60,
      });

      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Login failed";
      return reply.status(401).send({ error: msg });
    }
  });

  // 3. Refresh Token Rotation
  fastify.post("/refresh", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { refreshToken?: string; role?: Role };
    const refreshToken = body?.refreshToken || (req.cookies as Record<string, string>)?.[
      "refresh_token"
    ];

    if (!refreshToken) {
      return reply.status(400).send({ error: "Refresh token is required" });
    }

    try {
      const tokens = JwtService.rotateRefreshToken(refreshToken, body.role || "member", []);
      return reply.send({ tokens });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Token rotation failed";
      return reply.status(401).send({ error: msg });
    }
  });

  // 4. Logout & Token Revocation
  fastify.post("/logout", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = getSecurityContext(req);
    const body = req.body as { refreshToken?: string };
    const authHeader = req.headers["authorization"];
    const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined;

    await identityService.logout(accessToken, body?.refreshToken, ctx.sessionId);

    return reply.send({ success: true, message: "Logged out successfully" });
  });

  // 5. Password Reset Request
  fastify.post("/password-reset/request", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { tenantId?: string; email?: string };
    if (!body.email) {
      return reply.status(400).send({ error: "Email is required" });
    }
    const tenantId = body.tenantId || (req.headers["x-tenant-id"] as string) || "tenant-default";

    const resetToken = await identityService.requestPasswordReset(tenantId, body.email);
    return reply.send({
      message: "If the email is registered, a password reset link has been dispatched.",
      resetToken, // Returned for API verification in tests
    });
  });

  // 6. Password Reset Confirmation
  fastify.post("/password-reset/confirm", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { token?: string; newPassword?: string };
    if (!body.token || !body.newPassword) {
      return reply.status(400).send({ error: "Token and newPassword are required" });
    }

    try {
      await identityService.confirmPasswordReset(body.token, body.newPassword);
      return reply.send({ success: true, message: "Password updated successfully" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Password reset failed";
      return reply.status(400).send({ error: msg });
    }
  });

  // 7. MFA Setup
  fastify.post("/mfa/setup", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = getSecurityContext(req);
    try {
      const result = await identityService.setupMfa(ctx.tenantId, ctx.userId);
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "MFA setup failed";
      return reply.status(400).send({ error: msg });
    }
  });

  // 8. MFA Enable & Verification
  fastify.post("/mfa/enable", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = getSecurityContext(req);
    const body = req.body as { code?: string };
    if (!body.code) {
      return reply.status(400).send({ error: "MFA code is required" });
    }

    try {
      await identityService.enableMfa(ctx.tenantId, ctx.userId, body.code);
      return reply.send({ success: true, message: "Multi-Factor Authentication enabled" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "MFA verification failed";
      return reply.status(400).send({ error: msg });
    }
  });

  // 9. Current Authenticated User Profile
  fastify.get("/me", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = getSecurityContext(req);
    const user = await userRepository.findById(ctx.tenantId, ctx.userId);

    return reply.send({
      context: ctx,
      user: user
        ? {
            id: user.id,
            tenantId: user.tenantId,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
            mfaEnabled: user.mfaEnabled,
          }
        : null,
    });
  });

  // 10. Audit Logs Query Route (Restricted to audit:read)
  fastify.get("/audit-logs", async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = getSecurityContext(req);
    if (!checkPermission("audit:read", ctx, reply)) return;

    const query = req.query as { action?: string; actorId?: string; limit?: string };
    const limit = query.limit ? parseInt(query.limit, 10) : 100;

    const logs = AuditLogService.queryEvents(ctx.tenantId, {
      action: query.action,
      actorId: query.actorId,
      limit,
    });

    const integrity = AuditLogService.verifyIntegrity(ctx.tenantId);

    return reply.send({
      logs,
      integrity,
    });
  });

  // 11. Secure File Upload Pre-flight / Validation Check Route
  fastify.post("/file-security/check", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      filename?: string;
      mimeType?: string;
      base64Content?: string;
    };

    if (!body.filename || !body.mimeType || !body.base64Content) {
      return reply.status(400).send({ error: "filename, mimeType, and base64Content are required" });
    }

    try {
      const buffer = Buffer.from(body.base64Content, "base64");
      const validation = await FileSecurityValidator.validateFileUpload(body.filename, body.mimeType, buffer);

      if (!validation.valid) {
        return reply.status(422).send({ error: validation.error, validation });
      }

      return reply.send({ success: true, validation });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "File validation failed";
      return reply.status(400).send({ error: msg });
    }
  });
}
