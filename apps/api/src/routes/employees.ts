import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { BranchRepository } from "@adminops/branch-flow";
import type { UserRepository } from "@adminops/identity";
import {
  EmployeeNotFoundError,
  WorkforceValidationError,
  type EmployeeFilterOptions,
  type EmployeeService,
  type EmploymentStatus,
  type EmploymentType,
} from "@adminops/workforce-core";
import { requirePermission } from "../plugins/require-permission.js";

interface EmployeeBody {
  userId?: unknown;
  employeeNumber?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  hireDate?: unknown;
  employmentType?: unknown;
  departmentId?: unknown;
  positionId?: unknown;
  managerId?: unknown;
  branchId?: unknown;
}

interface EmployeeQuery {
  departmentId?: unknown;
  managerId?: unknown;
  branchId?: unknown;
  employmentStatus?: unknown;
  search?: unknown;
  limit?: unknown;
  offset?: unknown;
}

interface StatusBody {
  status?: unknown;
  terminationDate?: unknown;
}

const EMPLOYMENT_TYPES = new Set<EmploymentType>(["full_time", "part_time", "contract", "intern", "temporary"]);
const EMPLOYMENT_STATUSES = new Set<EmploymentStatus>(["active", "on_leave", "suspended", "terminated"]);

function isManager(request: FastifyRequest): boolean {
  return Boolean(request.auth?.roles.some((role) => role === "owner" || role === "staff"));
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return typeof value === "string" ? value : undefined;
}

function handleError(error: unknown, reply: FastifyReply) {
  if (error instanceof EmployeeNotFoundError) return reply.code(404).send({ error: error.message });
  if (error instanceof WorkforceValidationError) {
    const status = /already exists|already linked/i.test(error.message) ? 409 : 400;
    return reply.code(status).send({ error: error.message });
  }
  throw error;
}

async function normalizePlacement(
  branches: BranchRepository,
  tenantId: string,
  branchValue: unknown,
  departmentValue: unknown,
): Promise<{ branchId?: string | null; departmentId?: string | null } | null> {
  const branchId = optionalString(branchValue);
  const departmentId = optionalString(departmentValue);
  if (branchValue !== undefined && branchId === undefined) return null;
  if (departmentValue !== undefined && departmentId === undefined) return null;

  if (branchId) {
    const branch = await branches.getBranchById(branchId, tenantId);
    if (!branch) return null;
  }
  if (departmentId) {
    const department = await branches.getDepartmentById(departmentId, tenantId);
    if (!department) return null;
    if (branchId && department.branchId !== branchId) return null;
    return { branchId: branchId ?? department.branchId, departmentId };
  }
  return { branchId, departmentId };
}

