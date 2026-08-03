import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QueueId,
  TicketId,
  TenantId,
  BranchId,
  QueuePriority,
  TicketStatus,
  Queue,
  QueueTicket,
  InMemoryQueueRepository,
  InMemoryTicketRepository,
} from "../src/index.js";

test("InMemoryQueueRepository CRUD operations and tenant isolation", async () => {
  const queueRepo = new InMemoryQueueRepository();

  const tenantA = TenantId.generate();
  const tenantB = TenantId.generate();
  const branch1 = BranchId.generate();

  const q1 = new Queue({
    id: QueueId.generate(),
    tenantId: tenantA,
    branchId: branch1,
    code: "GEN",
    name: "General",
    prefix: "A",
  });

  const q2 = new Queue({
    id: QueueId.generate(),
    tenantId: tenantB,
    branchId: branch1,
    code: "VIP",
    name: "VIP Services",
    prefix: "V",
  });

  // Save queues
  await queueRepo.save(q1);
  await queueRepo.save(q2);

  // findById with correct tenant
  const found1 = await queueRepo.findById(tenantA, q1.id);
  assert.ok(found1);
  assert.equal(found1.name, "General");

  // findById with wrong tenant returns null
  const wrongTenantLookup = await queueRepo.findById(tenantB, q1.id);
  assert.equal(wrongTenantLookup, null);

  // findByTenant
  const tenantAQueues = await queueRepo.findByTenant(tenantA);
  assert.equal(tenantAQueues.length, 1);
  assert.equal(tenantAQueues[0].code, "GEN");

  // findActive
  const activeQueues = await queueRepo.findActive(tenantA);
  assert.equal(activeQueues.length, 1);

  // Delete
  await queueRepo.delete(tenantA, q1.id);
  const deletedLookup = await queueRepo.findById(tenantA, q1.id);
  assert.equal(deletedLookup, null);
});

test("InMemoryTicketRepository CRUD, queue ordering, and tenant isolation", async () => {
  const ticketRepo = new InMemoryTicketRepository();

  const tenantA = TenantId.generate();
  const tenantB = TenantId.generate();
  const branch1 = BranchId.generate();
  const queueId = QueueId.generate();

  const queue = new Queue({
    id: queueId,
    tenantId: tenantA,
    branchId: branch1,
    code: "MAIN",
    name: "Main Queue",
    prefix: "A",
  });

  const tStandard = queue.issueTicket({ customerName: "Standard Customer", priority: QueuePriority.STANDARD });
  const tEmergency = queue.issueTicket({ customerName: "Emergency Customer", priority: QueuePriority.EMERGENCY });

  await ticketRepo.save(tStandard);
  await ticketRepo.save(tEmergency);

  // countWaiting
  const countWaiting = await ticketRepo.countWaiting(tenantA, queueId);
  assert.equal(countWaiting, 2);

  // findByNumber
  const foundByNum = await ticketRepo.findByNumber(tenantA, queueId, "A001");
  assert.ok(foundByNum);
  assert.equal(foundByNum.customerName, "Standard Customer");

  // Wrong tenant lookup returns null
  const wrongTenantLookup = await ticketRepo.findByNumber(tenantB, queueId, "A001");
  assert.equal(wrongTenantLookup, null);

  // getNextWaitingTicket yields Emergency ticket first due to priority
  const nextTicket = await ticketRepo.getNextWaitingTicket(tenantA, queueId);
  assert.ok(nextTicket);
  assert.equal(nextTicket.customerName, "Emergency Customer");

  // Process ticket: Call & Start Service
  nextTicket.call("Counter-1", "user-1");
  nextTicket.startService();
  await ticketRepo.save(nextTicket);

  // Waiting count updated to 1
  assert.equal(await ticketRepo.countWaiting(tenantA, queueId), 1);

  // findActiveByQueue returns both IN_SERVICE and WAITING
  const activeTickets = await ticketRepo.findActiveByQueue(tenantA, queueId);
  assert.equal(activeTickets.length, 2);
});
