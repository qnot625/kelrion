import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { DuplicateTenantSlugError } from "@adminops/tenancy";
import { DuplicateUserEmailError } from "@adminops/identity";
import { AppointmentService } from "@adminops/branch-flow";
import { verifyChainIntegrity } from "@adminops/audit";
import {
  DuplicateBranchSlugError,
  InvalidCoordinateError,
  InvalidOperatingWindowError,
} from "@adminops/branch-flow";
import type { Database } from "../src/database.js";
import { splitSqlStatements } from "../src/connect.js";
import * as schema from "../src/schema.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";
import { PostgresUserRepository } from "../src/postgres-user-repository.js";
import { PostgresAppointmentRepository } from "../src/postgres-appointment-repository.js";
import { PostgresAuditLog } from "../src/postgres-audit-log.js";
import { PostgresBranchRepository } from "../src/postgres-branch-repository.js";
import { PostgresServiceRepository } from "../src/postgres-service-repository.js";

/** Spins up a real Postgres (PGlite/WASM) with the migration applied. */
async function freshDatabase(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  const migrationPath = fileURLToPath(new URL("../migrations/0001_initial.sql", import.meta.url));
  for (const statement of splitSqlStatements(await readFile(migrationPath, "utf8"))) {
    await db.execute(sql.raw(statement));
  }
  return db;
}

test("persists a tenant and enforces slug uniqueness in the database", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);

  const created = await tenants.create({ name: "Acme Clinics", slug: "acme-clinics" });
  assert.equal(created.status, "active");
  assert.ok(created.id);

  assert.deepEqual(await tenants.findBySlug("acme-clinics"), created);
  assert.deepEqual(await tenants.findById(created.id), created);

  await assert.rejects(
    () => tenants.create({ name: "Acme Again", slug: "acme-clinics" }),
    DuplicateTenantSlugError,
  );
});

test("persists users scoped per tenant, with the same email allowed across tenants", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);

  const acme = await tenants.create({ name: "Acme Clinics", slug: "acme-clinics" });
  const beta = await tenants.create({ name: "Beta Health", slug: "beta-health" });

  assert.equal(await users.hasAnyForTenant(acme.id), false);

  const owner = await users.create({
    tenantId: acme.id,
    email: "Owner@Acme.com",
    passwordHash: "hash",
    roles: ["owner"],
  });
  assert.equal(owner.email, "owner@acme.com");
  assert.deepEqual(owner.roles, ["owner"]);
  assert.equal(await users.hasAnyForTenant(acme.id), true);
  assert.equal(await users.hasAnyForTenant(beta.id), false);

  await assert.rejects(
    () => users.create({ tenantId: acme.id, email: "owner@acme.com", passwordHash: "hash" }),
    DuplicateUserEmailError,
  );

  const sameEmailOtherTenant = await users.create({
    tenantId: beta.id,
    email: "owner@acme.com",
    passwordHash: "hash",
  });
  assert.ok(sameEmailOtherTenant.id);

  assert.deepEqual(await users.findByEmail(acme.id, "owner@acme.com"), owner);
  assert.equal(await users.findById(beta.id, owner.id), undefined);
});

test("lists users per tenant and updates roles, scoped to the owning tenant", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);

  const acme = await tenants.create({ name: "Acme Clinics", slug: "acme-clinics" });
  const beta = await tenants.create({ name: "Beta Health", slug: "beta-health" });

  const owner = await users.create({
    tenantId: acme.id,
    email: "owner@acme.com",
    passwordHash: "hash",
    roles: ["owner"],
  });
  await users.create({
    tenantId: acme.id,
    email: "member@acme.com",
    passwordHash: "hash",
    roles: ["member"],
  });
  await users.create({
    tenantId: beta.id,
    email: "owner@beta.com",
    passwordHash: "hash",
    roles: ["owner"],
  });

  const acmeUsers = await users.listByTenant(acme.id);
  assert.deepEqual(
    acmeUsers.map((user) => user.email).sort(),
    ["member@acme.com", "owner@acme.com"],
    "listByTenant must not leak other tenants' users",
  );
  assert.equal((await users.listByTenant(beta.id)).length, 1);

  const updated = await users.updateRoles(acme.id, owner.id, ["staff"]);
  assert.deepEqual(updated?.roles, ["staff"]);
  assert.deepEqual((await users.findById(acme.id, owner.id))?.roles, ["staff"], "must persist");

  // A user from another tenant is not addressable, even with a valid id.
  assert.equal(await users.updateRoles(beta.id, owner.id, ["owner"]), undefined);
  assert.deepEqual((await users.findById(acme.id, owner.id))?.roles, ["staff"], "must be unchanged");
});

