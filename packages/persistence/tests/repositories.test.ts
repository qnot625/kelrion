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
import type { Database } from "../src/database.js";
import { splitSqlStatements } from "../src/connect.js";
import * as schema from "../src/schema.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";
import { PostgresUserRepository } from "../src/postgres-user-repository.js";
import { PostgresAppointmentRepository } from "../src/postgres-appointment-repository.js";
import { PostgresAuditLog } from "../src/postgres-audit-log.js";

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
  const acme = await tenants.create({ name: "Acme Clinics", slug: "acme-clinics" });
  const beta = await tenants.create({ name: "Beta Health", slug: "beta-health" });

  const appointments = new AppointmentService(new PostgresAppointmentRepository(db));

  const booked = await appointments.book({
    tenantId: acme.id,
    customerEmail: "patient@example.com",
    serviceName: "General consultation",
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
