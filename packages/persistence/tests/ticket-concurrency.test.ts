import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  TenantId,
  QueueId,
  BranchId,
  Queue,
  TicketStatus,
  QueuePriority,
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

test("Atomic ticket number generation under high concurrent load (100 concurrent requests)", async () => {
  const db = await freshDatabase();
  const queueRepo = new PostgresQueueRepository(db);
  const ticketRepo = new PostgresTicketRepository(db);

  const tenantId = TenantId.generate();
  await db.insert(schema.tenants).values({
    id: tenantId.value,
    name: "Clinic A",
    slug: "clinic-a",
  });

  const queue = new Queue({
    id: QueueId.generate(),
    tenantId,
    branchId: BranchId.generate(),
    code: "GENERAL",
    name: "General Queue",
    prefix: "A",
    isActive: true,
  });
  await queueRepo.save(queue);

  const CONCURRENCY_COUNT = 100;
  const requests = Array.from({ length: CONCURRENCY_COUNT }, (_, i) =>
    ticketRepo.issueTicketAtomic(tenantId, queue.id, {
      customerName: `Customer ${i + 1}`,
      priority: QueuePriority.STANDARD,
    })
  );

  const issuedTickets = await Promise.all(requests);

  assert.equal(issuedTickets.length, CONCURRENCY_COUNT);

  const sequenceNumbers = issuedTickets.map((t) => t.number.sequence).sort((a, b) => a - b);
  const expectedSequences = Array.from({ length: CONCURRENCY_COUNT }, (_, i) => i + 1);

  assert.deepEqual(sequenceNumbers, expectedSequences, "Sequence numbers must be strictly 1..100 with zero gaps or duplicates");

  // Verify DB state for queue sequence
  const reloadedQueue = await queueRepo.findById(tenantId, queue.id);
  assert.equal(reloadedQueue?.currentSequence, CONCURRENCY_COUNT);

  // Verify total count in DB
  const waitingCount = await ticketRepo.countWaiting(tenantId, queue.id);
  assert.equal(waitingCount, CONCURRENCY_COUNT);
});

test("Concurrent ticket generation across multiple queues and tenants", async () => {
  const db = await freshDatabase();
  const queueRepo = new PostgresQueueRepository(db);
  const ticketRepo = new PostgresTicketRepository(db);

  const t1Id = TenantId.generate();
  const t2Id = TenantId.generate();

  await db.insert(schema.tenants).values([
    { id: t1Id.value, name: "Hospital 1", slug: "hosp-1" },
    { id: t2Id.value, name: "Hospital 2", slug: "hosp-2" },
  ]);

  const queue1A = new Queue({
    id: QueueId.generate(),
    tenantId: t1Id,
    branchId: BranchId.generate(),
    code: "PEDIATRICS",
    name: "Pediatrics",
    prefix: "P",
  });
  const queue1B = new Queue({
    id: QueueId.generate(),
    tenantId: t1Id,
    branchId: BranchId.generate(),
    code: "CARDIOLOGY",
    name: "Cardiology",
    prefix: "C",
  });
  const queue2A = new Queue({
    id: QueueId.generate(),
    tenantId: t2Id,
    branchId: BranchId.generate(),
    code: "GENERAL",
    name: "General",
    prefix: "G",
  });

  await queueRepo.save(queue1A);
  await queueRepo.save(queue1B);
  await queueRepo.save(queue2A);

  const BATCH_SIZE = 25;
  const t1A_reqs = Array.from({ length: BATCH_SIZE }, () =>
    ticketRepo.issueTicketAtomic(t1Id, queue1A.id)
  );
  const t1B_reqs = Array.from({ length: BATCH_SIZE }, () =>
    ticketRepo.issueTicketAtomic(t1Id, queue1B.id)
  );
  const t2A_reqs = Array.from({ length: BATCH_SIZE }, () =>
    ticketRepo.issueTicketAtomic(t2Id, queue2A.id)
  );

  const [t1A_tickets, t1B_tickets, t2A_tickets] = await Promise.all([
    Promise.all(t1A_reqs),
    Promise.all(t1B_reqs),
    Promise.all(t2A_reqs),
  ]);

  const extractSeqs = (tickets: typeof t1A_tickets) =>
    tickets.map((t) => t.number.sequence).sort((a, b) => a - b);

  const expected = Array.from({ length: BATCH_SIZE }, (_, i) => i + 1);

  assert.deepEqual(extractSeqs(t1A_tickets), expected);
  assert.deepEqual(extractSeqs(t1B_tickets), expected);
  assert.deepEqual(extractSeqs(t2A_tickets), expected);

  // Assert prefixes are correct
  assert.ok(t1A_tickets.every((t) => t.number.formatted.startsWith("P")));
  assert.ok(t1B_tickets.every((t) => t.number.formatted.startsWith("C")));
  assert.ok(t2A_tickets.every((t) => t.number.formatted.startsWith("G")));
});

