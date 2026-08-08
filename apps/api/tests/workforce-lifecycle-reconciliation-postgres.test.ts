import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { EmployeeService } from "@adminops/workforce-core";
import {
  PostgresEmployeeRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
  runMigrations,
  schema,
  type Database,
} from "@adminops/persistence";
import {
  PostgresWorkforceLifecycleRepository,
  WorkforceLifecycleService,
} from "../src/domains/workforce-lifecycle/index.js";

async function freshDatabase(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  await runMigrations(db);
  return db;
}

test("employee-linked leave and employee-first lifecycle plans persist in Postgres", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);
  const employeeRepository = new PostgresEmployeeRepository(db);
  const employeeService = new EmployeeService(employeeRepository);
  const lifecycleRepository = new PostgresWorkforceLifecycleRepository(db);
  const lifecycle = new WorkforceLifecycleService(lifecycleRepository);

  const tenant = await tenants.create({ name: "Lifecycle Persistence", slug: "lifecycle-persistence" });
  const user = await users.create({
    tenantId: tenant.id,
    email: "member@lifecycle.test",
    passwordHash: "test-only-hash",
    roles: ["member"],
  });
  const linkedEmployee = await employeeService.create(tenant.id, null, {
    userId: user.id,
    employeeNumber: "EMP-100",
    firstName: "Amina",
    lastName: "Yusuf",
    email: "member@lifecycle.test",
    hireDate: "2026-01-15",
    employmentType: "full_time",
  });

  const leave = await lifecycle.submitLeave({
    tenantId: tenant.id,
    requesterUserId: user.id,
    requesterEmployeeId: linkedEmployee.id,
    type: "annual",
    startDate: new Date("2027-10-04T00:00:00.000Z"),
    endDate: new Date("2027-10-08T00:00:00.000Z"),
    reason: "Annual leave",
  });
  assert.equal(leave.requesterEmployeeId, linkedEmployee.id);

  const persistedLeave = await lifecycleRepository.findLeaveRequest(tenant.id, leave.id);
  assert.equal(persistedLeave?.requesterEmployeeId, linkedEmployee.id);
  assert.equal(persistedLeave?.requesterUserId, user.id);

  const unlinkedEmployee = await employeeService.create(tenant.id, null, {
    employeeNumber: "EMP-101",
    firstName: "Maya",
    lastName: "Okafor",
    email: "maya@lifecycle.test",
    hireDate: "2026-10-01",
    employmentType: "full_time",
  });
  const plan = await lifecycle.createLifecyclePlan({
    tenantId: tenant.id,
    subjectEmployeeId: unlinkedEmployee.id,
    subjectUserId: null,
    kind: "onboarding",
    createdByUserId: user.id,
  });
  assert.equal(plan.subjectEmployeeId, unlinkedEmployee.id);
  assert.equal(plan.subjectUserId, null);

  const persistedPlan = await lifecycleRepository.findLifecyclePlan(tenant.id, plan.id);
  assert.equal(persistedPlan?.subjectEmployeeId, unlinkedEmployee.id);
  assert.equal(persistedPlan?.subjectUserId, null);

  await runMigrations(db);
  assert.equal((await lifecycleRepository.findLeaveRequest(tenant.id, leave.id))?.requesterEmployeeId, linkedEmployee.id);
  assert.equal((await lifecycleRepository.findLifecyclePlan(tenant.id, plan.id))?.subjectEmployeeId, unlinkedEmployee.id);
});
