import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
} from "../src/appointment.js";
import { AppointmentService, SlotNotAvailableError } from "../src/appointment-service.js";
import { InMemoryAppointmentRepository } from "../src/in-memory-appointment-repository.js";
import { InMemoryBranchRepository } from "../src/in-memory-branch-repository.js";
import { InMemoryServiceRepository } from "../src/in-memory-service-repository.js";

async function setup() {
  const branchRepo = new InMemoryBranchRepository();
  const serviceRepo = new InMemoryServiceRepository();
  
  const branch = await branchRepo.createBranch({
    tenantId: "tenant-a",
    slug: "branch-a",
    name: "Branch A",
    status: "active",
    address: "123 Main St",
    latitude: 0,
    longitude: 0,
  });

  const { service } = await serviceRepo.createService({
    tenantId: "tenant-a",
    code: "service-a",
    name: "Service A",
    durationMinutes: 30,
    status: "active",
  });

  await serviceRepo.assignServiceToBranch("tenant-a", branch.id, service.id);
  branchRepo.setBranchServiceMapping("tenant-a", branch.id, service.id);

  // Need department to have capacity
  await branchRepo.createDepartment({
    tenantId: "tenant-a",
    branchId: branch.id,
    name: "Dept 1",
    slug: "dept-1",
    capacity: 2
  });

  await branchRepo.setOperatingWindows(branch.id, [
    { dayOfWeek: 6, openMinutes: 480, closeMinutes: 1020 } // Saturday 08:00 to 17:00. 2026-08-01 is a Saturday.
  ]);

  return {
    appointments: new AppointmentService(new InMemoryAppointmentRepository(), branchRepo, serviceRepo),
    branchId: branch.id,
    serviceId: service.id
  };
}

function bookingInput(branchId: string, serviceId: string, overrides: Partial<Parameters<AppointmentService["book"]>[0]> = {}) {
  const startAt = new Date("2026-08-01T09:00:00Z");
  const endAt = new Date("2026-08-01T09:30:00Z");
  return {
    tenantId: "tenant-a",
    branchId,
    serviceId,
    customerEmail: "customer@example.com",
    customerMetadata: {},
    startAt,
    endAt,
    ...overrides,
  };
}

test("books an appointment as 'booked'", async () => {
  const { appointments, branchId, serviceId } = await setup();
  const appointment = await appointments.book(bookingInput(branchId, serviceId));
  assert.equal(appointment.status, "booked");
});

test("rejects an appointment whose end is not after its start", async () => {
  const { appointments, branchId, serviceId } = await setup();
  await assert.rejects(
    () => appointments.book(bookingInput(branchId, serviceId, { endAt: new Date("2026-08-01T09:00:00Z") })),
    InvalidAppointmentWindowError,
  );
});

test("walks an appointment through check-in to completion", async () => {
  const { appointments, branchId, serviceId } = await setup();
  const booked = await appointments.book(bookingInput(branchId, serviceId));

  const checkedIn = await appointments.checkIn(booked.tenantId, booked.id);
  assert.equal(checkedIn.status, "checked_in");

  const completed = await appointments.complete(booked.tenantId, booked.id);
  assert.equal(completed.status, "completed");
});

test("rejects completing an appointment that has not been checked in", async () => {
  const { appointments, branchId, serviceId } = await setup();
  const booked = await appointments.book(bookingInput(branchId, serviceId));

  await assert.rejects(
    () => appointments.complete(booked.tenantId, booked.id),
    InvalidAppointmentTransitionError,
  );
});

test("rejects any transition on an appointment from another tenant", async () => {
  const { appointments, branchId, serviceId } = await setup();
  const booked = await appointments.book(bookingInput(branchId, serviceId, { tenantId: "tenant-a" }));

  await assert.rejects(
    () => appointments.checkIn("tenant-b", booked.id),
    AppointmentNotFoundError,
  );
});

