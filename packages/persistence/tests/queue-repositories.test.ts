import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  QueueId,
  TicketId,
  TenantId,
  BranchId,
  QueuePriority,
  TicketStatus,
  Queue,
  QueueTicket,
} from "@klerion/queue";
import type { Database } from "../src/database.js";
import { runMigrations } from "../src/connect.js";
import * as schema from "../src/schema.js";
import { PostgresQueueRepository } from "../src/postgres-queue-repository.js";
import { PostgresTicketRepository } from "../src/postgres-ticket-repository.js";

async function freshDatabase(): Promise<Database> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  await runMigrations(db);
  return db;
}

test("PostgresQueueRepository CRUD operations and tenant isolation", async () => {
  const db = await freshDatabase();
  const queueRepo = new PostgresQueueRepository(db);

  // Insert tenant
  const tenantAId = TenantId.generate();
  const tenantBId = TenantId.generate();
  const branchId = BranchId.generate();

  await db.insert(schema.tenants).values([
    { id: tenantAId.value, name: "Tenant A", slug: "tenant-a" },
    { id: tenantBId.value, name: "Tenant B", slug: "tenant-b" },
  ]);

  const queueA = new Queue({
    id: QueueId.generate(),
    tenantId: tenantAId,
    branchId,
    code: "GEN",
    name: "General Consultation",
    prefix: "A",
  });

  const queueB = new Queue({
    id: QueueId.generate(),
    tenantId: tenantBId,
    branchId,
    code: "VIP",
    name: "VIP Services",
    prefix: "V",
  });

  // Save
  await queueRepo.save(queueA);
  await queueRepo.save(queueB);

  // findById
  const foundA = await queueRepo.findById(tenantAId, queueA.id);
  assert.ok(foundA);
  assert.equal(foundA.name, "General Consultation");

  // Cross-tenant access returns null
  const crossTenantAccess = await queueRepo.findById(tenantBId, queueA.id);
  assert.equal(crossTenantAccess, null);

  // findByTenant
  const tenantAQueues = await queueRepo.findByTenant(tenantAId);
  assert.equal(tenantAQueues.length, 1);
  assert.equal(tenantAQueues[0].code, "GEN");

  // findActive
  const activeQueues = await queueRepo.findActive(tenantAId);
  assert.equal(activeQueues.length, 1);

  // Update
  const updatedQueueA = new Queue({
    id: queueA.id,
    tenantId: tenantAId,
    branchId,
    code: "GEN",
    name: "General Consultation (Updated)",
    prefix: "A",
    isActive: false,
  });
  await queueRepo.save(updatedQueueA);

  const foundUpdated = await queueRepo.findById(tenantAId, queueA.id);
  assert.ok(foundUpdated);
  assert.equal(foundUpdated.name, "General Consultation (Updated)");
  assert.equal(foundUpdated.isActive, false);

  // Delete
  await queueRepo.delete(tenantAId, queueA.id);
  const foundAfterDelete = await queueRepo.findById(tenantAId, queueA.id);
  assert.equal(foundAfterDelete, null);
});

test("PostgresTicketRepository CRUD operations, queue ordering, and state persistence", async () => {
  const db = await freshDatabase();
  const queueRepo = new PostgresQueueRepository(db);
  const ticketRepo = new PostgresTicketRepository(db);

  const tenantId = TenantId.generate();
  const branchId = BranchId.generate();

  await db.insert(schema.tenants).values({ id: tenantId.value, name: "Clinic One", slug: "clinic-one" });

  const queue = new Queue({
    id: QueueId.generate(),
    tenantId,
    branchId,
    code: "DENT",
    name: "Dental Care",
    prefix: "D",
  });
  await queueRepo.save(queue);

  const t1 = queue.issueTicket({ customerName: "John Doe", priority: QueuePriority.STANDARD });
  const t2 = queue.issueTicket({ customerName: "Emergency Jane", priority: QueuePriority.EMERGENCY });

  await ticketRepo.save(t1);
  await ticketRepo.save(t2);

  // countWaiting
  assert.equal(await ticketRepo.countWaiting(tenantId, queue.id), 2);

  // findByNumber
  const foundByNum = await ticketRepo.findByNumber(tenantId, queue.id, "D001");
  assert.ok(foundByNum);
  assert.equal(foundByNum.customerName, "John Doe");

  // getNextWaitingTicket returns Emergency Jane due to priority
  const nextTicket = await ticketRepo.getNextWaitingTicket(tenantId, queue.id);
  assert.ok(nextTicket);
  assert.equal(nextTicket.customerName, "Emergency Jane");

  // Call & Start Service
  nextTicket.call("Counter-2", "doctor-1");
  nextTicket.startService();
  await ticketRepo.save(nextTicket);

  // countWaiting is now 1
  assert.equal(await ticketRepo.countWaiting(tenantId, queue.id), 1);

  // findById reflects updated status
  const reloadedNext = await ticketRepo.findById(tenantId, nextTicket.id);
  assert.ok(reloadedNext);
  assert.equal(reloadedNext.status, TicketStatus.IN_SERVICE);
  assert.equal(reloadedNext.counterId, "Counter-2");

  // Complete
  reloadedNext.complete();
  await ticketRepo.save(reloadedNext);

  const reloadedCompleted = await ticketRepo.findById(tenantId, nextTicket.id);
  assert.ok(reloadedCompleted);
  assert.equal(reloadedCompleted.status, TicketStatus.COMPLETED);
});
