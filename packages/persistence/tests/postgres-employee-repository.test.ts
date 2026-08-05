import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  Employee,
  EmployeeDomainError,
  validateManagerHierarchy,
} from "@adminops/workforce-core";
import type { Database } from "../src/database.js";
import { splitSqlStatements } from "../src/connect.js";
import * as schema from "../src/schema.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";
import { PostgresEmployeeRepository } from "../src/postgres-employee-repository.js";

async function freshDatabase(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  const migrationPath = fileURLToPath(
    new URL("../migrations/0001_initial.sql", import.meta.url)
  );
  for (const statement of splitSqlStatements(
    await readFile(migrationPath, "utf8")
  )) {
    await db.execute(sql.raw(statement));
  }
  return db;
}

test("PostgresEmployeeRepository — persists employee aggregate and reconstitutes accurately", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const repo = new PostgresEmployeeRepository(db);

  const tenant = await tenants.create({
    name: "Acme Corp",
    slug: "acme-corp",
  });

  const employee = Employee.create({
    tenantId: tenant.id,
    employeeNumber: "EMP-1001",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane.doe@acme.com",
    hireDate: "2026-01-15",
    employmentType: "full_time",
  });

  await repo.save(employee);

  const found = await repo.findById(tenant.id, employee.id);
  assert.ok(found);
  assert.equal(found.id, employee.id);
  assert.equal(found.tenantId, tenant.id);
  assert.equal(found.employeeNumber, "EMP-1001");
  assert.equal(found.firstName, "Jane");
  assert.equal(found.lastName, "Doe");
  assert.equal(found.email, "jane.doe@acme.com");
  assert.equal(found.hireDate, "2026-01-15");
  assert.equal(found.employmentStatus, "active");
  assert.equal(found.employmentType, "full_time");
});

test("PostgresEmployeeRepository — tenant isolation prevents cross-tenant access", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const repo = new PostgresEmployeeRepository(db);

  const tenantA = await tenants.create({ name: "Tenant A", slug: "tenant-a" });
  const tenantB = await tenants.create({ name: "Tenant B", slug: "tenant-b" });

  const empA = Employee.create({
    tenantId: tenantA.id,
    employeeNumber: "EMP-2001",
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@tenant-a.com",
    hireDate: "2026-02-01",
    employmentType: "full_time",
  });

  await repo.save(empA);

  // Tenant B cannot access Tenant A's employee
  assert.equal(await repo.findById(tenantB.id, empA.id), null);
  assert.equal(await repo.findByEmployeeNumber(tenantB.id, "EMP-2001"), null);
  assert.equal(await repo.findByEmail(tenantB.id, "alice@tenant-a.com"), null);
  assert.equal(await repo.exists(tenantB.id, empA.id), false);

  const tenantBList = await repo.list(tenantB.id);
  assert.equal(tenantBList.length, 0);

  const tenantBCount = await repo.count(tenantB.id);
  assert.equal(tenantBCount, 0);

  // Tenant B cannot delete Tenant A's employee
  const deleteResult = await repo.delete(tenantB.id, empA.id);
  assert.equal(deleteResult, false);

  // Tenant A can access
  assert.ok(await repo.findById(tenantA.id, empA.id));
});

test("PostgresEmployeeRepository — enforces unique employeeNumber and email per tenant", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const repo = new PostgresEmployeeRepository(db);

  const tenantA = await tenants.create({ name: "Tenant A", slug: "tenant-a" });
  const tenantB = await tenants.create({ name: "Tenant B", slug: "tenant-b" });

  const emp1 = Employee.create({
    tenantId: tenantA.id,
    employeeNumber: "EMP-3001",
    firstName: "Bob",
    lastName: "Jones",
    email: "bob@tenant-a.com",
    hireDate: "2026-03-01",
    employmentType: "full_time",
  });

  await repo.save(emp1);

  // Duplicate employee number in same tenant throws EmployeeDomainError
  const empDuplicateNumber = Employee.create({
    tenantId: tenantA.id,
    employeeNumber: "EMP-3001",
    firstName: "Robert",
    lastName: "Jones",
    email: "robert@tenant-a.com",
    hireDate: "2026-03-01",
    employmentType: "full_time",
  });

  await assert.rejects(
    () => repo.save(empDuplicateNumber),
    (err: unknown) =>
      err instanceof EmployeeDomainError &&
      err.message.includes("Employee number [EMP-3001] already exists")
  );

  // Duplicate email in same tenant throws EmployeeDomainError
  const empDuplicateEmail = Employee.create({
    tenantId: tenantA.id,
    employeeNumber: "EMP-3002",
    firstName: "Bobby",
    lastName: "Jones",
    email: "bob@tenant-a.com",
    hireDate: "2026-03-01",
    employmentType: "full_time",
  });

  await assert.rejects(
    () => repo.save(empDuplicateEmail),
    (err: unknown) =>
      err instanceof EmployeeDomainError &&
      err.message.includes("Employee email [bob@tenant-a.com] already exists")
  );

  // Same employee number and email in DIFFERENT tenant is allowed
  const empOtherTenant = Employee.create({
    tenantId: tenantB.id,
    employeeNumber: "EMP-3001",
    firstName: "Bob",
    lastName: "Jones",
    email: "bob@tenant-a.com",
    hireDate: "2026-03-01",
    employmentType: "full_time",
  });

  await repo.save(empOtherTenant);
  assert.ok(await repo.findById(tenantB.id, empOtherTenant.id));
});

