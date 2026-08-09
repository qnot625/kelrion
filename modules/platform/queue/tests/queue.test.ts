import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryQueueConfigurationRepository,
  InMemoryQueueEntryRepository,
  InMemoryQueueEventRepository,
  QueueCapacityError,
  QueueCheckInService,
  QueueService,
  QueueValidationError,
} from "../src/index.js";

function setup() {
  const configurations = new InMemoryQueueConfigurationRepository();
  const entries = new InMemoryQueueEntryRepository();
  const events = new InMemoryQueueEventRepository();
  const service = new QueueService(configurations, entries, events);
  return { configurations, entries, events, service };
}

async function configure(service: QueueService, input: Partial<Parameters<QueueService["createConfiguration"]>[0]> = {}) {
  return service.createConfiguration({
    tenantId: "tenant-a",
    actorUserId: "owner-a",
    branchId: "branch-a",
    serviceId: "service-a",
    prefix: "A",
    averageServiceMinutes: 10,
    maxConcurrentServing: 1,
    ...input,
  });
}

test("queue ordering prioritizes urgent then priority then standard with stable arrival order", async () => {
  const { service } = setup();
  await configure(service);
  const first = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", priority: "STANDARD", actorUserId: "staff-a" });
  const second = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", priority: "PRIORITY", actorUserId: "staff-a" });
  const third = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", priority: "URGENT", actorUserId: "staff-a" });

  const queue = await service.listQueue("tenant-a", "branch-a", "service-a");
  assert.deepEqual(queue.map((item) => item.id), [third.id, second.id, first.id]);
  assert.equal(first.ticketNumber, "A001");
  assert.equal(second.ticketNumber, "A002");
  assert.equal(third.ticketNumber, "A003");
});

test("walk-in idempotency returns the same queue entry and event stream remains monotonic", async () => {
  const { service } = setup();
  await configure(service);
  const first = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", idempotencyKey: "kiosk-1:42" });
  const duplicate = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", idempotencyKey: "kiosk-1:42" });
  assert.equal(duplicate.id, first.id);
  const events = await service.eventsAfter("tenant-a", 0);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.sequence, 1);
  assert.equal(events[0]?.type, "CHECKED_IN");
});

test("call/start/complete respects concurrent serving capacity", async () => {
  const { service } = setup();
  await configure(service, { maxConcurrentServing: 1 });
  const urgent = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", priority: "URGENT" });
  await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", priority: "STANDARD" });
  const called = await service.callNext({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", stationId: "counter-1", actorUserId: "staff-a" });
  assert.equal(called?.id, urgent.id);
  await service.startService({ tenantId: "tenant-a", id: urgent.id, actorUserId: "staff-a", stationId: "counter-1" });
  await assert.rejects(() => service.callNext({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", stationId: "counter-2", actorUserId: "staff-b" }), QueueCapacityError);
  await service.complete({ tenantId: "tenant-a", id: urgent.id, actorUserId: "staff-a" });
  const next = await service.callNext({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", stationId: "counter-2", actorUserId: "staff-b" });
  assert.ok(next);
});

test("transfer terminates the source entry and creates a linked waiting entry with a target ticket", async () => {
  const { service } = setup();
  await configure(service);
  await configure(service, { id: "config-b", branchId: "branch-b", serviceId: "service-b", prefix: "B", maxConcurrentServing: 2 });
  const source = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a", customer: { name: "Ada" }, priority: "PRIORITY" });
  const result = await service.transfer({ tenantId: "tenant-a", id: source.id, actorUserId: "staff-a", branchId: "branch-b", serviceId: "service-b" });
  assert.equal(result.from.status, "TRANSFERRED");
  assert.equal(result.to.status, "WAITING");
  assert.equal(result.to.transferFromEntryId, source.id);
  assert.equal(result.to.ticketNumber, "B001");
  assert.equal(result.to.customer.name, "Ada");
});

test("appointment check-in enforces windows and deduplicates an active appointment entry", async () => {
  const { service } = setup();
  await configure(service, { maxEarlyCheckInMinutes: 30, maxLateCheckInMinutes: 15 });
  const startsAt = new Date("2026-08-10T10:00:00.000Z");
  const checkIn = new QueueCheckInService(service, async (_tenantId, appointmentId) => ({
    appointmentId,
    branchId: "branch-a",
    serviceId: "service-a",
    startsAt,
    status: "booked",
    customer: { name: "Customer A" },
  }));

  await assert.rejects(() => checkIn.checkInAppointment({ tenantId: "tenant-a", appointmentId: "appointment-a", now: new Date("2026-08-10T09:20:00.000Z") }), QueueValidationError);
  const first = await checkIn.checkInAppointment({ tenantId: "tenant-a", appointmentId: "appointment-a", now: new Date("2026-08-10T09:45:00.000Z") });
  const duplicate = await checkIn.checkInAppointment({ tenantId: "tenant-a", appointmentId: "appointment-a", now: new Date("2026-08-10T09:46:00.000Z") });
  assert.equal(first.id, duplicate.id);
  assert.equal(first.kind, "APPOINTMENT");
});

test("queue configuration and entries remain tenant isolated", async () => {
  const { service } = setup();
  await configure(service);
  const entry = await service.checkInWalkIn({ tenantId: "tenant-a", branchId: "branch-a", serviceId: "service-a" });
  await assert.rejects(() => service.getEntry("tenant-b", entry.id));
  assert.deepEqual(await service.listBranch("tenant-b", "branch-a"), []);
});
