import { sql, type SQL } from "drizzle-orm";
import {
  Employee,
  type EmployeeFilterOptions,
  type EmployeeRepository,
  type EmployeeState,
  type EmploymentStatus,
  type EmploymentType,
} from "../../index.js";
import type { Database } from "@adminops/persistence";

interface EmployeeRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  hire_date: string | Date;
  employment_type: string;
  employment_status: string;
  department_id: string | null;
  position_id: string | null;
  manager_id: string | null;
  branch_id: string | null;
  termination_date: string | Date | null;
  created_at: Date | string;
  updated_at: Date | string;
}

async function queryRows<T>(db: Database, statement: SQL): Promise<T[]> {
  const result = await db.execute(statement);
  return (result as unknown as { rows: T[] }).rows;
}

function dateOnly(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toEmployee(row: EmployeeRow): Employee {
  const state: EmployeeState = {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    hireDate: dateOnly(row.hire_date)!,
    employmentType: row.employment_type as EmploymentType,
    employmentStatus: row.employment_status as EmploymentStatus,
    departmentId: row.department_id,
    positionId: row.position_id,
    managerId: row.manager_id,
    branchId: row.branch_id,
    terminationDate: dateOnly(row.termination_date),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
  return Employee.reconstitute(state);
}

const SELECT_COLUMNS = sql.raw(`
  id, tenant_id, user_id, employee_number, first_name, last_name, email,
  hire_date, employment_type, employment_status, department_id, position_id,
  manager_id, branch_id, termination_date, created_at, updated_at
`);

export class PostgresEmployeeRepository implements EmployeeRepository {
  constructor(private readonly db: Database) {}

  async save(employee: Employee): Promise<void> {
    const value = employee.toState();
    await this.db.execute(sql`
      INSERT INTO employees (
        id, tenant_id, user_id, employee_number, first_name, last_name, email,
        hire_date, employment_type, employment_status, department_id, position_id,
        manager_id, branch_id, termination_date, created_at, updated_at
      ) VALUES (
        ${value.id}::uuid, ${value.tenantId}::uuid, ${value.userId}::uuid, ${value.employeeNumber},
        ${value.firstName}, ${value.lastName}, ${value.email}, ${value.hireDate}::date,
        ${value.employmentType}, ${value.employmentStatus}, ${value.departmentId}::uuid,
        ${value.positionId}::uuid, ${value.managerId}::uuid, ${value.branchId}::uuid,
        ${value.terminationDate}::date, ${value.createdAt}, ${value.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        employment_type = EXCLUDED.employment_type,
        employment_status = EXCLUDED.employment_status,
        department_id = EXCLUDED.department_id,
        position_id = EXCLUDED.position_id,
        manager_id = EXCLUDED.manager_id,
        branch_id = EXCLUDED.branch_id,
        termination_date = EXCLUDED.termination_date,
        updated_at = EXCLUDED.updated_at
    `);
  }

  async findById(tenantId: string, id: string): Promise<Employee | null> {
    const rows = await queryRows<EmployeeRow>(this.db, sql`
      SELECT ${SELECT_COLUMNS} FROM employees WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid LIMIT 1
    `);
    return rows[0] ? toEmployee(rows[0]) : null;
  }

  async findByUserId(tenantId: string, userId: string): Promise<Employee | null> {
    const rows = await queryRows<EmployeeRow>(this.db, sql`
      SELECT ${SELECT_COLUMNS} FROM employees WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid LIMIT 1
    `);
    return rows[0] ? toEmployee(rows[0]) : null;
  }

  async findByEmployeeNumber(tenantId: string, employeeNumber: string): Promise<Employee | null> {
    const rows = await queryRows<EmployeeRow>(this.db, sql`
      SELECT ${SELECT_COLUMNS} FROM employees
      WHERE tenant_id = ${tenantId}::uuid AND lower(employee_number) = lower(${employeeNumber}) LIMIT 1
    `);
    return rows[0] ? toEmployee(rows[0]) : null;
  }

  async findByEmail(tenantId: string, email: string): Promise<Employee | null> {
    const rows = await queryRows<EmployeeRow>(this.db, sql`
      SELECT ${SELECT_COLUMNS} FROM employees
      WHERE tenant_id = ${tenantId}::uuid AND lower(email) = lower(${email}) LIMIT 1
    `);
    return rows[0] ? toEmployee(rows[0]) : null;
  }

  async list(tenantId: string, options: EmployeeFilterOptions = {}): Promise<Employee[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const search = options.search?.trim() || null;
    const rows = await queryRows<EmployeeRow>(this.db, sql`
      SELECT ${SELECT_COLUMNS} FROM employees
      WHERE tenant_id = ${tenantId}::uuid
        AND (${options.userId ?? null}::uuid IS NULL OR user_id = ${options.userId ?? null}::uuid)
        AND (${options.departmentId ?? null}::uuid IS NULL OR department_id = ${options.departmentId ?? null}::uuid)
        AND (${options.positionId ?? null}::uuid IS NULL OR position_id = ${options.positionId ?? null}::uuid)
        AND (${options.managerId ?? null}::uuid IS NULL OR manager_id = ${options.managerId ?? null}::uuid)
        AND (${options.branchId ?? null}::uuid IS NULL OR branch_id = ${options.branchId ?? null}::uuid)
        AND (${options.employmentStatus ?? null}::text IS NULL OR employment_status = ${options.employmentStatus ?? null})
        AND (
          ${search}::text IS NULL OR
          employee_number ILIKE '%' || ${search} || '%' OR
          first_name ILIKE '%' || ${search} || '%' OR
          last_name ILIKE '%' || ${search} || '%' OR
          email ILIKE '%' || ${search} || '%'
        )
      ORDER BY last_name ASC, first_name ASC, employee_number ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return rows.map(toEmployee);
  }

  async count(tenantId: string, options: EmployeeFilterOptions = {}): Promise<number> {
    const search = options.search?.trim() || null;
    const rows = await queryRows<{ count: string | number }>(this.db, sql`
      SELECT count(*) AS count FROM employees
      WHERE tenant_id = ${tenantId}::uuid
        AND (${options.userId ?? null}::uuid IS NULL OR user_id = ${options.userId ?? null}::uuid)
        AND (${options.departmentId ?? null}::uuid IS NULL OR department_id = ${options.departmentId ?? null}::uuid)
        AND (${options.positionId ?? null}::uuid IS NULL OR position_id = ${options.positionId ?? null}::uuid)
        AND (${options.managerId ?? null}::uuid IS NULL OR manager_id = ${options.managerId ?? null}::uuid)
        AND (${options.branchId ?? null}::uuid IS NULL OR branch_id = ${options.branchId ?? null}::uuid)
        AND (${options.employmentStatus ?? null}::text IS NULL OR employment_status = ${options.employmentStatus ?? null})
        AND (
          ${search}::text IS NULL OR
          employee_number ILIKE '%' || ${search} || '%' OR
          first_name ILIKE '%' || ${search} || '%' OR
          last_name ILIKE '%' || ${search} || '%' OR
          email ILIKE '%' || ${search} || '%'
        )
    `);
    return Number(rows[0]?.count ?? 0);
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const rows = await queryRows<{ id: string }>(this.db, sql`
      DELETE FROM employees WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid RETURNING id
    `);
    return rows.length > 0;
  }
}
