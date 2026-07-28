import type { SessionClaims } from "@adminops/identity";
import type { TenantContextValue } from "@adminops/tenancy";

declare module "fastify" {
  interface FastifyRequest {
    tenant?: TenantContextValue;
    auth?: SessionClaims;
  }
}

export {};
