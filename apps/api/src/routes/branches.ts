import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  BranchNotFoundError,
  DepartmentNotFoundError,
  discoverBranches,
  type BranchRepository,
} from "@adminops/branch-flow";
import { requirePermission } from "../plugins/require-permission.js";
import {
  handleBranchDomainError,
  SchemaValidationError,
  validateBranchIdParam,
  validateCreateBranchBody,
  validateCreateBranchHolidayBody,
  validateCreateDepartmentBody,
  validateCreateTenantHolidayBody,
  validateDiscoverBranchesQuery,
  validateHolidayIdParam,
  validatePutOperatingWindowsBody,
  validateUpdateBranchBody,
  validateUpdateDepartmentBody,
} from "./branch-schemas.js";

function handled(error: unknown) {
  return handleBranchDomainError(error);
}

async function requireBranch(branches: BranchRepository, branchId: string, tenantId: string) {
  const branch = await branches.getBranchById(branchId, tenantId);
  if (!branch) throw new BranchNotFoundError("Branch not found.");
  return branch;
}

export function registerPublicBranchRoutes(app: FastifyInstance, branches: BranchRepository): void {
  app.get("/branches/discover", async (request, reply) => {
    try {
      const query = validateDiscoverBranchesQuery(request.query);
      return reply.send(await discoverBranches(branches, request.tenant!.tenantId, {
        serviceId: query.serviceId,
        latitude: query.latitude,
        longitude: query.longitude,
        maxResults: query.limit,
      }));
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });
}

export function registerBranchRoutes(app: FastifyInstance, branches: BranchRepository, auditLog: AuditLog): void {
  app.post("/branches", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const body = validateCreateBranchBody(request.body);
      const branch = await branches.createBranch({
        tenantId: request.tenant!.tenantId,
        status: body.status ?? "active",
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
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.get("/branches", async (request, reply) => reply.send(
    await branches.getBranches(request.tenant!.tenantId),
  ));

  app.patch("/branches/:id", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      const updates = validateUpdateBranchBody(request.body);
      await requireBranch(branches, branchId, request.tenant!.tenantId);
      const branch = await branches.updateBranch(branchId, request.tenant!.tenantId, updates);
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "branch.updated",
        targetType: "branch",
        targetId: branch.id,
        metadata: { ...updates },
      });
      return reply.send(branch);
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  const setWindows = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      const windows = validatePutOperatingWindowsBody(request.body);
      await requireBranch(branches, branchId, request.tenant!.tenantId);
      await branches.setOperatingWindows(branchId, windows);
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "branch.operating_windows_updated",
        targetType: "branch",
        targetId: branchId,
        metadata: { windows },
      });
      return reply.send({ success: true });
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  };

  app.put("/branches/:id/operating-windows", { preHandler: requirePermission("tenant:manage") }, setWindows);
  app.post("/branches/:id/operating-windows", { preHandler: requirePermission("tenant:manage") }, setWindows);

  app.get("/branches/:id/operating-windows", async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      await requireBranch(branches, branchId, request.tenant!.tenantId);
      return reply.send(await branches.getOperatingWindows(branchId));
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.post("/branches/:id/holidays", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      const body = validateCreateBranchHolidayBody(request.body);
      await requireBranch(branches, branchId, request.tenant!.tenantId);
      const holiday = await branches.addHoliday({
        tenantId: request.tenant!.tenantId,
        branchId,
        name: body.name,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
      });
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "branch.holiday_created",
        targetType: "branch_holiday",
        targetId: holiday.id,
        metadata: { branchId, name: holiday.name, startAt: body.startAt, endAt: body.endAt },
      });
      return reply.code(201).send(holiday);
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.get("/branches/:id/holidays", async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      await requireBranch(branches, branchId, request.tenant!.tenantId);
      return reply.send(await branches.getHolidays(request.tenant!.tenantId, branchId));
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.post("/holidays", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const body = validateCreateTenantHolidayBody(request.body);
      if (body.branchId) await requireBranch(branches, body.branchId, request.tenant!.tenantId);
      const holiday = await branches.addHoliday({
        tenantId: request.tenant!.tenantId,
        branchId: body.branchId ?? null,
        name: body.name,
        startAt: new Date(body.startAt),
        endAt: new Date(body.endAt),
      });
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "holiday.created",
        targetType: "branch_holiday",
        targetId: holiday.id,
        metadata: { branchId: holiday.branchId, name: holiday.name },
      });
      return reply.code(201).send(holiday);
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.get("/holidays", async (request, reply) => reply.send(
    await branches.getHolidays(request.tenant!.tenantId),
  ));

  app.delete("/holidays/:id", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const holidayId = validateHolidayIdParam(request.params);
      await branches.removeHoliday(holidayId, request.tenant!.tenantId);
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "holiday.removed",
        targetType: "branch_holiday",
        targetId: holidayId,
        metadata: {},
      });
      return reply.code(204).send();
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.post("/branches/:id/departments", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      const body = validateCreateDepartmentBody(request.body);
      await requireBranch(branches, branchId, request.tenant!.tenantId);
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
        metadata: { branchId, name: department.name, slug: department.slug, capacity: department.capacity },
      });
      return reply.code(201).send(department);
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.get("/branches/:id/departments", async (request, reply) => {
    try {
      const branchId = validateBranchIdParam(request.params);
      await requireBranch(branches, branchId, request.tenant!.tenantId);
      return reply.send(await branches.getDepartmentsByBranch(branchId, request.tenant!.tenantId));
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.patch("/departments/:id", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const params = request.params as Record<string, unknown>;
      if (typeof params.id !== "string" || !params.id.trim()) throw new SchemaValidationError("departmentId is required");
      const departmentId = params.id;
      const updates = validateUpdateDepartmentBody(request.body);
      const current = await branches.getDepartmentById(departmentId, request.tenant!.tenantId);
      if (!current) throw new DepartmentNotFoundError("Department not found.");
      const department = await branches.updateDepartment(departmentId, request.tenant!.tenantId, updates);
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "department.updated",
        targetType: "department",
        targetId: department.id,
        metadata: updates,
      });
      return reply.send(department);
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });

  app.delete("/departments/:id", { preHandler: requirePermission("tenant:manage") }, async (request, reply) => {
    try {
      const params = request.params as Record<string, unknown>;
      if (typeof params.id !== "string" || !params.id.trim()) throw new SchemaValidationError("departmentId is required");
      const departmentId = params.id;
      const current = await branches.getDepartmentById(departmentId, request.tenant!.tenantId);
      if (!current) throw new DepartmentNotFoundError("Department not found.");
      await branches.deleteDepartment(departmentId, request.tenant!.tenantId);
      await auditLog.record({
        tenantId: request.tenant!.tenantId,
        actorUserId: request.auth?.userId ?? null,
        action: "department.removed",
        targetType: "department",
        targetId: departmentId,
        metadata: { branchId: current.branchId },
      });
      return reply.code(204).send();
    } catch (error) {
      const result = handled(error);
      if (result) return reply.code(result.status).send(result.body);
      throw error;
    }
  });
}
