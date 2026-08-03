import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TenantId,
  QueueId,
  BranchId,
  Queue,
  TicketStatus,
  QueuePriority,
} from "../src/index.js";
import {
  InMemoryQueueRepository,
  InMemoryTicketRepository,
} from "../src/repositories/in-memory-queue-repository.js";

test("InMemoryTicketRepository idempotency and atomic ticket issuance", async () => {
  const queueRepo = new InMemoryQueueRepository();
  const ticketRepo = new InMemoryTicketRepository(queueRepo);

  const tenantId = TenantId.generate();
  const branchId = BranchId.generate();

  const queue = new Queue({
    id: QueueId.generate(),
    tenantId,
    branchId,
    code: "CHECKUP",
    name: "General Checkup",
    prefix: "GC",
  });
  await queueRepo.save(queue);

  // Issue 5 tickets with unique idempotency keys
  const t1 = await ticketRepo.issueTicketAtomic(tenantId, queue.id, {
    customerName: "Patient 1",
    idempotencyKey: "key-1",
  });
  const t2 = await ticketRepo.issueTicketAtomic(tenantId, queue.id, {
    customerName: "Patient 2",
    idempotencyKey: "key-2",
  });

  assert.equal(t1.number.formatted, "GC001");
  assert.equal(t2.number.formatted, "GC002");

  // Re-issue with key-1 must return t1 without sequence increment
  const t1Retry = await ticketRepo.issueTicketAtomic(tenantId, queue.id, {
    customerName: "Patient 1",
    idempotencyKey: "key-1",
  });

  assert.equal(t1Retry.id.value, t1.id.value);
  assert.equal(t1Retry.number.formatted, "GC001");

  // Verify findByIdempotencyKey
  const found = await ticketRepo.findByIdempotencyKey(tenantId, "key-2");
  assert.ok(found);
  assert.equal(found.id.value, t2.id.value);

  // Total tickets in repo should be 2
  const allTickets = await ticketRepo.findByQueue(tenantId, queue.id);
  assert.equal(allTickets.length, 2);
});

test("InMemoryTicketRepository concurrent issuance simulation", async () => {
  const queueRepo = new InMemoryQueueRepository();
  const ticketRepo = new InMemoryTicketRepository(queueRepo);

  const tenantId = TenantId.generate();
  const queue = new Queue({
    id: QueueId.generate(),
    tenantId,
    branchId: BranchId.generate(),
    code: "VIP",
    name: "VIP Lounge",
    prefix: "V",
  });
  await queueRepo.save(queue);

  const reqs = Array.from({ length: 50 }, (_, i) =>
    ticketRepo.issueTicketAtomic(tenantId, queue.id, {
      customerName: `VIP ${i + 1}`,
      priority: QueuePriority.VIP,
    })
  );

  const tickets = await Promise.all(reqs);
  assert.equal(tickets.length, 50);

  const seqs = tickets.map((t) => t.number.sequence).sort((a, b) => a - b);
  const expected = Array.from({ length: 50 }, (_, i) => i + 1);
  assert.deepEqual(seqs, expected);
});
