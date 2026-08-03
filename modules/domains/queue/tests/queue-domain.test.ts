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
  InvalidStateTransitionError,
} from "../src/index.js";

test("Queue aggregate activation, ticket issuance, and wait estimation", () => {
  const tenantId = TenantId.generate();
  const branchId = BranchId.generate();
  const queueId = QueueId.generate();

  const queue = new Queue({
    id: queueId,
    tenantId,
    branchId,
    code: "CONSULT",
    name: "Consultation Queue",
    prefix: "C",
    avgServiceTimeMinutes: 15,
  });

  assert.equal(queue.isActive, true);
  assert.equal(queue.currentSequence, 0);

  // Issue tickets
  const t1 = queue.issueTicket({ customerName: "Alice" });
  assert.equal(t1.number.formatted, "C001");
  assert.equal(queue.currentSequence, 1);

  const t2 = queue.issueTicket({ customerName: "Bob", priority: QueuePriority.VIP });
  assert.equal(t2.number.formatted, "C002");
  assert.equal(queue.currentSequence, 2);

  // Wait time calculations: position 2 with 1 counter = 30 minutes
  assert.equal(queue.calculateWaitTimeMinutes(2, 1), 30);
  // position 2 with 2 counters = 15 minutes
  assert.equal(queue.calculateWaitTimeMinutes(2, 2), 15);
});

test("QueueTicket complete state transition lifecycle", () => {
  const ticket = new QueueTicket({
    id: TicketId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    queueId: QueueId.generate(),
    number: { prefix: "C", sequence: 1, padding: 3, formatted: "C001" } as any,
    priority: QueuePriority.STANDARD,
  });

  assert.equal(ticket.status, TicketStatus.WAITING);

  // Call
  ticket.call("Counter-3", "staff-101");
  assert.equal(ticket.status, TicketStatus.CALLED);
  assert.equal(ticket.counterId, "Counter-3");
  assert.equal(ticket.servedByUserId, "staff-101");
  assert.ok(ticket.calledAt);

  // Start Service
  ticket.startService();
  assert.equal(ticket.status, TicketStatus.IN_SERVICE);
  assert.ok(ticket.serviceStartedAt);

  // Complete
  ticket.complete();
  assert.equal(ticket.status, TicketStatus.COMPLETED);
  assert.ok(ticket.completedAt);
});

test("QueueTicket cancellation and no-show invariants", () => {
  const ticket1 = new QueueTicket({
    id: TicketId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    queueId: QueueId.generate(),
    number: { prefix: "C", sequence: 1, padding: 3, formatted: "C001" } as any,
  });

  // Cancel waiting ticket
  ticket1.cancel("Customer left");
  assert.equal(ticket1.status, TicketStatus.CANCELLED);

  // Cannot cancel completed or already cancelled ticket
  assert.throws(() => ticket1.cancel("Duplicate cancel"), InvalidStateTransitionError);

  const ticket2 = new QueueTicket({
    id: TicketId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    queueId: QueueId.generate(),
    number: { prefix: "C", sequence: 2, padding: 3, formatted: "C002" } as any,
  });

  // Cannot mark no-show directly from WAITING
  assert.throws(() => ticket2.markNoShow(), InvalidStateTransitionError);

  // Call then mark no-show
  ticket2.call("Counter-1", "staff-1");
  ticket2.markNoShow();
  assert.equal(ticket2.status, TicketStatus.NO_SHOW);
});
