import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import {
  Employee,
  EmployeeDomainError,
  type EmployeeFilterOptions,
  type EmployeeRepository,
  type EmploymentStatus,
  type EmploymentType,
  type ManagerHierarchyProvider,
  type ManagerLookupFn,
  type ManagerNode,
} from "@adminops/workforce-core";
import type { Database } from "./database.js";
import { employees } from "./schema.js";
import { isUniqueViolation } from "./pg-errors.js";

type EmployeeRow = typeof employees.$inferSelect;

function toRow(employee: Employee) {
  const state = employee.toState();
  return {
    id: state.id,
    tenantId: state.tenantId,
    employeeNumber: state.employeeNumber,
    firstName: state.firstName,
    lastName: state.lastName,
    email: state.email.toLowerCase(),
    hireDate: state.hireDate,
    employmentType: state.employmentType,
    employmentStatus: state.employmentStatus,
    departmentId: state.departmentId,
    positionId: state.positionId,
    managerId: state.managerId,
    branchId: state.branchId,
    terminationDate: state.terminationDate,
    createdAt: new Date(state.createdAt),
    updatedAt: new Date(state.updatedAt),
  };
}

function toDomain(row: EmployeeRow): Employee {
  return Employee.reconstitute({
    id: row.id,
    tenantId: row.tenantId,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    hireDate: row.hireDate,
    employmentType: row.employmentType as EmploymentType,
    employmentStatus: row.employmentStatus as EmploymentStatus,
    departmentId: row.departmentId,
    positionId: row.positionId,
    managerId: row.managerId,
    branchId: row.branchId,
    terminationDate: row.terminationDate,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
  });
}

function extractErrorString(error: unknown): string {
  let str = "";
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && current !== null) {
      const obj = current as Record<string, unknown>;
      if (typeof obj.message === "string") str += " " + obj.message;
      if (typeof obj.detail === "string") str += " " + obj.detail;
      if (typeof obj.constraint === "string") str += " " + obj.constraint;
      current = obj.cause;
    } else {
      break;
    }
  }
  return str.toLowerCase();
}

export class PostgresEmployeeRepository
  implements EmployeeRepository, ManagerHierarchyProvider
{
  constructor(private readonly db: Database) {}

  public getNode: ManagerLookupFn = async (
    employeeId: string,
    tenantId: string
  ): Promise<ManagerNode | null> => {
    return this.getManagerNode(tenantId, employeeId);
  };

  async save(employee: Employee): Promise<void> {
    const row = toRow(employee);
    try {
      await this.db
        .insert(employees)
        .values(row)
        .onConflictDoUpdate({
          target: employees.id,
          set: {
            employeeNumber: row.employeeNumber,
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            hireDate: row.hireDate,
            employmentType: row.employmentType,
            employmentStatus: row.employmentStatus,
            departmentId: row.departmentId,
            positionId: row.positionId,
            managerId: row.managerId,
            branchId: row.branchId,
            terminationDate: row.terminationDate,
            updatedAt: row.updatedAt,
          },
        });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const fullErrStr = extractErrorString(error);
        if (
          fullErrStr.includes("employees_tenant_number") ||
          fullErrStr.includes("tenant_number")
        ) {
          throw new EmployeeDomainError(
            `Employee number [${employee.employeeNumber}] already exists for tenant`
          );
        }
        if (
          fullErrStr.includes("employees_tenant_email") ||
          fullErrStr.includes("tenant_email")
        ) {
          throw new EmployeeDomainError(
            `Employee email [${employee.email}] already exists for tenant`
          );
        }
        throw new EmployeeDomainError(
          `Duplicate key violation saving employee record`
        );
      }
      throw error;
    }
  }

  async findById(tenantId: string, id: string): Promise<Employee | null> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByEmployeeNumber(
    tenantId: string,
    employeeNumber: string
  ): Promise<Employee | null> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.tenantId, tenantId),
          eq(employees.employeeNumber, employeeNumber)
        )
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByEmail(tenantId: string, email: string): Promise<Employee | null> {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(
        and(
          eq(employees.tenantId, tenantId),
          eq(employees.email, email.toLowerCase())
        )
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async list(
    tenantId: string,
    options?: EmployeeFilterOptions
  ): Promise<Employee[]> {
    const conditions: SQL[] = [eq(employees.tenantId, tenantId)];

    if (options?.departmentId) {
      conditions.push(eq(employees.departmentId, options.departmentId));
    }
    if (options?.positionId) {
      conditions.push(eq(employees.positionId, options.positionId));
    }
    if (options?.managerId) {
      conditions.push(eq(employees.managerId, options.managerId));
    }
    if (options?.branchId) {
      conditions.push(eq(employees.branchId, options.branchId));
    }
    if (options?.employmentStatus) {
      conditions.push(eq(employees.employmentStatus, options.employmentStatus));
    }
    if (options?.search) {
      const searchPattern = `%${options.search}%`;
      const searchCond = or(
        ilike(employees.firstName, searchPattern),
        ilike(employees.lastName, searchPattern),
        ilike(employees.email, searchPattern),
        ilike(employees.employeeNumber, searchPattern)
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    let query = this.db
      .select()
      .from(employees)
      .where(and(...conditions))
      .orderBy(asc(employees.lastName), asc(employees.firstName));

    if (typeof options?.limit === "number") {
      query = query.limit(options.limit) as typeof query;
    }
    if (typeof options?.offset === "number") {
      query = query.offset(options.offset) as typeof query;
    }

    const rows = await query;
    return rows.map(toDomain);
  }

  async count(
    tenantId: string,
    options?: EmployeeFilterOptions
  ): Promise<number> {
    const conditions: SQL[] = [eq(employees.tenantId, tenantId)];

    if (options?.departmentId) {
      conditions.push(eq(employees.departmentId, options.departmentId));
    }
    if (options?.positionId) {
      conditions.push(eq(employees.positionId, options.positionId));
    }
    if (options?.managerId) {
      conditions.push(eq(employees.managerId, options.managerId));
    }
    if (options?.branchId) {
      conditions.push(eq(employees.branchId, options.branchId));
    }
    if (options?.employmentStatus) {
      conditions.push(eq(employees.employmentStatus, options.employmentStatus));
    }
    if (options?.search) {
      const searchPattern = `%${options.search}%`;
      const searchCond = or(
        ilike(employees.firstName, searchPattern),
        ilike(employees.lastName, searchPattern),
        ilike(employees.email, searchPattern),
        ilike(employees.employeeNumber, searchPattern)
      );
      if (searchCond) {
        conditions.push(searchCond);
      }
    }

    const [row] = await this.db
      .select({ value: count() })
      .from(employees)
      .where(and(...conditions));

    return Number(row?.value ?? 0);
  }

  async exists(tenantId: string, id: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
      .limit(1);
    return Boolean(row);
  }

  async getManagerNode(
    tenantId: string,
    employeeId: string
  ): Promise<ManagerNode | null> {
    const [row] = await this.db
      .select({
        id: employees.id,
        tenantId: employees.tenantId,
        managerId: employees.managerId,
        employmentStatus: employees.employmentStatus,
      })
      .from(employees)
      .where(
        and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId))
      )
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      employeeId: row.id,
      tenantId: row.tenantId,
      managerId: row.managerId,
      employmentStatus: row.employmentStatus as EmploymentStatus,
    };
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const result = await this.db
      .delete(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
      .returning({ id: employees.id });

    return result.length > 0;
  }
}
