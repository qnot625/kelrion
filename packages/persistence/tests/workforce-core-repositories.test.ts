import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { AttendanceService, EmployeeService } from "@adminops/workforce-core";
import type { Database } from "../src/database.js";
import * as schema from "../src/schema.js";
import { runMigrations } from "../src/connect.js";
import { PostgresAttendanceCorrectionRepository, PostgresAttendanceRepository } from "../src/postgres-attendance-repository.js";
import { PostgresBranchRepository } from "../src/postgres-branch-repository.js";
import { PostgresEmployeeRepository } from "../src/postgres-employee-repository.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";

async function freshDatabase(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  return db;
}

test("persists tenant-isolated employee hierarchy and branch placement", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);
  const repository = new PostgresEmployeeRepository(db);
  const service = new EmployeeService(repository);
  const alpha = await tenants.create({ name: "Alpha", slug: "alpha-workforce" });
  const beta = await tenants.create({ name: "Beta", slug: "beta-workforce" });
  const branch = await branches.createBranch({
    tenantId: alpha.id,
    slug: "hq",
    name: "Head Office",
    status: "active",
    address: "1 Main Street",
    latitude: 6.45,
    longitude: 3.4,
  });
  const department = await branches.createDepartment({
    tenantId: alpha.id,
    branchId: branch.id,
    name: "Operations",
    slug: "operations",
    capacity: 12,
  });

  const manager = await service.create(alpha.id, null, {
    employeeNumber: "MGR-001",
    firstName: "Morgan",
    lastName: "Lee",
    email: "morgan@example.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
    branchId: branch.id,
    departmentId: department.id,
  });
  const employee = await service.create(alpha.id, null, {
    employeeNumber: "EMP-001",
    firstName: "Taylor",
    lastName: "Kim",
    email: "taylor@example.com",
    hireDate: "2026-02-01",
    employmentType: "full_time",
    branchId: branch.id,
    departmentId: department.id,
    managerId: manager.id,
  });

  assert.equal((await service.get(alpha.id, employee.id)).managerId, manager.id);
  await assert.rejects(service.get(beta.id, employee.id));
  const betaEmployee = await service.create(beta.id, null, {
    employeeNumber: "EMP-001",
    firstName: "Taylor",
    lastName: "Kim",
    email: "taylor@example.com",
    hireDate: "2026-02-01",
    employmentType: "part_time",
  });
  assert.notEqual(betaEmployee.id, employee.id);
});

test("persists attendance idempotency and correction history", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const employees = new PostgresEmployeeRepository(db);
  const employeeService = new EmployeeService(employees);
  const attendanceRepository = new PostgresAttendanceRepository(db);
  const correctionRepository = new PostgresAttendanceCorrectionRepository(db);
  const attendance = new AttendanceService(employees, attendanceRepository, correctionRepository);
  const tenant = await tenants.create({ name: "Attendance Co", slug: "attendance-co" });
  const employee = await employeeService.create(tenant.id, null, {
    employeeNumber: "EMP-100",
    firstName: "Amina",
    lastName: "Yusuf",
    email: "amina@example.com",
    hireDate: "2026-01-15",
    employmentType: "full_time",
  });

  const first = await attendance.apply({
    tenantId: tenant.id,
    employeeId: employee.id,
    action: "clock_in",
    timestamp: new Date("2026-08-06T08:00:00Z"),
    idempotencyKey: "terminal-1:001",
  });
  const duplicate = await attendance.apply({
    tenantId: tenant.id,
    employeeId: employee.id,
    action: "clock_in",
    timestamp: new Date("2026-08-06T08:00:00Z"),
    idempotencyKey: "terminal-1:001",
  });
  assert.equal(duplicate.id, first.id);

  const correction = await attendance.requestCorrection(tenant.id, null, {
    employeeId: employee.id,
    requestedAction: "clock_in",
    requestedAt: new Date("2026-08-07T09:00:00Z"),
    reason: "Forgot to clock in",
  });
  const reviewer = crypto.randomUUID();
  await db.execute(sql`
    INSERT INTO users (id, tenant_id, email, password_hash, roles)
    VALUES (${reviewer}::uuid, ${tenant.id}::uuid, 'reviewer@example.com', 'x', '["owner"]'::jsonb)
  `);
  const approved = await attendance.reviewCorrection(tenant.id, reviewer, correction.id, true, "Approved");
  assert.equal(approved.status, "approved");
  const nextDay = await attendanceRepository.getRecord(tenant.id, employee.id, "2026-08-07");
  assert.equal(nextDay?.status, "clocked_in");
});
