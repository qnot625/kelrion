import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import {
  EmployeeDomainError,
  EmployeeNotFoundError,
  type EmployeeFilterOptions,
  type EmployeeService,
  type EmploymentStatus,
  type EmploymentType,
} from "@adminops/workforce-core";
import { requirePermission } from "../plugins/require-permission.js";

interface CreateEmployeeBody {
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
  employmentStatus?: unknown;
}

interface UpdateEmployeeBody {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  employmentType?: unknown;
  departmentId?: unknown;
  positionId?: unknown;
  managerId?: unknown;
  branchId?: unknown;
}

interface AssignManagerBody {
  managerId?: unknown;
}

interface UpdateStatusBody {
  action?: unknown;
  reason?: unknown;
  terminationDate?: unknown;
}

function handleDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (error instanceof EmployeeNotFoundError) {
    return { status: 404, body: { error: error.message } };
  }
  if (error instanceof EmployeeDomainError) {
    if (error.message.includes("already exists")) {
      return { status: 409, body: { error: error.message } };
    }
    return { status: 400, body: { error: error.message } };
  }
  return undefined;
}

export function registerEmployeeRoutes(
  app: FastifyInstance,
  employeeService: EmployeeService,
  _auditLog: AuditLog,
): void {
  // POST /employees
  app.post(
    "/employees",
    { preHandler: requirePermission("employees:create") },
    async (request, reply) => {
      const body = request.body as CreateEmployeeBody;

      if (
        typeof body?.employeeNumber !== "string" ||
        typeof body?.firstName !== "string" ||
        typeof body?.lastName !== "string" ||
        typeof body?.email !== "string" ||
        typeof body?.hireDate !== "string" ||
        typeof body?.employmentType !== "string"
      ) {
        return reply.code(400).send({
          error: "Invalid body: employeeNumber, firstName, lastName, email, hireDate, and employmentType are required strings",
        });
      }

      try {
        const employee = await employeeService.createEmployee(
          request.tenant!.tenantId,
          request.auth?.userId ?? null,
          {
            employeeNumber: body.employeeNumber,
            firstName: body.firstName,
            lastName: body.lastName,
            email: body.email,
            hireDate: body.hireDate,
            employmentType: body.employmentType as EmploymentType,
            departmentId: typeof body.departmentId === "string" ? body.departmentId : undefined,
            positionId: typeof body.positionId === "string" ? body.positionId : undefined,
            managerId: typeof body.managerId === "string" ? body.managerId : (body.managerId === null ? null : undefined),
            branchId: typeof body.branchId === "string" ? body.branchId : undefined,
            employmentStatus: typeof body.employmentStatus === "string" ? (body.employmentStatus as EmploymentStatus) : undefined,
          },
        );
        return reply.code(201).send(employee);
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // GET /employees
  app.get(
    "/employees",
    { preHandler: requirePermission("employees:read") },
    async (request, reply) => {
      const query = request.query as Record<string, string | undefined>;
      const options: EmployeeFilterOptions = {
        departmentId: query.departmentId,
        positionId: query.positionId,
        managerId: query.managerId,
        branchId: query.branchId,
        employmentStatus: query.employmentStatus as EmploymentStatus | undefined,
        search: query.search,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      };

      const result = await employeeService.listEmployees(request.tenant!.tenantId, options);
      return reply.code(200).send(result);
    },
  );

  // GET /employees/:id
  app.get(
    "/employees/:id",
    { preHandler: requirePermission("employees:read") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const employee = await employeeService.getEmployeeById(request.tenant!.tenantId, id);
        return reply.code(200).send(employee);
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // PATCH /employees/:id
  app.patch(
    "/employees/:id",
    { preHandler: requirePermission("employees:update") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateEmployeeBody;

      try {
        const updated = await employeeService.updateEmployee(
          request.tenant!.tenantId,
          request.auth?.userId ?? null,
          id,
          {
            firstName: typeof body.firstName === "string" ? body.firstName : undefined,
            lastName: typeof body.lastName === "string" ? body.lastName : undefined,
            email: typeof body.email === "string" ? body.email : undefined,
            employmentType: typeof body.employmentType === "string" ? (body.employmentType as EmploymentType) : undefined,
            departmentId: typeof body.departmentId === "string" ? body.departmentId : (body.departmentId === null ? null : undefined),
            positionId: typeof body.positionId === "string" ? body.positionId : (body.positionId === null ? null : undefined),
            managerId: typeof body.managerId === "string" ? body.managerId : (body.managerId === null ? null : undefined),
            branchId: typeof body.branchId === "string" ? body.branchId : (body.branchId === null ? null : undefined),
          },
        );
        return reply.code(200).send(updated);
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // PATCH /employees/:id/manager
  app.patch(
    "/employees/:id/manager",
    { preHandler: requirePermission("employees:manage_hierarchy") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as AssignManagerBody;

      const proposedManagerId =
        typeof body?.managerId === "string" ? body.managerId : (body?.managerId === null ? null : undefined);

      if (proposedManagerId === undefined) {
        return reply.code(400).send({ error: "Invalid body: managerId string or null is required" });
      }

      try {
        const updated = await employeeService.assignManager(
          request.tenant!.tenantId,
          request.auth?.userId ?? null,
          id,
          proposedManagerId,
        );
        return reply.code(200).send(updated);
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // PATCH /employees/:id/status
  app.patch(
    "/employees/:id/status",
    { preHandler: requirePermission("employees:update") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as UpdateStatusBody;

      if (
        typeof body?.action !== "string" ||
        !["suspend", "reactivate", "terminate"].includes(body.action)
      ) {
        return reply.code(400).send({
          error: "Invalid body: action must be one of 'suspend', 'reactivate', or 'terminate'",
        });
      }

      try {
        const updated = await employeeService.updateEmploymentStatus(
          request.tenant!.tenantId,
          request.auth?.userId ?? null,
          id,
          body.action as "suspend" | "reactivate" | "terminate",
          typeof body.reason === "string" ? body.reason : undefined,
          typeof body.terminationDate === "string" ? body.terminationDate : undefined,
        );
        return reply.code(200).send(updated);
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );

  // DELETE /employees/:id
  app.delete(
    "/employees/:id",
    { preHandler: requirePermission("employees:delete") },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await employeeService.deleteEmployee(
          request.tenant!.tenantId,
          request.auth?.userId ?? null,
          id,
        );
        return reply.code(200).send(result);
      } catch (err) {
        const handled = handleDomainError(err);
        if (handled) {
          return reply.code(handled.status).send(handled.body);
        }
        throw err;
      }
    },
  );
}
