import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { BranchNotFoundError, discoverBranches, type BranchRepository } from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";
import {
  handleBranchDomainError,
  validateCreateBranchBody,
  validateCreateDepartmentBody,
  validateBranchIdParam,
  validateDiscoverBranchesQuery,
} from "./branch-schemas.js";

export function registerPublicBranchRoutes(
  app: FastifyInstance,
  branches: BranchRepository,
): void {
  app.get("/branches/discover", async (request, reply) => {
    let query;
    try {
      query = validateDiscoverBranchesQuery(request.query);
    } catch (error) {
      const handled = handleBranchDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }

    try {
      const results = await discoverBranches(branches, request.tenant!.tenantId, {
        serviceId: query.serviceId,
        latitude: query.latitude,
        longitude: query.longitude,
        maxResults: query.limit,
      });

      return reply.send(results);
    } catch (error) {
      const handled = handleBranchDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });
}

export function registerBranchRoutes(
  app: FastifyInstance,
  branches: BranchRepository,
  auditLog: AuditLog,
): void {
  app.post(
    "/branches",

    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      let body;
      try {
        body = validateCreateBranchBody(request.body);
      } catch (error) {
        const handled = handleBranchDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const branch = await branches.createBranch({
          tenantId: request.tenant!.tenantId,
          status: "active",
          ...body,
        });

        await auditLog.record({
          tenantId: request.tenant!.tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "branch.created",
          targetType: "branch",
          targetId: branch.id,
          metadata: { name: branch.name, slug: branch.slug },
        });

        return reply.code(201).send(branch);
      } catch (error) {
        const handled = handleBranchDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.get("/branches", async (request, reply) => {
    const list = await branches.getBranches(request.tenant!.tenantId);
    return reply.send(list);
  });

  // Department Routes
  app.post(
    "/branches/:id/departments",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      let branchId: string;
      let body;
      try {
        branchId = validateBranchIdParam(request.params);
        body = validateCreateDepartmentBody(request.body);
      } catch (error) {
        const handled = handleBranchDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const branch = await branches.getBranchById(branchId, request.tenant!.tenantId);
        if (!branch) {
          throw new BranchNotFoundError("Branch not found.");
        }

        const department = await branches.createDepartment({
          tenantId: request.tenant!.tenantId,
          branchId,
          ...body,
        });

        await auditLog.record({
          tenantId: request.tenant!.tenantId,
          actorUserId: request.auth?.userId ?? null,
          action: "department.created",
          targetType: "department",
          targetId: department.id,
          metadata: {
            branchId,
            name: department.name,
            slug: department.slug,
            capacity: department.capacity,
          },
        });

        return reply.code(201).send(department);
      } catch (error) {
        const handled = handleBranchDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.get("/branches/:id/departments", async (request, reply) => {
    let branchId: string;
    try {
      branchId = validateBranchIdParam(request.params);
    } catch (error) {
      const handled = handleBranchDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }

    try {
      const branch = await branches.getBranchById(branchId, request.tenant!.tenantId);
      if (!branch) {
        throw new BranchNotFoundError("Branch not found.");
      }

      const list = await branches.getDepartmentsByBranch(branchId, request.tenant!.tenantId);
      return reply.send(list);
    } catch (error) {
      const handled = handleBranchDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });

  // Operating Window Routes
  app.post(
    "/branches/:id/operating-windows",
    { preHandler: requirePermission("tenant:manage") },
    async (request, reply) => {
      let branchId: string;
      try {
        branchId = validateBranchIdParam(request.params);
      } catch (error) {
        const handled = handleBranchDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }

      try {
        const branch = await branches.getBranchById(branchId, request.tenant!.tenantId);
        if (!branch) {
          throw new BranchNotFoundError("Branch not found.");
        }

        const windows = request.body as Array<{ dayOfWeek: number; openMinutes: number; closeMinutes: number }>;
        await branches.setOperatingWindows(branchId, windows);

        return reply.code(200).send({ success: true });
      } catch (error) {
        const handled = handleBranchDomainError(error);
        if (handled) return reply.code(handled.status).send(handled.body);
        throw error;
      }
    },
  );

  app.get("/branches/:id/operating-windows", async (request, reply) => {
    let branchId: string;
    try {
      branchId = validateBranchIdParam(request.params);
    } catch (error) {
      const handled = handleBranchDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }

    try {
      const branch = await branches.getBranchById(branchId, request.tenant!.tenantId);
      if (!branch) {
        throw new BranchNotFoundError("Branch not found.");
      }

      const windows = await branches.getOperatingWindows(branchId);
      return reply.send(windows);
    } catch (error) {
      const handled = handleBranchDomainError(error);
      if (handled) return reply.code(handled.status).send(handled.body);
      throw error;
    }
  });
}