test("PostgresEmployeeRepository — handles filtering, pagination, and count", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const repo = new PostgresEmployeeRepository(db);

  const tenant = await tenants.create({ name: "Acme Corp", slug: "acme-corp" });

  const emp1 = Employee.create({
    tenantId: tenant.id,
    employeeNumber: "EMP-4001",
    firstName: "Charlie",
    lastName: "Brown",
    email: "charlie@acme.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
  });

  const emp2 = Employee.create({
    tenantId: tenant.id,
    employeeNumber: "EMP-4002",
    firstName: "Diana",
    lastName: "Prince",
    email: "diana@acme.com",
    hireDate: "2026-02-01",
    employmentType: "part_time",
  });

  await repo.save(emp1);
  await repo.save(emp2);

  // Filter by status
  const activeList = await repo.list(tenant.id, { employmentStatus: "active" });
  assert.equal(activeList.length, 2);

  const activeCount = await repo.count(tenant.id, { employmentStatus: "active" });
  assert.equal(activeCount, 2);

  // Filter by search
  const searchDiana = await repo.list(tenant.id, { search: "diana" });
  assert.equal(searchDiana.length, 1);
  assert.equal(searchDiana[0].firstName, "Diana");

  // Pagination (limit/offset)
  const paginated = await repo.list(tenant.id, { limit: 1, offset: 0 });
  assert.equal(paginated.length, 1);

  // Count total
  assert.equal(await repo.count(tenant.id), 2);
});

test("PostgresEmployeeRepository — updates aggregate state on save", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const repo = new PostgresEmployeeRepository(db);

  const tenant = await tenants.create({ name: "Acme Corp", slug: "acme-corp" });

  const employee = Employee.create({
    tenantId: tenant.id,
    employeeNumber: "EMP-5001",
    firstName: "Evan",
    lastName: "Wright",
    email: "evan@acme.com",
    hireDate: "2026-01-10",
    employmentType: "full_time",
  });

  await repo.save(employee);

  // Mutate aggregate state
  employee.updateProfile({ firstName: "Evander", lastName: "Wright-Smith" });
  employee.suspend("Routine audit");

  await repo.save(employee);

  const updated = await repo.findById(tenant.id, employee.id);
  assert.ok(updated);
  assert.equal(updated.firstName, "Evander");
  assert.equal(updated.lastName, "Wright-Smith");
  assert.equal(updated.employmentStatus, "suspended");
});

test("PostgresEmployeeRepository — supports getManagerNode and circular hierarchy validation", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const repo = new PostgresEmployeeRepository(db);

  const tenant = await tenants.create({ name: "Acme Corp", slug: "acme-corp" });

  const manager = Employee.create({
    tenantId: tenant.id,
    employeeNumber: "MGR-001",
    firstName: "Fiona",
    lastName: "Gallagher",
    email: "fiona@acme.com",
    hireDate: "2025-01-01",
    employmentType: "full_time",
  });

  const worker = Employee.create({
    tenantId: tenant.id,
    employeeNumber: "WRK-001",
    firstName: "George",
    lastName: "Clark",
    email: "george@acme.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
  });

  await repo.save(manager);

  // Assign manager to worker and save worker
  worker.assignManager(manager.id);
  await repo.save(worker);

  const managerNode = await repo.getManagerNode(tenant.id, worker.id);
  assert.ok(managerNode);
  assert.equal(managerNode.employeeId, worker.id);
  assert.equal(managerNode.managerId, manager.id);
  assert.equal(managerNode.employmentStatus, "active");

  // Validate hierarchy traversal using repo as provider
  const validationResult = await validateManagerHierarchy({
    tenantId: tenant.id,
    employeeId: worker.id,
    proposedManagerId: manager.id,
    provider: repo,
  });

  assert.equal(validationResult.valid, true);
  assert.deepEqual(validationResult.traversedPath, [manager.id]);
});

test("PostgresEmployeeRepository — deletes employee record within tenant scope", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const repo = new PostgresEmployeeRepository(db);

  const tenant = await tenants.create({ name: "Acme Corp", slug: "acme-corp" });

  const employee = Employee.create({
    tenantId: tenant.id,
    employeeNumber: "EMP-6001",
    firstName: "Hannah",
    lastName: "Abbott",
    email: "hannah@acme.com",
    hireDate: "2026-04-01",
    employmentType: "full_time",
  });

  await repo.save(employee);
  assert.equal(await repo.exists(tenant.id, employee.id), true);

  const deleted = await repo.delete(tenant.id, employee.id);
  assert.equal(deleted, true);

  assert.equal(await repo.exists(tenant.id, employee.id), false);
  assert.equal(await repo.findById(tenant.id, employee.id), null);
});
