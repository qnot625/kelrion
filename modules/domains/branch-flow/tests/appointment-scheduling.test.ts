import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppointmentService,
  InMemoryAppointmentRepository,
  InMemoryBranchRepository,
  InMemoryServiceRepository,
  InMemoryWaitlistRepository,
  SlotNotAvailableError,
} from "../src/index.js";

async function fixture() {
  const branches = new InMemoryBranchRepository();
  const services = new InMemoryServiceRepository();
  const appointments = new InMemoryAppointmentRepository();
  const waitlists = new InMemoryWaitlistRepository();
  const tenantId = "tenant-a";
  const branch = await branches.createBranch({
    tenantId,
    slug: "central",
    name: "Central",
    status: "active",
    address: "1 Main Street",
    latitude: 6.45,
    longitude: 3.4,
  });
  await branches.createDepartment({ tenantId, branchId: branch.id, name: "Desk", slug: "desk", capacity: 1 });
  await branches.setOperatingWindows(branch.id, [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }]);
  const { service } = await services.createService({
    tenantId,
    code: "CONSULT",
    name: "Consultation",
    durationMinutes: 30,
    status: "active",
  });
  await services.assignServiceToBranch(tenantId, branch.id, service.id);
  return {
    tenantId,
    branch,
    service,
    appointments,
    waitlists,
    scheduling: new AppointmentService(appointments, branches, services, waitlists),
  };
}

const slot = {
  startAt: new Date("2026-08-03T09:00:00Z"),
  endAt: new Date("2026-08-03T09:30:00Z"),
};

test("availability and the booking lock enforce branch capacity", async () => {
  const setup = await fixture();
  const available = await setup.scheduling.availability({
    tenantId: setup.tenantId,
    branchId: setup.branch.id,
    serviceId: setup.service.id,
    startAt: new Date("2026-08-03T09:00:00Z"),
    endAt: new Date("2026-08-03T10:00:00Z"),
  });
  assert.equal(available.length, 2);

  const outcomes = await Promise.allSettled([
    setup.scheduling.book({ tenantId: setup.tenantId, branchId: setup.branch.id, serviceId: setup.service.id, customerEmail: "one@example.com", ...slot }),
    setup.scheduling.book({ tenantId: setup.tenantId, branchId: setup.branch.id, serviceId: setup.service.id, customerEmail: "two@example.com", ...slot }),
  ]);
  assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
  const rejection = outcomes.find((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.ok(rejection?.reason instanceof SlotNotAvailableError);
});

test("cancelling a booking promotes the first matching waitlist entry", async () => {
  const setup = await fixture();
  const booked = await setup.scheduling.book({
    tenantId: setup.tenantId,
    branchId: setup.branch.id,
    serviceId: setup.service.id,
    customerEmail: "booked@example.com",
    ...slot,
  });
  const first = await setup.scheduling.addToWaitlist({
    tenantId: setup.tenantId,
    branchId: setup.branch.id,
    serviceId: setup.service.id,
    customerEmail: "first@example.com",
    desiredStartAt: slot.startAt,
    desiredEndAt: slot.endAt,
  });
  await setup.scheduling.addToWaitlist({
    tenantId: setup.tenantId,
    branchId: setup.branch.id,
    serviceId: setup.service.id,
    customerEmail: "second@example.com",
  });

  await setup.scheduling.cancel(setup.tenantId, booked.id);
  const queue = await setup.scheduling.listWaitlist(setup.tenantId);
  const promoted = queue.find((entry) => entry.id === first.id);
  assert.equal(promoted?.status, "promoted");
  assert.ok(promoted?.promotedAppointmentId);
  const active = (await setup.scheduling.list(setup.tenantId)).find((item) => item.id === promoted?.promotedAppointmentId);
  assert.equal(active?.customerEmail, "first@example.com");
  assert.equal(active?.status, "booked");
});

test("rescheduling frees the old slot and preserves tenant isolation", async () => {
  const setup = await fixture();
  const booked = await setup.scheduling.book({
    tenantId: setup.tenantId,
    branchId: setup.branch.id,
    serviceId: setup.service.id,
    customerEmail: "booked@example.com",
    ...slot,
  });
  await setup.scheduling.addToWaitlist({
    tenantId: setup.tenantId,
    branchId: setup.branch.id,
    serviceId: setup.service.id,
    customerEmail: "waiting@example.com",
    desiredStartAt: slot.startAt,
    desiredEndAt: slot.endAt,
  });
  const moved = await setup.scheduling.reschedule({
    tenantId: setup.tenantId,
    appointmentId: booked.id,
    startAt: new Date("2026-08-03T10:00:00Z"),
    endAt: new Date("2026-08-03T10:30:00Z"),
  });
  assert.equal(moved.startAt.toISOString(), "2026-08-03T10:00:00.000Z");
  assert.equal((await setup.scheduling.listWaitlist(setup.tenantId))[0]?.status, "promoted");
  assert.deepEqual(await setup.scheduling.listWaitlist("tenant-b"), []);
});