test("Idempotent ticket creation under concurrent load (10 identical idempotency keys)", async () => {
  const db = await freshDatabase();
  const queueRepo = new PostgresQueueRepository(db);
  const ticketRepo = new PostgresTicketRepository(db);

  const tenantId = TenantId.generate();
  await db.insert(schema.tenants).values({
    id: tenantId.value,
    name: "Clinic Idem",
    slug: "clinic-idem",
  });

  const queue = new Queue({
    id: QueueId.generate(),
    tenantId,
    branchId: BranchId.generate(),
    code: "LAB",
    name: "Laboratory",
    prefix: "L",
  });
  await queueRepo.save(queue);

  const IDEMPOTENCY_KEY = "req-uuid-999";
  const CONCURRENT_RETRIES = 10;

  const requests = Array.from({ length: CONCURRENT_RETRIES }, () =>
    ticketRepo.issueTicketAtomic(tenantId, queue.id, {
      customerName: "Alice Smith",
      idempotencyKey: IDEMPOTENCY_KEY,
    })
  );

  const results = await Promise.all(requests);

  const firstTicketId = results[0].id.value;
  const firstDisplayNumber = results[0].number.formatted;

  assert.equal(firstDisplayNumber, "L001");

  for (const ticket of results) {
    assert.equal(ticket.id.value, firstTicketId);
    assert.equal(ticket.number.formatted, "L001");
    assert.equal(ticket.idempotencyKey, IDEMPOTENCY_KEY);
  }

  // Verify only 1 ticket exists in the database
  const waitingTickets = await ticketRepo.findWaitingByQueue(tenantId, queue.id);
  assert.equal(waitingTickets.length, 1);

  // Subsequent request with a DIFFERENT idempotency key gets ticket L002
  const nextTicket = await ticketRepo.issueTicketAtomic(tenantId, queue.id, {
    customerName: "Bob Jones",
    idempotencyKey: "req-uuid-1000",
  });

  assert.equal(nextTicket.number.formatted, "L002");
  assert.notEqual(nextTicket.id.value, firstTicketId);

  const totalWaiting = await ticketRepo.findWaitingByQueue(tenantId, queue.id);
  assert.equal(totalWaiting.length, 2);
});

test("Idempotent retry after simulated network failure", async () => {
  const db = await freshDatabase();
  const queueRepo = new PostgresQueueRepository(db);
  const ticketRepo = new PostgresTicketRepository(db);

  const tenantId = TenantId.generate();
  await db.insert(schema.tenants).values({
    id: tenantId.value,
    name: "Clinic Retry",
    slug: "clinic-retry",
  });

  const queue = new Queue({
    id: QueueId.generate(),
    tenantId,
    branchId: BranchId.generate(),
    code: "TRIAGE",
    name: "Triage",
    prefix: "T",
  });
  await queueRepo.save(queue);

  const key = "retry-idempotency-key-777";

  // First call succeeds
  const ticket1 = await ticketRepo.issueTicketAtomic(tenantId, queue.id, {
    customerName: "Charlie",
    idempotencyKey: key,
  });

  assert.equal(ticket1.number.formatted, "T001");

  // Re-fetch directly by idempotency key
  const fetched = await ticketRepo.findByIdempotencyKey(tenantId, key);
  assert.ok(fetched);
  assert.equal(fetched.id.value, ticket1.id.value);

  // Re-issue call with same idempotency key
  const ticket2 = await ticketRepo.issueTicketAtomic(tenantId, queue.id, {
    customerName: "Charlie",
    idempotencyKey: key,
  });

  assert.equal(ticket2.id.value, ticket1.id.value);
  assert.equal(ticket2.number.formatted, "T001");
});
