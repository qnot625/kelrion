import type { FastifyInstance } from "fastify";
import { InvalidCredentialsError, type AuthService } from "@adminops/identity";

interface AuthBody {
  email?: unknown;
  password?: unknown;
}

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
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
      return reply.send(result);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return reply.code(401).send({ error: error.message });
      }
      throw error;
    }
  });
}