test("persists appointment state transitions and isolates them per tenant", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);
  const services = new PostgresServiceRepository(db);

  const acme = await tenants.create({ name: "Acme Clinics", slug: "acme-clinics" });
  const beta = await tenants.create({ name: "Beta Health", slug: "beta-health" });

  const appointments = new AppointmentService(
    new PostgresAppointmentRepository(db),
    branches,
    services
  );

  // Set up branch for Acme
  const branch = await branches.createBranch({
    tenantId: acme.id,
    slug: "acme-downtown",
    name: "Acme Downtown",
    status: "active",
    address: "123 Main St",
    latitude: 51.5,
    longitude: -0.1,
  });

  // Set operating windows for Saturday (dayOfWeek 6)
  await branches.setOperatingWindows(branch.id, [
    { dayOfWeek: 6, openMinutes: 480, closeMinutes: 1020 }, // 08:00 to 17:00
  ]);

  // Create department with capacity 5
  await branches.createDepartment({
    tenantId: acme.id,
    branchId: branch.id,
    name: "General Practice",
    slug: "general-practice",
    capacity: 5,
  });

  // Create service
  const service = await services.createService({
    tenantId: acme.id,
    code: "GP-CONSULT",
    name: "General consultation",
    description: "General consultation",
    durationMinutes: 30,
    status: "active",
  });

  // Assign service to branch
  await services.assignServiceToBranch(acme.id, branch.id, service.service.id);

  const booked = await appointments.book({
    tenantId: acme.id,
    branchId: branch.id,
    serviceId: service.service.id,
    customerEmail: "patient@example.com",
    startAt: new Date("2026-08-01T09:00:00Z"),
    endAt: new Date("2026-08-01T09:30:00Z"),
  });
  assert.equal(booked.status, "booked");

  const checkedIn = await appointments.checkIn(acme.id, booked.id);
  assert.equal(checkedIn.status, "checked_in");

  const completed = await appointments.complete(acme.id, booked.id);
  assert.equal(completed.status, "completed");

  const reloaded = await appointments.list(acme.id);
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0]!.status, "completed");

  assert.deepEqual(await appointments.list(beta.id), []);
});

test("persists a hash-chained audit trail that verifies end to end", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const acme = await tenants.create({ name: "Acme Clinics", slug: "acme-clinics" });
  const auditLog = new PostgresAuditLog(db);

  const first = await auditLog.record({
    tenantId: acme.id,
    actorUserId: null,
    action: "tenant.created",
    targetType: "tenant",
    targetId: acme.id,
    metadata: { slug: acme.slug },
  });
  assert.equal(first.previousHash, null);

  const second = await auditLog.record({
    tenantId: acme.id,
    actorUserId: null,
    action: "appointment.booked",
    targetType: "appointment",
    targetId: "appt-1",
  });
  assert.equal(second.previousHash, first.hash);

  const events = await auditLog.listByTenant(acme.id);
  assert.equal(events.length, 2);
  assert.equal(verifyChainIntegrity(events), true);
});

