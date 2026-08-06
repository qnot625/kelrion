import type { SessionClaims } from "@adminops/identity";
import type { TenantContextValue } from "@adminops/tenancy";
import type { PlatformAdminClaims } from "@adminops/control-plane";

declare module "fastify" {
  interface FastifyRequest {
    tenant?: TenantContextValue;
    auth?: SessionClaims;
    platformAuth?: PlatformAdminClaims;
  }
}

export {};
