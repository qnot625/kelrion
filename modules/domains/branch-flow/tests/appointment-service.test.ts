import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
} from "../src/appointment.js";
import { AppointmentService } from "../src/appointment-service.js";
import { InMemoryAppointmentRepository } from "../src/in-memory-appointment-repository.js";

function service() {
  return new AppointmentService(new InMemoryAppointmentRepository());
}

function bookingInput(overrides: Partial<Parameters<AppointmentService["book"]>[0]> = {}) {
  const startAt = new Date("2026-08-01T09:00:00Z");
  const endAt = new Date("2026-08-01T09:30:00Z");
  return {
    tenantId: "tenant-a",
    customerEmail: "customer@example.com",
    serviceName: "Account opening",
    startAt,
    endAt,
    ...overrides,
  };
}

test("books an appointment as 'booked'", async () => {
  const appointments = service();
  const appointment = await appointments.book(bookingInput());
  assert.equal(appointment.status, "booked");
});

test("rejects an appointment whose end is not after its start", async () => {
  const appointments = service();
  await assert.rejects(
    () => appointments.book(bookingInput({ endAt: new Date("2026-08-01T09:00:00Z") })),
    InvalidAppointmentWindowError,
  );
});

test("walks an appointment through check-in to completion", async () => {
  const appointments = service();
  const booked = await appointments.book(bookingInput());

  const checkedIn = await appointments.checkIn(booked.tenantId, booked.id);
  assert.equal(checkedIn.status, "checked_in");

  const completed = await appointments.complete(booked.tenantId, booked.id);
  assert.equal(completed.status, "completed");
});

test("rejects completing an appointment that has not been checked in", async () => {
  const appointments = service();
  const booked = await appointments.book(bookingInput());

  await assert.rejects(
    () => appointments.complete(booked.tenantId, booked.id),
    InvalidAppointmentTransitionError,
  );
});

test("rejects any transition on an appointment from another tenant", async () => {
  const appointments = service();
  const booked = await appointments.book(bookingInput({ tenantId: "tenant-a" }));

  await assert.rejects(
    () => appointments.checkIn("tenant-b", booked.id),
    AppointmentNotFoundError,
  );
});