test("persists branches, validates coordinates, and enforces slug uniqueness per tenant", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);

  const tenantA = await tenants.create({ name: "Tenant A", slug: "tenant-a" });
  const tenantB = await tenants.create({ name: "Tenant B", slug: "tenant-b" });

  // 1. Successful creation
  const branch1 = await branches.createBranch({
    tenantId: tenantA.id,
    slug: "london-central",
    name: "London Central",
    status: "active",
    address: "1 Oxford St",
    latitude: 51.515,
    longitude: -0.141,
  });
  assert.ok(branch1.id);
  assert.equal(branch1.name, "London Central");

  // 2. Validate latitude boundaries
  await assert.rejects(
    () =>
      branches.createBranch({
        tenantId: tenantA.id,
        slug: "invalid-lat",
        name: "Invalid Lat",
        status: "active",
        address: "Nowhere",
        latitude: 91.0,
        longitude: 0.0,
      }),
    InvalidCoordinateError,
  );

  // 3. Validate longitude boundaries
  await assert.rejects(
    () =>
      branches.createBranch({
        tenantId: tenantA.id,
        slug: "invalid-lng",
        name: "Invalid Lng",
        status: "active",
        address: "Nowhere",
        latitude: 0.0,
        longitude: -181.0,
      }),
    InvalidCoordinateError,
  );

  // 4. Enforce slug uniqueness under the same tenant
  await assert.rejects(
    () =>
      branches.createBranch({
        tenantId: tenantA.id,
        slug: "london-central",
        name: "London Duplicate",
        status: "active",
        address: "2 Oxford St",
        latitude: 51.515,
        longitude: -0.141,
      }),
    DuplicateBranchSlugError,
  );

  // 5. Allow identical slug under a different tenant
  const branchOtherTenant = await branches.createBranch({
    tenantId: tenantB.id,
    slug: "london-central",
    name: "London Central (B)",
    status: "active",
    address: "B-Street",
    latitude: 51.515,
    longitude: -0.141,
  });
  assert.ok(branchOtherTenant.id);
  assert.notEqual(branchOtherTenant.id, branch1.id);
});

test("manages operating windows and validates timing limits", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);

  const tenant = await tenants.create({ name: "Tenant A", slug: "tenant-a" });
  const branch = await branches.createBranch({
    tenantId: tenant.id,
    slug: "manchester",
    name: "Manchester",
    status: "active",
    address: "Manchester Piccadilly",
    latitude: 53.480,
    longitude: -2.242,
  });

  // 1. Set valid operating hours
  const windows = [
    { dayOfWeek: 1, openMinutes: 480, closeMinutes: 1020 }, // 08:00 to 17:00
    { dayOfWeek: 2, openMinutes: 480, closeMinutes: 1020 },
  ];
  await branches.setOperatingWindows(branch.id, windows);

  const loaded = await branches.getOperatingWindows(branch.id);
  assert.equal(loaded.length, 2);
  assert.equal(loaded[0]!.dayOfWeek, 1);
  assert.equal(loaded[0]!.openMinutes, 480);
  assert.equal(loaded[0]!.closeMinutes, 1020);

  // 2. Reject overnight window: closeMinutes must be > openMinutes
  await assert.rejects(
    () =>
      branches.setOperatingWindows(branch.id, [
        { dayOfWeek: 3, openMinutes: 1320, closeMinutes: 120 }, // 22:00 to 02:00
      ]),
    InvalidOperatingWindowError,
  );

  // 3. Reject timing outside 24h: closeMinutes cannot exceed 1440
  await assert.rejects(
    () =>
      branches.setOperatingWindows(branch.id, [
        { dayOfWeek: 4, openMinutes: 0, closeMinutes: 1441 },
      ]),
    InvalidOperatingWindowError,
  );
});