test("rejects booking if slot is not available due to capacity", async () => {
  const { appointments, branchId, serviceId } = await setup();
  
  // Capacity is 2. Book 2 times.
  await appointments.book(bookingInput(branchId, serviceId));
  await appointments.book(bookingInput(branchId, serviceId));

  // Third booking should fail
  await assert.rejects(
    () => appointments.book(bookingInput(branchId, serviceId)),
    SlotNotAvailableError,
  );
});

test("supports waitlisting and triggers FIFO promotion on cancellation/no-show", async () => {
  const { InMemoryWaitlistRepository } = await import("../src/in-memory-waitlist-repository.js");
  const waitlistRepo = new InMemoryWaitlistRepository();

  // Re-create appointment service with waitlist repo
  const branchRepo = new InMemoryBranchRepository();
  const serviceRepo = new InMemoryServiceRepository();
  const branch = await branchRepo.createBranch({
    tenantId: "tenant-a",
    slug: "branch-a",
    name: "Branch A",
    status: "active",
    address: "123 Main St",
    latitude: 0,
    longitude: 0,
  });
  const { service } = await serviceRepo.createService({
    tenantId: "tenant-a",
    code: "service-a",
    name: "Service A",
    durationMinutes: 30,
    status: "active",
  });
  await serviceRepo.assignServiceToBranch("tenant-a", branch.id, service.id);
  branchRepo.setBranchServiceMapping("tenant-a", branch.id, service.id);
  await branchRepo.createDepartment({
    tenantId: "tenant-a",
    branchId: branch.id,
    name: "Dept 1",
    slug: "dept-1",
    capacity: 1 // capacity is 1
  });
  await branchRepo.setOperatingWindows(branch.id, [
    { dayOfWeek: 6, openMinutes: 480, closeMinutes: 1020 }
  ]);

  const serviceWithWaitlist = new AppointmentService(
    new InMemoryAppointmentRepository(),
    branchRepo,
    serviceRepo,
    waitlistRepo
  );

  // 1. Book the only slot
  const appointment = await serviceWithWaitlist.book({
    tenantId: "tenant-a",
    branchId: branch.id,
    serviceId: service.id,
    customerEmail: "user1@example.com",
    startAt: new Date("2026-08-01T09:00:00Z"),
    endAt: new Date("2026-08-01T09:30:00Z")
  });

  // 2. Add two users to waitlist
  const entry1 = await serviceWithWaitlist.addToWaitlist({
    tenantId: "tenant-a",
    branchId: branch.id,
    serviceId: service.id,
    customerEmail: "waitlist1@example.com"
  });

  const entry2 = await serviceWithWaitlist.addToWaitlist({
    tenantId: "tenant-a",
    branchId: branch.id,
    serviceId: service.id,
    customerEmail: "waitlist2@example.com"
  });

  assert.equal(entry1.queuePosition, 1);
  assert.equal(entry2.queuePosition, 2);

  // 3. Cancel the active appointment. This should trigger automatic promotion of waitlist1.
  await serviceWithWaitlist.cancel("tenant-a", appointment.id);

  // 4. Verify waitlist1 is promoted (removed from waitlist and booked for the slot)
  const waitlistQueue = await serviceWithWaitlist.listWaitlist("tenant-a");
  assert.equal(waitlistQueue.length, 1);
  assert.equal(waitlistQueue[0].customerEmail, "waitlist2@example.com");

  const activeAppointments = await serviceWithWaitlist.list("tenant-a");
  // There should be the cancelled appointment and the promoted appointment (which is booked)
  const bookedPromoted = activeAppointments.find(a => a.customerEmail === "waitlist1@example.com");
  assert.ok(bookedPromoted);
  assert.equal(bookedPromoted.status, "booked");
  assert.equal(bookedPromoted.startAt.getTime(), new Date("2026-08-01T09:00:00Z").getTime());
});

