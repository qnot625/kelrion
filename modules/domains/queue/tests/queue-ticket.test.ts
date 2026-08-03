import assert from "node:assert/strict";
import { test } from "node:test";
import { QueueId, TicketId, TenantId, BranchId } from "../src/value-objects/identifiers.js";
import { TicketNumber } from "../src/value-objects/ticket-number.js";
import { TicketStatus } from "../src/enums/ticket-status.js";
import { QueuePriority } from "../src/enums/queue-priority.js";
import { QueueTicket, InvalidStateTransitionError } from "../src/aggregates/queue-ticket.js";

test("QueueTicket state transitions", () => {
  const ticket = new QueueTicket({
    id: TicketId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    queueId: QueueId.generate(),
    number: TicketNumber.create("A", 1),
    priority: QueuePriority.STANDARD,
  });

  assert.equal(ticket.status, TicketStatus.WAITING);

  // WAITING -> CALLED
  ticket.call("Counter-1", "user-42");
  assert.equal(ticket.status, TicketStatus.CALLED);
  assert.equal(ticket.counterId, "Counter-1");
  assert.equal(ticket.servedByUserId, "user-42");
  assert.ok(ticket.calledAt instanceof Date);

  // CALLED -> IN_SERVICE
  ticket.startService();
  assert.equal(ticket.status, TicketStatus.IN_SERVICE);
  assert.ok(ticket.serviceStartedAt instanceof Date);

  // IN_SERVICE -> COMPLETED
  ticket.complete();
  assert.equal(ticket.status, TicketStatus.COMPLETED);
  assert.ok(ticket.completedAt instanceof Date);
});

test("QueueTicket invalid state transitions", () => {
  const ticket = new QueueTicket({
    id: TicketId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    queueId: QueueId.generate(),
    number: TicketNumber.create("A", 1),
  });

  // Cannot start service directly from WAITING
  assert.throws(() => ticket.startService(), InvalidStateTransitionError);

  // Cannot mark no-show from WAITING
  assert.throws(() => ticket.markNoShow(), InvalidStateTransitionError);

  // Call ticket then mark no-show
  ticket.call("Counter-2", "user-10");
  ticket.markNoShow();
  assert.equal(ticket.status, TicketStatus.NO_SHOW);
});

test("QueueTicket transfer", () => {
  const ticket = new QueueTicket({
    id: TicketId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    queueId: QueueId.generate(),
    number: TicketNumber.create("B", 10),
  });

  const targetQueueId = QueueId.generate();
  ticket.call("Counter-1", "agent-1");
  ticket.transfer(targetQueueId);

  assert.equal(ticket.status, TicketStatus.TRANSFERRED);
  assert.ok(ticket.queueId.equals(targetQueueId));
  assert.equal(ticket.counterId, null);
  assert.equal(ticket.servedByUserId, null);
});