test("manages holidays and supports tenant-wide nullable branch schedules", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);

  const tenant = await tenants.create({ name: "Tenant A", slug: "tenant-a" });
  const branch = await branches.createBranch({
    tenantId: tenant.id,
    slug: "bristol",
    name: "Bristol",
    status: "active",
    address: "Bristol Temple Meads",
    latitude: 51.449,
    longitude: -2.581,
  });

  const startAt = new Date("2026-12-25T00:00:00Z");
  const endAt = new Date("2026-12-26T23:59:59Z");

  // 1. Add branch-specific holiday
  const holiday1 = await branches.addHoliday({
    tenantId: tenant.id,
    branchId: branch.id,
    name: "Christmas Shutdown",
    startAt,
    endAt,
  });
  assert.ok(holiday1.id);
  assert.equal(holiday1.branchId, branch.id);

  // 2. Add tenant-wide holiday (nullable branchId)
  const holiday2 = await branches.addHoliday({
    tenantId: tenant.id,
    branchId: null,
    name: "National Bank Holiday",
    startAt,
    endAt,
  });
  assert.ok(holiday2.id);
  assert.equal(holiday2.branchId, null);

  // 3. Get holidays for branch
  const bristolHolidays = await branches.getHolidays(tenant.id, branch.id);
  assert.equal(bristolHolidays.length, 2); // includes both branch-specific and tenant-wide

  // 4. Get only tenant-wide holidays
  const tenantWideOnly = await branches.getHolidays(tenant.id, null);
  assert.equal(tenantWideOnly.length, 1);
  assert.equal(tenantWideOnly[0]!.branchId, null);

  // 5. Remove holiday
  await branches.removeHoliday(holiday1.id, tenant.id);
  const remaining = await branches.getHolidays(tenant.id, branch.id);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.id, holiday2.id);
});

test("enforces automatic cascade deletion on tenant and branch removals", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);

  const tenant = await tenants.create({ name: "Tenant A", slug: "tenant-a" });
  const branch = await branches.createBranch({
    tenantId: tenant.id,
    slug: "cascade-test",
    name: "Cascade Test",
    status: "active",
    address: "Test Rd",
    latitude: 0.0,
    longitude: 0.0,
  });

  // Setup operating windows and holidays
  await branches.setOperatingWindows(branch.id, [
    { dayOfWeek: 1, openMinutes: 500, closeMinutes: 1000 },
  ]);
  await branches.addHoliday({
    tenantId: tenant.id,
    branchId: branch.id,
    name: "One Day Off",
    startAt: new Date("2026-09-01T00:00:00Z"),
    endAt: new Date("2026-09-02T00:00:00Z"),
  });

  // Verify they exist
  assert.equal((await branches.getOperatingWindows(branch.id)).length, 1);
  assert.equal((await branches.getHolidays(tenant.id, branch.id)).length, 1);

  // Trigger cascade by deleting the tenant (which cascades to branches, windows, and holidays)
  await db.execute(sql.raw(`DELETE FROM tenants WHERE id = '${tenant.id}'`));

  // Verify everything is cleaned up
  const loadedBranches = await branches.getBranches(tenant.id);
  assert.equal(loadedBranches.length, 0);

  const loadedWindows = await branches.getOperatingWindows(branch.id);
  assert.equal(loadedWindows.length, 0);

  const loadedHolidays = await branches.getHolidays(tenant.id, branch.id);
  assert.equal(loadedHolidays.length, 0);
});

test("PostgresBranchRepository aggregates branch capacities with tenant isolation and service filtering", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);

  const t1 = await tenants.create({ name: "Tenant One", slug: "t1" });
  const t2 = await tenants.create({ name: "Tenant Two", slug: "t2" });

  const b1 = await branches.createBranch({
    tenantId: t1.id,
    slug: "b1",
    name: "Branch 1",
    status: "active",
    address: "123 St",
    latitude: 10,
    longitude: 20,
  });

  const b2 = await branches.createBranch({
    tenantId: t1.id,
    slug: "b2",
    name: "Branch 2",
    status: "active",
    address: "456 St",
    latitude: 15,
    longitude: 25,
  });

  await branches.createDepartment({
    tenantId: t1.id,
    branchId: b1.id,
    name: "Triage",
    slug: "triage",
    capacity: 8,
  });

  const aggregates = await branches.getBranchCapacityAggregates(t1.id);
  assert.equal(aggregates.length, 2);

  const b1Agg = aggregates.find((a) => a.branchId === b1.id);
  assert.ok(b1Agg);
  assert.equal(b1Agg.totalCapacity, 8);

  const b2Agg = aggregates.find((a) => a.branchId === b2.id);
  assert.ok(b2Agg);
  assert.equal(b2Agg.totalCapacity, 0);

  const t2Aggregates = await branches.getBranchCapacityAggregates(t2.id);
  assert.equal(t2Aggregates.length, 0);
});
