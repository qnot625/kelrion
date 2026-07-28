import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryAuditLog } from "../src/in-memory-audit-log.js";
import { verifyChainIntegrity } from "../src/hash-chain.js";

test("records an event with no previous hash for the first entry in a tenant", async () => {
  const log = new InMemoryAuditLog();
  const event = await log.record({
    tenantId: "tenant-a",
    actorUserId: "user-1",
    action: "tenant.created",
    targetType: "tenant",
    targetId: "tenant-a",
  });

  assert.equal(event.previousHash, null);
  assert.ok(event.hash);
});

test("chains each event to the hash of the one before it, per tenant", async () => {
  const log = new InMemoryAuditLog();
  const first = await log.record({
    tenantId: "tenant-a",
    actorUserId: "user-1",
    action: "user.signed_up",
    targetType: "user",
    targetId: "user-1",
  });
  const second = await log.record({
    tenantId: "tenant-a",
    actorUserId: "user-1",
    action: "appointment.booked",
    targetType: "appointment",
    targetId: "appt-1",
  });

  assert.equal(second.previousHash, first.hash);

  const events = await log.listByTenant("tenant-a");
  assert.equal(verifyChainIntegrity(events), true);
});

test("keeps separate chains per tenant", async () => {
  const log = new InMemoryAuditLog();
  await log.record({
    tenantId: "tenant-a",
    actorUserId: "user-1",
    action: "tenant.created",
    targetType: "tenant",
    targetId: "tenant-a",
  });
  const firstForB = await log.record({
    tenantId: "tenant-b",
    actorUserId: "user-2",
    action: "tenant.created",
    targetType: "tenant",
    targetId: "tenant-b",
  });

  assert.equal(firstForB.previousHash, null);
  assert.equal((await log.listByTenant("tenant-a")).length, 1);
  assert.equal((await log.listByTenant("tenant-b")).length, 1);
});

test("detects a tampered event: mutated content no longer matches its recorded hash", async () => {
  const log = new InMemoryAuditLog();
  await log.record({
    tenantId: "tenant-a",
    actorUserId: "user-1",
    action: "appointment.booked",
    targetType: "appointment",
    targetId: "appt-1",
    metadata: { serviceName: "General consultation" },
  });

  const events = await log.listByTenant("tenant-a");
  assert.equal(verifyChainIntegrity(events), true);

  const tampered = [{ ...events[0]!, action: "appointment.cancelled" }];
  assert.equal(verifyChainIntegrity(tampered), false);
});

test("detects a deleted event: the next event's previousHash no longer resolves", async () => {
  const log = new InMemoryAuditLog();
  await log.record({
    tenantId: "tenant-a",
    actorUserId: "user-1",
    action: "user.signed_up",
    targetType: "user",
    targetId: "user-1",
  });
  await log.record({
    tenantId: "tenant-a",
    actorUserId: "user-1",
    action: "appointment.booked",
    targetType: "appointment",
    targetId: "appt-1",
  });

  const events = await log.listByTenant("tenant-a");
  const withFirstEventRemoved = events.slice(1);
  assert.equal(verifyChainIntegrity(withFirstEventRemoved), false);
});
