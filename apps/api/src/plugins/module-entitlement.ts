import type { FastifyReply, FastifyRequest } from "fastify";
import { ModuleNotEnabledError, type ControlPlaneService, type ModuleKey } from "@adminops/control-plane";

export function requireModule(service: ControlPlaneService, moduleKey: ModuleKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await service.assertModuleEnabled(request.tenant!.tenantId, moduleKey);
    } catch (error) {
      if (error instanceof ModuleNotEnabledError) {
        await reply.code(403).send({ error: error.message, code: "MODULE_NOT_ENABLED", moduleKey });
        return;
      }
      throw error;
    }
  };
}
