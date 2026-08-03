import assert from "node:assert/strict";
import { test } from "node:test";
import { QueueId, TicketId, TenantId, BranchId } from "../src/value-objects/identifiers.js";

test("QueueId creation and validation", () => {
  const idStr = "queue-12345";
  const queueId = new QueueId(idStr);

  assert.equal(queueId.value, "queue-12345");
  assert.equal(queueId.toString(), "queue-12345");
  assert.equal(queueId.toJSON(), "queue-12345");

  // Factory methods
  const fromStr = QueueId.fromString(idStr);
  assert.ok(queueId.equals(fromStr));

  const generated = QueueId.generate();
  assert.ok(generated.value.length > 0);
  assert.equal(queueId.equals(generated), false);

  // Rejects empty / whitespace string
  assert.throws(() => new QueueId(""), /non-empty string/);
  assert.throws(() => new QueueId("   "), /non-empty string/);
  // @ts-expect-error testing runtime guard
  assert.throws(() => new QueueId(null), /non-empty string/);
});

test("Identifier type safety and cross-type equality checks", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const queueId = new QueueId(uuid);
  const ticketId = new TicketId(uuid);
  const tenantId = new TenantId(uuid);
  const branchId = new BranchId(uuid);

  assert.equal(queueId.value, uuid);
  assert.equal(ticketId.value, uuid);
  assert.equal(tenantId.value, uuid);
  assert.equal(branchId.value, uuid);

  // Cross-type equality MUST be false despite identical string value
  // @ts-ignore
  assert.equal(queueId.equals(ticketId), false);
  // @ts-ignore
  assert.equal(ticketId.equals(tenantId), false);
  // @ts-ignore
  assert.equal(tenantId.equals(branchId), false);
  // @ts-ignore
  assert.equal(branchId.equals(queueId), false);

  assert.equal(queueId.equals(null), false);
  assert.equal(queueId.equals(undefined), false);
});

test("Identifier immutability", () => {
  const queueId = new QueueId("q-99");
  assert.ok(Object.isFrozen(queueId));
  assert.throws(() => {
    // @ts-expect-error testing immutability write
    queueId._value = "modified";
  }, TypeError);
});
