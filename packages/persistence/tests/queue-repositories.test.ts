import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { QueueService } from "@adminops/queue";
import {
  PostgresQueueConfigurationRepository,
  PostgresQueueEntryRepository,
  PostgresQueueEventRepository,
  PostgresTenantRepository,
  runMigrations,
  schema,
  type Database,
} from "../src/index.js";

async function database(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  await runMigrations(db);
  // Queue repository tests isolate queue persistence itself. Branch/service ownership is
  // validated by their own repository suites and the production migration retains all FKs.
  for (const [table, constraints] of Object.entries({
    queue_configurations: ["queue_configurations_branch_id_fkey", "queue_configurations_service_id_fkey", "queue_configurations_department_id_fkey"],
    queue_entries: ["queue_entries_branch_id_fkey", "queue_entries_service_id_fkey", "queue_entries_department_id_fkey", "queue_entries_appointment_id_fkey"],
    queue_events: ["queue_events_branch_id_fkey", "queue_events_service_id_fkey"],
    queue_ticket_sequences: ["queue_ticket_sequences_branch_id_fkey", "queue_ticket_sequences_service_id_fkey"],
  })) {
    for (const constraint of constraints) await db.execute(sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`));
  }
  return db;
}

const BRANCH = "00000000-0000-4000-8000-000000000101";
const SERVICE = "00000000-0000-4000-8000-000000000201";

test("Postgres Queue repositories persist configuration, daily ticket sequencing and lifecycle", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const tenant = await tenants.create({ name: "Queue Persistence", slug: "queue-persistence" });
  const configurations = new PostgresQueueConfigurationRepository(db);
  const entries = new PostgresQueueEntryRepository(db);
  const events = new PostgresQueueEventRepository(db);
  const service = new QueueService(configurations, entries, events);

  const configuration = await service.createConfiguration({
    tenantId: tenant.id,
    actorUserId: "00000000-0000-4000-8000-000000000001",
    branchId: BRANCH,
    serviceId: SERVICE,
    prefix: "DB",
    averageServiceMinutes: 12,
  });
  assert.equal((await configurations.findById(tenant.id, configuration.id))?.prefix, "DB");

  const first = await service.checkInWalkIn({ tenantId: tenant.id, branchId: BRANCH, serviceId: SERVICE, idempotencyKey: "terminal-1:001" });
  const duplicate = await service.checkInWalkIn({ tenantId: tenant.id, branchId: BRANCH, serviceId: SERVICE, idempotencyKey: "terminal-1:001" });
  const second = await service.checkInWalkIn({ tenantId: tenant.id, branchId: BRANCH, serviceId: SERVICE, priority: "PRIORITY" });
  assert.equal(first.id, duplicate.id);
  assert.equal(first.ticketNumber, "DB001");
  assert.equal(second.ticketNumber, "DB002");

  const called = await service.callNext({ tenantId: tenant.id, branchId: BRANCH, serviceId: SERVICE, stationId: "desk-1", actorUserId: "00000000-0000-4000-8000-000000000002" });
  assert.equal(called?.id, second.id);
  await service.startService({ tenantId: tenant.id, id: second.id, actorUserId: "00000000-0000-4000-8000-000000000002" });
  await service.complete({ tenantId: tenant.id, id: second.id, actorUserId: "00000000-0000-4000-8000-000000000002" });
  assert.equal((await entries.findById(tenant.id, second.id))?.status, "COMPLETED");

  const replay = await events.listAfter(tenant.id, 0);
  assert.deepEqual(replay.map((event) => event.sequence), replay.map((event) => event.sequence).sort((a, b) => a - b));
  assert.ok(replay.some((event) => event.type === "COMPLETED"));
  await runMigrations(db);
  assert.equal((await entries.findById(tenant.id, first.id))?.ticketNumber, "DB001");
});

test("Postgres Queue event replay is tenant isolated and sequence filters reconnect correctly", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const alpha = await tenants.create({ name: "Alpha Queue DB", slug: "alpha-queue-db" });
  const beta = await tenants.create({ name: "Beta Queue DB", slug: "beta-queue-db" });
  const configRepo = new PostgresQueueConfigurationRepository(db);
  const entryRepo = new PostgresQueueEntryRepository(db);
  const eventRepo = new PostgresQueueEventRepository(db);
  const service = new QueueService(configRepo, entryRepo, eventRepo);

  for (const tenantId of [alpha.id, beta.id]) {
    await service.createConfiguration({ tenantId, actorUserId: "00000000-0000-4000-8000-000000000001", branchId: BRANCH, serviceId: SERVICE, prefix: tenantId === alpha.id ? "A" : "B" });
    await service.checkInWalkIn({ tenantId, branchId: BRANCH, serviceId: SERVICE });
  }

  const alphaEvents = await eventRepo.listAfter(alpha.id, 0);
  const betaEvents = await eventRepo.listAfter(beta.id, 0);
  assert.equal(alphaEvents.length, 1);
  assert.equal(betaEvents.length, 1);
  assert.equal(alphaEvents[0]?.sequence, 1);
  assert.equal(betaEvents[0]?.sequence, 1);
  assert.deepEqual(await eventRepo.listAfter(alpha.id, 1), []);
  assert.equal(await entryRepo.findById(beta.id, (await entryRepo.listByBranch(alpha.id, BRANCH))[0]!.id), null);
});
