import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { AppointmentService, type WaitlistEntry } from "@adminops/branch-flow";
import type { Database } from "../src/database.js";
import * as schema from "../src/schema.js";
import { runMigrations } from "../src/connect.js";
import { PostgresAppointmentRepository } from "../src/postgres-appointment-repository.js";
import { PostgresBranchRepository } from "../src/postgres-branch-repository.js";
import { PostgresServiceRepository } from "../src/postgres-service-repository.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";
import { PostgresWaitlistRepository } from "../src/postgres-waitlist-repository.js";

async function fixture() {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);
  const services = new PostgresServiceRepository(db);
  const tenant = await tenants.create({ name: "Alpha", slug: "alpha" });
  const branch = await branches.createBranch({ tenantId: tenant.id, slug: "central", name: "Central", status: "active", address: "1 Main", latitude: 1, longitude: 1 });
  const created = await services.createService({ tenantId: tenant.id, code: "CONSULT", name: "Consult", durationMinutes: 30, status: "active" });
  await services.assignServiceToBranch(tenant.id, branch.id, created.service.id);
  await branches.createDepartment({ tenantId: tenant.id, branchId: branch.id, name: "Desk", slug: "desk", capacity: 1 });
  await branches.setOperatingWindows(branch.id, [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }]);
  const waitlists = new PostgresWaitlistRepository(db);
  return {
    tenant, branch, service: created.service, waitlists,
    scheduling: new AppointmentService(new PostgresAppointmentRepository(db), branches, services, waitlists),
  };
}

function entry(input: { tenantId: string; branchId: string; serviceId: string; position: number; email: string }): WaitlistEntry {
  const now = new Date();
  return {
    id: randomUUID(), tenantId: input.tenantId, branchId: input.branchId, serviceId: input.serviceId,
    customerEmail: input.email, customerMetadata: {}, desiredStartAt: null, desiredEndAt: null,
    queuePosition: input.position, status: "waiting", promotedAppointmentId: null, createdAt: now, updatedAt: now,
  };
}

test("persists FIFO waitlist order, status history and tenant isolation", async () => {
  const setup = await fixture();
  const first = entry({ tenantId: setup.tenant.id, branchId: setup.branch.id, serviceId: setup.service.id, position: 1, email: "first@example.com" });
  const second = entry({ tenantId: setup.tenant.id, branchId: setup.branch.id, serviceId: setup.service.id, position: 2, email: "second@example.com" });
  await setup.waitlists.save(second);
  await setup.waitlists.save(first);
  assert.deepEqual((await setup.waitlists.listQueue(setup.tenant.id, setup.branch.id, setup.service.id)).map((item) => item.customerEmail), ["first@example.com", "second@example.com"]);
  assert.equal(await setup.waitlists.getNextPosition(setup.tenant.id, setup.branch.id, setup.service.id), 3);
  await setup.waitlists.save({ ...first, status: "removed", updatedAt: new Date() });
  assert.equal((await setup.waitlists.findById(setup.tenant.id, first.id))?.status, "removed");
  assert.equal(await setup.waitlists.findById(randomUUID(), first.id), undefined);
});


test("Postgres scheduling reschedules and promotes a durable waitlist entry", async () => {
  const setup = await fixture();
  const booked = await setup.scheduling.book({
    tenantId: setup.tenant.id, branchId: setup.branch.id, serviceId: setup.service.id,
    customerEmail: "booked@example.com", startAt: new Date("2026-08-03T09:00:00Z"), endAt: new Date("2026-08-03T09:30:00Z"),
  });
  const waiting = await setup.scheduling.addToWaitlist({
    tenantId: setup.tenant.id, branchId: setup.branch.id, serviceId: setup.service.id,
    customerEmail: "waiting@example.com", desiredStartAt: new Date("2026-08-03T09:00:00Z"), desiredEndAt: new Date("2026-08-03T09:30:00Z"),
  });
  await setup.scheduling.reschedule({
    tenantId: setup.tenant.id, appointmentId: booked.id,
    startAt: new Date("2026-08-03T10:00:00Z"), endAt: new Date("2026-08-03T10:30:00Z"),
  });
  assert.equal((await setup.waitlists.findById(setup.tenant.id, waiting.id))?.status, "promoted");
  assert.equal((await setup.scheduling.list(setup.tenant.id)).filter((item) => item.status === "booked").length, 2);
});
