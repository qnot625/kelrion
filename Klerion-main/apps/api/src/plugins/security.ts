import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import fastifyHelmet from "@fastify/helmet";
import { RateLimiter, InputSanitizer } from "../../../../modules/platform/security/src/index.js";

async function securityPlugin(fastify: FastifyInstance) {
  // 1. Fastify Helmet Configuration
  await fastify.register(fastifyHelmet, {
    contentSecurityPolicy: false, // Explicitly set in onRequest hook for uncompromised global header delivery
  });

  // 2. Global PreHandler Hook: Enterprise Secure HTTP Headers, Rate Limiting & Input Sanitization
  fastify.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Enterprise Secure HTTP Headers
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; object-src 'none'"
    );
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-XSS-Protection", "1; mode=block");

    // Rate Limiting by Client IP
    const clientIp = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const rateLimit = RateLimiter.checkRateLimit(`ip:${clientIp}`, 200, 60 * 1000);

    reply.header("X-RateLimit-Limit", "200");
    reply.header("X-RateLimit-Remaining", rateLimit.remaining.toString());
    reply.header("X-RateLimit-Reset", Math.ceil(rateLimit.resetTimeMs / 1000).toString());

    if (!rateLimit.allowed) {
      reply.status(429).send({
        error: "Too Many Requests: Rate limit exceeded. Please try again later.",
        statusCode: 429,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Input Sanitization for Body Payload
    if (req.body && typeof req.body === "object") {
      req.body = InputSanitizer.sanitizeObject(req.body);
    }
  });

  // 3. Global Error Handler: Standardized Secure Error Output
  fastify.setErrorHandler((error: Error & { statusCode?: number }, _req: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode || 500;
    const isProduction = process.env.NODE_ENV === "production";

    const errorResponse = {
      error: statusCode === 500 && isProduction ? "Internal Server Error" : error.message,
      statusCode,
      timestamp: new Date().toISOString(),
    };

    reply.status(statusCode).send(errorResponse);
  });
}

export const registerSecurityPlugin = fp(securityPlugin, { name: "security-plugin" });
