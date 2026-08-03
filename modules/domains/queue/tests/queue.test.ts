import assert from "node:assert/strict";
import { test } from "node:test";
import { QueueId, TenantId, BranchId } from "../src/value-objects/identifiers.js";
import { QueuePriority } from "../src/enums/queue-priority.js";
import { Queue } from "../src/aggregates/queue.js";

test("Queue ticket issuance and wait-time calculation", () => {
  const queue = new Queue({
    id: QueueId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    code: "MAIN",
    name: "Main Consulting",
    prefix: "A",
    avgServiceTimeMinutes: 10,
  });

  const ticket1 = queue.issueTicket({ customerName: "Alice" });
  assert.equal(ticket1.number.formatted, "A001");
  assert.equal(ticket1.customerName, "Alice");
  assert.equal(queue.currentSequence, 1);

  const ticket2 = queue.issueTicket({ customerName: "Bob", priority: QueuePriority.VIP });
  assert.equal(ticket2.number.formatted, "A002");
  assert.equal(ticket2.priority, QueuePriority.VIP);
  assert.equal(queue.currentSequence, 2);

  // Wait time calculation: position 3, 1 active counter @ 10 mins avg = 30 mins
  assert.equal(queue.calculateWaitTimeMinutes(3, 1), 30);
  // position 3, 2 active counters @ 10 mins avg = ceil(30/2) = 15 mins
  assert.equal(queue.calculateWaitTimeMinutes(3, 2), 15);
  // position 0 = 0 mins
  assert.equal(queue.calculateWaitTimeMinutes(0, 2), 0);
});

test("Queue priority sorting", () => {
  const queue = new Queue({
    id: QueueId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    code: "MAIN",
    name: "Main Consulting",
    prefix: "A",
  });

  const tStandard = queue.issueTicket({ customerName: "Standard", priority: QueuePriority.STANDARD });
  const tVip = queue.issueTicket({ customerName: "VIP", priority: QueuePriority.VIP });
  const tEmergency = queue.issueTicket({ customerName: "Emergency", priority: QueuePriority.EMERGENCY });
  const tAppointment = queue.issueTicket({ customerName: "Appointment", priority: QueuePriority.APPOINTMENT });

  const sorted = Queue.sortTicketsByPriority([tStandard, tVip, tEmergency, tAppointment]);

  assert.equal(sorted[0].customerName, "Emergency");
  assert.equal(sorted[1].customerName, "Appointment");
  assert.equal(sorted[2].customerName, "VIP");
  assert.equal(sorted[3].customerName, "Standard");
});
