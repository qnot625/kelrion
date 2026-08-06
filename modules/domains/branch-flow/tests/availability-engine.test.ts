import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAvailability,
  validateAvailabilityQueryOptions,
  type AvailabilityQueryOptions,
} from "../src/availability-engine.js";

test("calculateAvailability: generates slots within operating hour boundaries for matching day of week", () => {
  // Monday 2026-08-03
  const startDate = new Date("2026-08-03T00:00:00.000Z"); // Monday start
  const endDate = new Date("2026-08-03T23:59:59.999Z");

  const options: AvailabilityQueryOptions = {
    startDate,
    endDate,
    serviceDurationMinutes: 60,
    operatingWindows: [
      { dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, // 09:00 - 12:00 (3 hours = 3 slots)
    ],
  };

  const slots = calculateAvailability(options);

  assert.equal(slots.length, 3);
  assert.equal(slots[0].startAt.toISOString(), "2026-08-03T09:00:00.000Z");
  assert.equal(slots[0].endAt.toISOString(), "2026-08-03T10:00:00.000Z");
  assert.equal(slots[1].startAt.toISOString(), "2026-08-03T10:00:00.000Z");
  assert.equal(slots[1].endAt.toISOString(), "2026-08-03T11:00:00.000Z");
  assert.equal(slots[2].startAt.toISOString(), "2026-08-03T11:00:00.000Z");
  assert.equal(slots[2].endAt.toISOString(), "2026-08-03T12:00:00.000Z");
});

test("calculateAvailability: excludes slots overlapping holiday periods", () => {
  const startDate = new Date("2026-08-03T00:00:00.000Z"); // Monday
  const endDate = new Date("2026-08-03T23:59:59.999Z");

  const options: AvailabilityQueryOptions = {
    startDate,
    endDate,
    serviceDurationMinutes: 60,
    operatingWindows: [
      { dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, // 09:00 - 12:00
    ],
    holidays: [
      {
        id: "hol-1",
        tenantId: "tenant-1",
        name: "Morning Maintenance",
        startAt: new Date("2026-08-03T09:30:00.000Z"),
        endAt: new Date("2026-08-03T10:30:00.000Z"),
      },
    ],
  };

  const slots = calculateAvailability(options);

  // 09:00-10:00 overlaps 09:30-10:30 -> excluded
  // 10:00-11:00 overlaps 09:30-10:30 -> excluded
  // 11:00-12:00 does not overlap -> available
  assert.equal(slots.length, 1);
  assert.equal(slots[0].startAt.toISOString(), "2026-08-03T11:00:00.000Z");
  assert.equal(slots[0].endAt.toISOString(), "2026-08-03T12:00:00.000Z");
});

test("calculateAvailability: respects max capacity against existing overlapping bookings", () => {
  const startDate = new Date("2026-08-03T00:00:00.000Z");
  const endDate = new Date("2026-08-03T23:59:59.999Z");

  const options: AvailabilityQueryOptions = {
    startDate,
    endDate,
    serviceDurationMinutes: 60,
    maxCapacity: 2, // Allows 2 concurrent bookings
    operatingWindows: [
      { dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }, // 09:00 - 12:00
    ],
    existingBookings: [
      // 09:00 - 10:00 has 1 booking -> still 1 capacity available
      { startAt: new Date("2026-08-03T09:00:00.000Z"), endAt: new Date("2026-08-03T10:00:00.000Z") },
      // 10:00 - 11:00 has 2 bookings -> fully booked (0 capacity remaining)
      { startAt: new Date("2026-08-03T10:00:00.000Z"), endAt: new Date("2026-08-03T11:00:00.000Z") },
      { startAt: new Date("2026-08-03T10:15:00.000Z"), endAt: new Date("2026-08-03T10:45:00.000Z") },
    ],
  };

  const slots = calculateAvailability(options);

  // 09:00-10:00 -> available (1 booking < maxCapacity 2)
  // 10:00-11:00 -> excluded (2 bookings >= maxCapacity 2)
  // 11:00-12:00 -> available (0 bookings < maxCapacity 2)
  assert.equal(slots.length, 2);
  assert.equal(slots[0].startAt.toISOString(), "2026-08-03T09:00:00.000Z");
  assert.equal(slots[1].startAt.toISOString(), "2026-08-03T11:00:00.000Z");
});

test("calculateAvailability: enforces exact service duration fitting before closing time", () => {
  const startDate = new Date("2026-08-03T00:00:00.000Z");
  const endDate = new Date("2026-08-03T23:59:59.999Z");

  const options: AvailabilityQueryOptions = {
    startDate,
    endDate,
    serviceDurationMinutes: 45,
    slotIntervalMinutes: 30, // 30m steps
    operatingWindows: [
      { dayOfWeek: 1, openMinutes: 540, closeMinutes: 630 }, // 09:00 - 10:30 (90 mins total)
    ],
  };

  const slots = calculateAvailability(options);

  // Step 1: 09:00 -> 09:45 (fits within 10:30)
  // Step 2: 09:30 -> 10:15 (fits within 10:30)
  // Step 3: 10:00 -> 10:45 (exceeds closeMinutes 10:30 -> excluded)
  assert.equal(slots.length, 2);
  assert.equal(slots[0].startAt.toISOString(), "2026-08-03T09:00:00.000Z");
  assert.equal(slots[0].endAt.toISOString(), "2026-08-03T09:45:00.000Z");
  assert.equal(slots[1].startAt.toISOString(), "2026-08-03T09:30:00.000Z");
  assert.equal(slots[1].endAt.toISOString(), "2026-08-03T10:15:00.000Z");
});

test("calculateAvailability: handles custom slot interval steps", () => {
  const startDate = new Date("2026-08-03T00:00:00.000Z");
  const endDate = new Date("2026-08-03T23:59:59.999Z");

  const options: AvailabilityQueryOptions = {
    startDate,
    endDate,
    serviceDurationMinutes: 30,
    slotIntervalMinutes: 15, // 15-minute slot starts
    operatingWindows: [
      { dayOfWeek: 1, openMinutes: 540, closeMinutes: 600 }, // 09:00 - 10:00 (60 mins)
    ],
  };

  const slots = calculateAvailability(options);

  // 09:00-09:30, 09:15-09:45, 09:30-10:00
  assert.equal(slots.length, 3);
  assert.equal(slots[0].startAt.toISOString(), "2026-08-03T09:00:00.000Z");
  assert.equal(slots[1].startAt.toISOString(), "2026-08-03T09:15:00.000Z");
  assert.equal(slots[2].startAt.toISOString(), "2026-08-03T09:30:00.000Z");
});

test("calculateAvailability: strictly preserves UTC timestamps without local timezone corruption", () => {
  const startDate = new Date("2026-08-03T00:00:00.000Z");
  const endDate = new Date("2026-08-04T00:00:00.000Z");

  const options: AvailabilityQueryOptions = {
    startDate,
    endDate,
    serviceDurationMinutes: 60,
    operatingWindows: [
      { dayOfWeek: 1, openMinutes: 0, closeMinutes: 120 }, // 00:00 - 02:00 UTC
    ],
  };

  const slots = calculateAvailability(options);

  assert.equal(slots.length, 2);
  assert.equal(slots[0].startAt.toISOString(), "2026-08-03T00:00:00.000Z");
  assert.equal(slots[0].endAt.toISOString(), "2026-08-03T01:00:00.000Z");
  assert.equal(slots[1].startAt.toISOString(), "2026-08-03T01:00:00.000Z");
  assert.equal(slots[1].endAt.toISOString(), "2026-08-03T02:00:00.000Z");
});

test("validateAvailabilityQueryOptions: throws on invalid date inputs or reversed range", () => {
  assert.throws(() => {
    validateAvailabilityQueryOptions({
      startDate: new Date("invalid"),
      endDate: new Date("2026-08-03T10:00:00.000Z"),
      serviceDurationMinutes: 30,
      operatingWindows: [],
    });
  }, /Invalid startDate/);

  assert.throws(() => {
    validateAvailabilityQueryOptions({
      startDate: new Date("2026-08-03T12:00:00.000Z"),
      endDate: new Date("2026-08-03T10:00:00.000Z"), // reversed
      serviceDurationMinutes: 30,
      operatingWindows: [],
    });
  }, /endDate must be after startDate/);
});

test("validateAvailabilityQueryOptions: throws on invalid duration or capacity", () => {
  assert.throws(() => {
    validateAvailabilityQueryOptions({
      startDate: new Date("2026-08-03T00:00:00.000Z"),
      endDate: new Date("2026-08-03T10:00:00.000Z"),
      serviceDurationMinutes: -15,
      operatingWindows: [],
    });
  }, /serviceDurationMinutes must be an integer/);

  assert.throws(() => {
    validateAvailabilityQueryOptions({
      startDate: new Date("2026-08-03T00:00:00.000Z"),
      endDate: new Date("2026-08-03T10:00:00.000Z"),
      serviceDurationMinutes: 30,
      maxCapacity: 0,
      operatingWindows: [],
    });
  }, /maxCapacity must be a positive integer/);
});

test("validateAvailabilityQueryOptions: throws on invalid operating window specifications", () => {
  assert.throws(() => {
    validateAvailabilityQueryOptions({
      startDate: new Date("2026-08-03T00:00:00.000Z"),
      endDate: new Date("2026-08-03T10:00:00.000Z"),
      serviceDurationMinutes: 30,
      operatingWindows: [
        { dayOfWeek: 8, openMinutes: 540, closeMinutes: 600 }, // invalid day 8
      ],
    });
  }, /dayOfWeek must be an integer between 0 and 6/);

  assert.throws(() => {
    validateAvailabilityQueryOptions({
      startDate: new Date("2026-08-03T00:00:00.000Z"),
      endDate: new Date("2026-08-03T10:00:00.000Z"),
      serviceDurationMinutes: 30,
      operatingWindows: [
        { dayOfWeek: 1, openMinutes: 600, closeMinutes: 540 }, // close before open
      ],
    });
  }, /closeMinutes must be greater than openMinutes/);
});

test("calculateAvailability: pure and deterministic engine execution without side effects or mutations", () => {
  const options: AvailabilityQueryOptions = {
    startDate: new Date("2026-08-03T00:00:00.000Z"),
    endDate: new Date("2026-08-03T23:59:59.999Z"),
    serviceDurationMinutes: 60,
    operatingWindows: [
      { dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 },
    ],
  };

  const run1 = calculateAvailability(options);
  const run2 = calculateAvailability(options);

  assert.deepEqual(run1, run2);
  assert.equal(options.startDate.getTime(), new Date("2026-08-03T00:00:00.000Z").getTime());
});
