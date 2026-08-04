import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { BranchNotFoundError, type BranchRepository, type ServiceRepository } from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";
import { validateBranchIdParam, SchemaValidationError } from "./branch-schemas.js";
import {
  handleServiceDomainError,
  validateAssignServiceToBranchBody,
  validateCreateServiceBody,
} from "./service-schemas.js";

export function registerPublicServiceRoutes(
  app: FastifyInstance,
  services: ServiceRepository,
  branches: BranchRepository,
): void {
  app.get("/services", async (request, reply) => {
    const tenantId = request.tenant!.tenantId;
    const list = await services.getServices(tenantId);
    return reply.send(list);
  });

  app.get("/branches/:id/services", async (request, reply) => {
    let branchId: string;
    try {
      branchId = validateBranchIdParam(request.params);
    } catch (error) {
      const handled = handleServiceDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }

    try {
      const tenantId = request.tenant!.tenantId;
      const branch = await branches.getBranchById(branchId, tenantId);
      if (!branch) {
        throw new BranchNotFoundError("Branch not found.");
      }

      const list = await services.getBranchServices(branchId, tenantId);
      return reply.send(list);
    } catch (error) {
      const handled = handleServiceDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });
}

export function registerServiceRoutes(
  app: FastifyInstance,
  services: ServiceRepository,
  branches: BranchRepository,
  auditLog: AuditLog,
): void {
  app.post(
    "/services",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      let body;
      try {
        body = validateCreateServiceBody(request.body);
      } catch (error) {
        const handled = handleServiceDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const tenantId = request.tenant!.tenantId;
        const { requirements, ...serviceInput } = body;
        const result = await services.createService(
          {
            tenantId,
            ...serviceInput,
          },
          requirements
        );

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "service.created",
          targetType: "service",
          targetId: result.service.id,
          metadata: { code: result.service.code, name: result.service.name },
        });

        return reply.code(201).send({
          ...result.service,
          requirement: result.requirement,
        });
      } catch (error) {
        const handled = handleServiceDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.post(
    "/branches/:id/services",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      let branchId: string;
      let body;
      try {
        branchId = validateBranchIdParam(request.params);
        body = validateAssignServiceToBranchBody(request.body);
      } catch (error) {
        const handled = handleServiceDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const tenantId = request.tenant!.tenantId;
        const branch = await branches.getBranchById(branchId, tenantId);
        if (!branch) {
          throw new BranchNotFoundError("Branch not found.");
        }

        const assignment = await services.assignServiceToBranch(tenantId, branchId, body.serviceId);

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "branch.service_assigned",
          targetType: "branch_service",
          targetId: assignment.id,
          metadata: { branchId, serviceId: body.serviceId },
        });

        return reply.code(201).send(assignment);
      } catch (error) {
        const handled = handleServiceDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.delete(
    "/branches/:id/services/:serviceId",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      let branchId: string;
      let serviceId: string;
      try {
        branchId = validateBranchIdParam(request.params);
        const params = request.params as Record<string, unknown>;
        if (typeof params.serviceId !== "string" || params.serviceId.trim().length === 0) {
          throw new SchemaValidationError("serviceId parameter is required");
        }
        serviceId = params.serviceId;
      } catch (error) {
        const handled = handleServiceDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const tenantId = request.tenant!.tenantId;
        const branch = await branches.getBranchById(branchId, tenantId);
        if (!branch) {
          throw new BranchNotFoundError("Branch not found.");
        }

        await services.removeServiceFromBranch(tenantId, branchId, serviceId);

        await auditLog.record({
          tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "branch.service_removed",
          targetType: "branch_service",
          targetId: `${branchId}:${serviceId}`,
          metadata: { branchId, serviceId },
        });

        return reply.code(204).send();
      } catch (error) {
        const handled = handleServiceDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );
}
