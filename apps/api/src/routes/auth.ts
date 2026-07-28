import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { InvalidCredentialsError, type AuthService } from "@adminops/identity";

interface AuthBody {
  email?: unknown;
  password?: unknown;
}

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService, auditLog: AuditLog): void {
  app.post("/auth/signup", async (request, reply) => {
    const body = request.body as AuthBody;
    if (typeof body?.email !== "string" || typeof body?.password !== "string") {
      return reply.code(400).send({ error: "email and password are required strings" });
    }

    try {
      const result = await authService.signUp({
        tenantId: request.tenant!.tenantId,
        email: body.email,
        password: body.password,
      });
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: result.userId,
        action: "user.signed_up",
        targetType: "user",
        targetId: result.userId,
        metadata: { email: body.email },
      });
      return reply.code(201).send(result);
    } catch (error) {
      if (error instanceof Error) {
        return reply.code(400).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const body = request.body as AuthBody;
    if (typeof body?.email !== "string" || typeof body?.password !== "string") {
      return reply.code(400).send({ error: "email and password are required strings" });
    }

    try {
      const result = await authService.login({
        tenantId: request.tenant!.tenantId,
        email: body.email,
        password: body.password,
      });
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: result.userId,
        action: "user.logged_in",
        targetType: "user",
        targetId: result.userId,
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }
  });
}
