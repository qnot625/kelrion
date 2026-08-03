import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TicketStatus,
  TICKET_STATUSES,
  isValidTicketStatus,
} from "../src/enums/ticket-status.js";
import {
  QueuePriority,
  QUEUE_PRIORITIES,
  isValidQueuePriority,
} from "../src/enums/queue-priority.js";

test("TicketStatus values and type guard validation", () => {
  const expectedValues = [
    "waiting",
    "called",
    "in_service",
    "completed",
    "no_show",
    "cancelled",
    "transferred",
  ];

  assert.deepEqual(Array.from(TICKET_STATUSES), expectedValues);

  for (const val of expectedValues) {
    assert.ok(isValidTicketStatus(val));
  }

  assert.equal(isValidTicketStatus("unknown_status"), false);
  assert.equal(isValidTicketStatus("WAITING"), false);
  assert.equal(isValidTicketStatus(null), false);
  assert.equal(isValidTicketStatus(123), false);

  assert.equal(JSON.stringify(TicketStatus.WAITING), '"waiting"');
  assert.equal(JSON.stringify(TicketStatus.TRANSFERRED), '"transferred"');
});

test("QueuePriority values and type guard validation", () => {
  const expectedValues = ["standard", "vip", "appointment", "emergency"];

  assert.deepEqual(Array.from(QUEUE_PRIORITIES), expectedValues);

  for (const val of expectedValues) {
    assert.ok(isValidQueuePriority(val));
  }

  assert.equal(isValidQueuePriority("high"), false);
  assert.equal(isValidQueuePriority("STANDARD"), false);
  assert.equal(isValidQueuePriority(undefined), false);

  assert.equal(JSON.stringify(QueuePriority.STANDARD), '"standard"');
  assert.equal(JSON.stringify(QueuePriority.EMERGENCY), '"emergency"');
});
