import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  BranchNotFoundError,
  ServiceNotFoundError,
  type BranchRepository,
  type ServiceRef,
  type ServiceRepository,
} from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";
import { validateBranchIdParam, SchemaValidationError } from "./branch-schemas.js";
import {
  handleServiceDomainError,
  validateAssignServiceToBranchBody,
  validateCreateServiceBody,
  validateServiceRequirementBody,
  validateUpdateServiceBody,
} from "./service-schemas.js";

function serviceIdFrom(params: unknown): string {
  const value = (params as Record<string, unknown> | null)?.serviceId ?? (params as Record<string, unknown> | null)?.id;
  if (typeof value !== "string" || !value.trim()) throw new SchemaValidationError("serviceId parameter is required");
  return value;
}

async function withRequirement(services: ServiceRepository, service: ServiceRef) {
  return { ...service, requirement: await services.getServiceRequirement(service.id, service.tenantId) };
}

export function registerPublicServiceRoutes(
  app: FastifyInstance,
  services: ServiceRepository,
  branches: BranchRepository,
): void {
  app.get("/services", async (request, reply) => {
    const list = await services.getServices(request.tenant!.tenantId);
    return reply.send(await Promise.all(list.map((service) => withRequirement(services, service))));
  });

  app.get("/branches/:id/services", async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      const tenantId = request.tenant!.tenantId;
      const branch = await branches.getBranchById(branchId, tenantId);
      if (!branch) throw new BranchNotFoundError("Branch not found.");
      const list = await services.getBranchServices(branchId, tenantId);
      return reply.send(await Promise.all(list.map((service) => withRequirement(services, service))));
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
  app.get("/services/:id", async (request, reply) => {
    try {
      const serviceId = serviceIdFrom(request.params);
      const service = await services.getServiceById(serviceId, request.tenant!.tenantId);
      if (!service) throw new ServiceNotFoundError("Service not found.");
      return reply.send(await withRequirement(services, service));
    } catch (error) {
      const handled = handleServiceDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.post("/services", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const body = validateCreateServiceBody(request.body);
      const tenantId = request.tenant!.tenantId;
      const { requirements, ...serviceInput } = body;
      const result = await services.createService({ tenantId, ...serviceInput }, requirements);
      await auditLog.record({
        tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "service.created",
        targetType: "service",
        targetId: result.service.id,
        metadata: { code: result.service.code, name: result.service.name },
      });
      return reply.code(201).send({ ...result.service, requirement: result.requirement });
    } catch (error) {
      const handled = handleServiceDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.patch("/services/:id", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const serviceId = serviceIdFrom(request.params);
      const updates = validateUpdateServiceBody(request.body);
      const service = await services.updateService(serviceId, request.tenant!.tenantId, updates);
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "service.updated",
        targetType: "service",
        targetId: service.id,
        metadata: { ...updates },
      });
      return reply.send(await withRequirement(services, service));
    } catch (error) {
      const handled = handleServiceDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.put("/services/:id/requirements", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const serviceId = serviceIdFrom(request.params);
      const requirement = validateServiceRequirementBody(request.body);
      const saved = await services.setServiceRequirement(serviceId, request.tenant!.tenantId, requirement);
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "service.requirements_updated",
        targetType: "service",
        targetId: serviceId,
        metadata: { ...requirement },
      });
      return reply.send(saved);
    } catch (error) {
      const handled = handleServiceDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  app.post("/branches/:id/services", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      const body = validateAssignServiceToBranchBody(request.body);
      const tenantId = request.tenant!.tenantId;
      const branch = await branches.getBranchById(branchId, tenantId);
      if (!branch) throw new BranchNotFoundError("Branch not found.");
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
  });

  app.delete("/branches/:id/services/:serviceId", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      const serviceId = serviceIdFrom(request.params);
      const tenantId = request.tenant!.tenantId;
      const branch = await branches.getBranchById(branchId, tenantId);
      if (!branch) throw new BranchNotFoundError("Branch not found.");
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
  });
}
