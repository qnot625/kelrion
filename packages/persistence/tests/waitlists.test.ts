import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import {
  InMemoryWaitlistRepository,
  type WaitlistEntry,
} from "@adminops/branch-flow";
import type { Database } from "../src/database.js";
import { splitSqlStatements } from "../src/connect.js";
import * as schema from "../src/schema.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";
import { PostgresBranchRepository } from "../src/postgres-branch-repository.js";
import { PostgresServiceRepository } from "../src/postgres-service-repository.js";
import { PostgresWaitlistRepository } from "../src/postgres-waitlist-repository.js";

async function freshDatabase(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  const migrationPath = fileURLToPath(new URL("../migrations/0001_initial.sql", import.meta.url));
  for (const statement of splitSqlStatements(await readFile(migrationPath, "utf8"))) {
    await db.execute(sql.raw(statement));
  }
  return db;
}

test("InMemoryWaitlistRepository preserves FIFO queue ordering, sequence calculation, and tenant isolation", async () => {
  const repo = new InMemoryWaitlistRepository();
  const tenant1 = "t1-uuid";
  const tenant2 = "t2-uuid";
  const branch1 = "b1-uuid";
  const service1 = "s1-uuid";

  // Sequence calculation
  const pos1 = await repo.getNextPosition(tenant1, branch1, service1);
  assert.equal(pos1, 1);

  const entry1: WaitlistEntry = {
    id: "wait-1",
    tenantId: tenant1,
    branchId: branch1,
    serviceId: service1,
    customerEmail: "alice@example.com",
    customerMetadata: { name: "Alice" },
    queuePosition: pos1,
    createdAt: new Date("2026-08-01T10:00:00Z"),
    updatedAt: new Date("2026-08-01T10:00:00Z"),
  };
  await repo.save(entry1);

  const pos2 = await repo.getNextPosition(tenant1, branch1, service1);
  assert.equal(pos2, 2);

  const entry2: WaitlistEntry = {
    id: "wait-2",
    tenantId: tenant1,
    branchId: branch1,
    serviceId: service1,
    customerEmail: "bob@example.com",
    customerMetadata: { name: "Bob" },
    queuePosition: pos2,
    createdAt: new Date("2026-08-01T10:05:00Z"),
    updatedAt: new Date("2026-08-01T10:05:00Z"),
  };
  await repo.save(entry2);

  // List and FIFO verify
  const queue = await repo.listQueue(tenant1, branch1, service1);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].id, "wait-1");
  assert.equal(queue[1].id, "wait-2");

  // Get next in queue
  const next = await repo.getNextInQueue(tenant1, branch1, service1);
  assert.ok(next);
  assert.equal(next.id, "wait-1");

  // Find by ID and tenant isolation
  const found = await repo.findById(tenant1, "wait-1");
  assert.ok(found);
  assert.equal(found.customerEmail, "alice@example.com");

  const isolatedFound = await repo.findById(tenant2, "wait-1");
  assert.equal(isolatedFound, undefined);

  // Delete
  await repo.delete(tenant1, "wait-1");
  const queueAfterDelete = await repo.listQueue(tenant1, branch1, service1);
  assert.equal(queueAfterDelete.length, 1);
  assert.equal(queueAfterDelete[0].id, "wait-2");
});

test("PostgresWaitlistRepository works against real Postgres, preserves FIFO, sequence calculation, and tenant isolation", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const branches = new PostgresBranchRepository(db);
  const services = new PostgresServiceRepository(db);
  const repo = new PostgresWaitlistRepository(db);

  // Set up 2 tenants
  const t1 = await tenants.create({ name: "Tenant 1", slug: "t1" });
  const t2 = await tenants.create({ name: "Tenant 2", slug: "t2" });

  // Set up branches
  const b1 = await branches.createBranch({
    tenantId: t1.id,
    slug: "b1",
    name: "Branch 1",
    status: "active",
    address: "123 Main St",
    latitude: 40.7128,
    longitude: -74.006,
  });

  await branches.createBranch({
    tenantId: t2.id,
    slug: "b2",
    name: "Branch 2",
    status: "active",
    address: "456 Side St",
    latitude: 34.0522,
    longitude: -118.2437,
  });

  // Set up services
  const s1 = await services.createService({
    tenantId: t1.id,
    code: "s1",
    name: "Service 1",
    description: "First service",
    durationMinutes: 30,
    status: "active",
  });

  await services.createService({
    tenantId: t2.id,
    code: "s2",
    name: "Service 2",
    description: "Second service",
    durationMinutes: 60,
    status: "active",
  });

  // Calculate sequence
  const pos1 = await repo.getNextPosition(t1.id, b1.id, s1.service.id);
  assert.equal(pos1, 1);

  const entry1: WaitlistEntry = {
    id: "00000000-0000-0000-0000-000000000001",
    tenantId: t1.id,
    branchId: b1.id,
    serviceId: s1.service.id,
    customerEmail: "alice@t1.com",
    customerMetadata: { name: "Alice" },
    queuePosition: pos1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await repo.save(entry1);

  const pos2 = await repo.getNextPosition(t1.id, b1.id, s1.service.id);
  assert.equal(pos2, 2);

  const entry2: WaitlistEntry = {
    id: "00000000-0000-0000-0000-000000000002",
    tenantId: t1.id,
    branchId: b1.id,
    serviceId: s1.service.id,
    customerEmail: "bob@t1.com",
    customerMetadata: { name: "Bob" },
    queuePosition: pos2,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await repo.save(entry2);

  // List and FIFO verify
  const queue = await repo.listQueue(t1.id, b1.id, s1.service.id);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].id, "00000000-0000-0000-0000-000000000001");
  assert.equal(queue[1].id, "00000000-0000-0000-0000-000000000002");

  // Get next in queue
  const next = await repo.getNextInQueue(t1.id, b1.id, s1.service.id);
  assert.ok(next);
  assert.equal(next.id, "00000000-0000-0000-0000-000000000001");

  // Find by ID and tenant isolation
  const found = await repo.findById(t1.id, "00000000-0000-0000-0000-000000000001");
  assert.ok(found);
  assert.equal(found.customerEmail, "alice@t1.com");

  const isolatedFound = await repo.findById(t2.id, "00000000-0000-0000-0000-000000000001");
  assert.equal(isolatedFound, undefined);

  // Delete
  await repo.delete(t1.id, "00000000-0000-0000-0000-000000000001");
  const queueAfterDelete = await repo.listQueue(t1.id, b1.id, s1.service.id);
  assert.equal(queueAfterDelete.length, 1);
  assert.equal(queueAfterDelete[0].id, "00000000-0000-0000-0000-000000000002");
});
