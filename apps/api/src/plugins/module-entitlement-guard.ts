import type { FastifyInstance } from "fastify";
import type { ControlPlaneService, ModuleKey } from "@adminops/control-plane";
import { requireModule } from "./module-entitlement.js";

export function registerModuleEntitlementGuard(
  app: FastifyInstance,
  service: ControlPlaneService,
  moduleKey: ModuleKey,
): void {
  app.addHook("onRequest", requireModule(service, moduleKey));
}