export function registerEmployeeRoutes(
  app: FastifyInstance,
  employees: EmployeeService,
  branches: BranchRepository,
  users: UserRepository,
): void {
  app.get("/employees/me", { preHandler: requirePermission("employees:read") }, async (request, reply) => {
    const employee = await employees.getByUserId(request.tenant!.tenantId, request.auth!.userId);
    if (!employee) return reply.code(404).send({ error: "No employee record is linked to this user" });
    return reply.send(employee);
  });

  app.get<{ Querystring: EmployeeQuery }>(
    "/employees",
    { preHandler: requirePermission("employees:read") },
    async (request, reply) => {
      if (!isManager(request)) {
        const employee = await employees.getByUserId(request.tenant!.tenantId, request.auth!.userId);
        return reply.send({ data: employee ? [employee] : [], total: employee ? 1 : 0, limit: 1, offset: 0 });
      }
      const query = request.query;
      const limit = query.limit === undefined ? undefined : Number(query.limit);
      const offset = query.offset === undefined ? undefined : Number(query.offset);
      if ((limit !== undefined && !Number.isInteger(limit)) || (offset !== undefined && !Number.isInteger(offset))) {
        return reply.code(400).send({ error: "limit and offset must be integers" });
      }
      const status = typeof query.employmentStatus === "string" && EMPLOYMENT_STATUSES.has(query.employmentStatus as EmploymentStatus)
        ? query.employmentStatus as EmploymentStatus
        : undefined;
      if (query.employmentStatus !== undefined && !status) return reply.code(400).send({ error: "Invalid employmentStatus" });
      const options: EmployeeFilterOptions = {
        departmentId: typeof query.departmentId === "string" ? query.departmentId : undefined,
        managerId: typeof query.managerId === "string" ? query.managerId : undefined,
        branchId: typeof query.branchId === "string" ? query.branchId : undefined,
        employmentStatus: status,
        search: typeof query.search === "string" ? query.search : undefined,
        limit,
        offset,
      };
      return reply.send(await employees.list(request.tenant!.tenantId, options));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/employees/:id",
    { preHandler: requirePermission("employees:read") },
    async (request, reply) => {
      try {
        const employee = await employees.get(request.tenant!.tenantId, request.params.id);
        if (!isManager(request) && employee.userId !== request.auth!.userId) {
          return reply.code(403).send({ error: "Members can only access their own employee record" });
        }
        return reply.send(employee);
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  app.post(
    "/employees",
    { preHandler: requirePermission("employees:create") },
    async (request, reply) => {
      const body = (request.body as EmployeeBody) ?? {};
      if (
        typeof body.employeeNumber !== "string" ||
        typeof body.firstName !== "string" ||
        typeof body.lastName !== "string" ||
        typeof body.email !== "string" ||
        typeof body.hireDate !== "string" ||
        typeof body.employmentType !== "string" ||
        !EMPLOYMENT_TYPES.has(body.employmentType as EmploymentType)
      ) return reply.code(400).send({ error: "employeeNumber, firstName, lastName, email, hireDate and valid employmentType are required" });

      const placement = await normalizePlacement(branches, request.tenant!.tenantId, body.branchId, body.departmentId);
      if (!placement) return reply.code(400).send({ error: "branchId/departmentId must belong to this tenant and be consistent" });
      const userId = optionalString(body.userId);
      if (body.userId !== undefined && userId === undefined) return reply.code(400).send({ error: "userId must be a string or null" });
      if (userId && !await users.findById(request.tenant!.tenantId, userId)) return reply.code(400).send({ error: "userId does not belong to this tenant" });

      try {
        const employee = await employees.create(request.tenant!.tenantId, request.auth!.userId, {
          userId,
          employeeNumber: body.employeeNumber,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          hireDate: body.hireDate,
          employmentType: body.employmentType as EmploymentType,
          branchId: placement.branchId,
          departmentId: placement.departmentId,
          positionId: optionalString(body.positionId),
          managerId: optionalString(body.managerId),
        });
        return reply.code(201).send(employee);
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/employees/:id",
    { preHandler: requirePermission("employees:update") },
    async (request, reply) => {
      const body = (request.body as EmployeeBody) ?? {};
      const placement = await normalizePlacement(branches, request.tenant!.tenantId, body.branchId, body.departmentId);
      if (!placement) return reply.code(400).send({ error: "branchId/departmentId must belong to this tenant and be consistent" });
      const userId = optionalString(body.userId);
      if (body.userId !== undefined && userId === undefined) return reply.code(400).send({ error: "userId must be a string or null" });
      if (userId && !await users.findById(request.tenant!.tenantId, userId)) return reply.code(400).send({ error: "userId does not belong to this tenant" });
      const employmentType = body.employmentType === undefined
        ? undefined
        : typeof body.employmentType === "string" && EMPLOYMENT_TYPES.has(body.employmentType as EmploymentType)
          ? body.employmentType as EmploymentType
          : null;
      if (employmentType === null) return reply.code(400).send({ error: "Invalid employmentType" });
      try {
        return reply.send(await employees.update(request.tenant!.tenantId, request.auth!.userId, request.params.id, {
          userId,
          firstName: typeof body.firstName === "string" ? body.firstName : undefined,
          lastName: typeof body.lastName === "string" ? body.lastName : undefined,
          email: typeof body.email === "string" ? body.email : undefined,
          employmentType,
          branchId: placement.branchId,
          departmentId: placement.departmentId,
          positionId: optionalString(body.positionId),
          managerId: optionalString(body.managerId),
        }));
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: StatusBody }>(
    "/employees/:id/status",
    { preHandler: requirePermission("employees:update") },
    async (request, reply) => {
      if (typeof request.body?.status !== "string" || !EMPLOYMENT_STATUSES.has(request.body.status as EmploymentStatus)) {
        return reply.code(400).send({ error: "A valid status is required" });
      }
      try {
        return reply.send(await employees.changeStatus(
          request.tenant!.tenantId,
          request.auth!.userId,
          request.params.id,
          request.body.status as EmploymentStatus,
          typeof request.body.terminationDate === "string" ? request.body.terminationDate : undefined,
        ));
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/employees/:id",
    { preHandler: requirePermission("employees:delete") },
    async (request, reply) => {
      try {
        await employees.remove(request.tenant!.tenantId, request.auth!.userId, request.params.id);
        return reply.code(204).send();
      } catch (error) {
        return handleError(error, reply);
      }
    },
  );
}
