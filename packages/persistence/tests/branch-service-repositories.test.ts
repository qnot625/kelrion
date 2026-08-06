import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "../src/database.js";
import * as schema from "../src/schema.js";
import { runMigrations } from "../src/connect.js";
import { PostgresAppointmentRepository } from "../src/postgres-appointment-repository.js";
import { PostgresBranchRepository } from "../src/postgres-branch-repository.js";
import { PostgresServiceRepository } from "../src/postgres-service-repository.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";

async function freshDatabase(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  return db;
}

test("persists branch operations, calendars and departments with tenant isolation", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);
  const alpha = await tenants.create({ name: "Alpha", slug: "alpha" });
  const beta = await tenants.create({ name: "Beta", slug: "beta" });

  const branch = await branches.createBranch({
    tenantId: alpha.id,
    slug: "central",
    name: "Central",
    status: "active",
    address: "1 Main Street",
    latitude: 6.45,
    longitude: 3.4,
  });
  assert.ok(branch.id);
  assert.equal(await branches.getBranchById(branch.id, beta.id), null);

  await branches.setOperatingWindows(branch.id, [
    { dayOfWeek: 1, openMinutes: 480, closeMinutes: 1020 },
    { dayOfWeek: 2, openMinutes: 480, closeMinutes: 1020 },
  ]);
  assert.equal((await branches.getOperatingWindows(branch.id)).length, 2);

  const holiday = await branches.addHoliday({
    tenantId: alpha.id,
    branchId: branch.id,
    name: "Maintenance",
    startAt: new Date("2026-08-10T00:00:00Z"),
    endAt: new Date("2026-08-11T00:00:00Z"),
  });
  assert.ok(holiday.id);
  assert.equal((await branches.getHolidays(alpha.id, branch.id)).length, 1);
  assert.deepEqual(await branches.getHolidays(beta.id, branch.id), []);

  const department = await branches.createDepartment({
    tenantId: alpha.id,
    branchId: branch.id,
    name: "Reception",
    slug: "reception",
    capacity: 4,
  });
  const updated = await branches.updateDepartment(department.id, alpha.id, { capacity: 6 });
  assert.equal(updated.capacity, 6);
  assert.equal(await branches.getDepartmentById(department.id, beta.id), null);
});

test("persists services, requirements, branch mappings and branch-scoped capacity", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);
  const services = new PostgresServiceRepository(db);
  const tenant = await tenants.create({ name: "Alpha", slug: "alpha" });

  const first = await branches.createBranch({
    tenantId: tenant.id,
    slug: "first",
    name: "First",
    status: "active",
    address: "1 First Street",
    latitude: 6.45,
    longitude: 3.4,
  });
  const second = await branches.createBranch({
    tenantId: tenant.id,
    slug: "second",
    name: "Second",
    status: "active",
    address: "2 Second Street",
    latitude: 6.5,
    longitude: 3.45,
  });
  await branches.createDepartment({ tenantId: tenant.id, branchId: first.id, name: "Desk", slug: "desk", capacity: 2 });
  await branches.createDepartment({ tenantId: tenant.id, branchId: second.id, name: "Desk", slug: "desk", capacity: 5 });

  const created = await services.createService({
    tenantId: tenant.id,
    code: "CONSULT",
    name: "Consultation",
    durationMinutes: 30,
    status: "active",
  }, {
    photoIdRequired: true,
    minAge: 18,
    maxAge: null,
    requiredDocuments: ["Identity document"],
    customNotes: null,
  });
  assert.ok(created.service.id);
  assert.equal(created.requirement?.photoIdRequired, true);

  await services.assignServiceToBranch(tenant.id, first.id, created.service.id);
  await services.assignServiceToBranch(tenant.id, second.id, created.service.id);

  const appointments = new PostgresAppointmentRepository(db);
  const bookedAt = new Date("2026-08-01T08:00:00Z");
  await appointments.save({
    id: "00000000-0000-4000-8000-000000000001",
    tenantId: tenant.id,
    branchId: first.id,
    serviceId: created.service.id,
    customerEmail: "visitor@example.com",
    serviceName: created.service.name,
    customerMetadata: {},
    startAt: new Date("2026-08-20T09:00:00Z"),
    endAt: new Date("2026-08-20T09:30:00Z"),
    status: "booked",
    createdAt: bookedAt,
    updatedAt: bookedAt,
  });

  const aggregates = await branches.getBranchCapacityAggregates(tenant.id, created.service.id);
  assert.equal(aggregates.length, 2);
  assert.equal(aggregates.find((item) => item.branchId === first.id)?.activeBookingsCount, 1);
  assert.equal(aggregates.find((item) => item.branchId === second.id)?.activeBookingsCount, 0);
  assert.equal(aggregates.find((item) => item.branchId === second.id)?.totalCapacity, 5);
});
