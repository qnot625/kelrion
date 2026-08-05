import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AttendanceDomainError,
  AttendanceRecord,
  WORKFORCE_EVENT_TYPES,
  WorkforceDomainEventSchema,
} from "../src/index.js";

const VALID_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const VALID_EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const VALID_RECORD_ID = "33333333-3333-4333-8333-333333333333";

test("AttendanceRecord: factory creation in IDLE state", () => {
  const record = AttendanceRecord.create({
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
  });

  assert.equal(record.id, VALID_RECORD_ID);
  assert.equal(record.tenantId, VALID_TENANT_ID);
  assert.equal(record.employeeId, VALID_EMPLOYEE_ID);
  assert.equal(record.workDate, "2026-08-01");
  assert.equal(record.status, "IDLE");
  assert.equal(record.clockInTime, null);
  assert.equal(record.clockOutTime, null);
  assert.equal(record.activeDurationMinutes, 0);
  assert.equal(record.totalBreakMinutes, 0);
  assert.equal(record.breaks.length, 0);
  assert.equal(record.exceptions.length, 0);
  assert.equal(record.getUncommittedEvents().length, 0);
});

test("AttendanceRecord: creation with initial clock-in time", () => {
  const clockInIso = "2026-08-01T08:00:00.000Z";
  const record = AttendanceRecord.create({
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
    clockInTime: clockInIso,
  });

  assert.equal(record.status, "CLOCKED_IN");
  assert.equal(record.clockInTime, clockInIso);

  const events = record.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_IN);
  assert.equal(events[0].tenantId, VALID_TENANT_ID);
  assert.equal(events[0].aggregateId, VALID_RECORD_ID);

  const parsed = WorkforceDomainEventSchema.safeParse(events[0]);
  assert.equal(parsed.success, true);
});

test("AttendanceRecord: validation errors on invalid IDs or work date format", () => {
  assert.throws(
    () => AttendanceRecord.create({ tenantId: "invalid", employeeId: VALID_EMPLOYEE_ID, workDate: "2026-08-01" }),
    AttendanceDomainError
  );
  assert.throws(
    () => AttendanceRecord.create({ tenantId: VALID_TENANT_ID, employeeId: "invalid", workDate: "2026-08-01" }),
    AttendanceDomainError
  );
  assert.throws(
    () => AttendanceRecord.create({ tenantId: VALID_TENANT_ID, employeeId: VALID_EMPLOYEE_ID, workDate: "08/01/2026" }),
    AttendanceDomainError
  );
});

test("AttendanceRecord: clock-in lifecycle & event emission", () => {
  const record = AttendanceRecord.create({
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
  });

  const clockInTime = "2026-08-01T08:30:00.000Z";
  record.clockIn(clockInTime, { source: "mobile", notes: "Morning clock-in" });

  assert.equal(record.status, "CLOCKED_IN");
  assert.equal(record.clockInTime, clockInTime);

  const events = record.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_IN);

  // Duplicate clock in throws domain error
  assert.throws(() => record.clockIn("2026-08-01T08:35:00.000Z"), AttendanceDomainError);
});

test("AttendanceRecord: break lifecycle (startBreak, endBreak)", () => {
  const record = AttendanceRecord.create({
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:00:00.000Z",
  });

  record.clearUncommittedEvents();

  // Start break
  const breakStartIso = "2026-08-01T12:00:00.000Z";
  record.startBreak(breakStartIso);

  assert.equal(record.status, "ON_BREAK");
  assert.equal(record.breaks.length, 1);
  assert.equal(record.breaks[0].startTime, breakStartIso);
  assert.equal(record.breaks[0].endTime, null);

  let events = record.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, WORKFORCE_EVENT_TYPES.BREAK_STARTED);

  // Cannot start second break while on break
  assert.throws(() => record.startBreak("2026-08-01T12:15:00.000Z"), AttendanceDomainError);

  // End break
  const breakEndIso = "2026-08-01T12:30:00.000Z";
  record.endBreak(breakEndIso);

  assert.equal(record.status, "CLOCKED_IN");
  assert.equal(record.breaks[0].endTime, breakEndIso);
  assert.equal(record.breaks[0].durationMinutes, 30);
  assert.equal(record.totalBreakMinutes, 30);

  events = record.getUncommittedEvents();
  assert.equal(events.length, 2);
  assert.equal(events[1].eventType, WORKFORCE_EVENT_TYPES.BREAK_ENDED);

  // Validate events with schema
  for (const ev of events) {
    const parsed = WorkforceDomainEventSchema.safeParse(ev);
    assert.equal(parsed.success, true);
  }
});

test("AttendanceRecord: clock-out & active duration calculation", () => {
  const record = AttendanceRecord.create({
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:00:00.000Z",
  });

  // Lunch break 12:00 - 13:00 (60 mins)
  record.startBreak("2026-08-01T12:00:00.000Z");
  record.endBreak("2026-08-01T13:00:00.000Z");

  // Clock out at 17:00 (Total elapsed: 9 hours = 540 mins)
  const clockOutTime = "2026-08-01T17:00:00.000Z";
  record.clockOut(clockOutTime);

  assert.equal(record.status, "CLOCKED_OUT");
  assert.equal(record.clockOutTime, clockOutTime);
  assert.equal(record.totalBreakMinutes, 60);
  assert.equal(record.activeDurationMinutes, 480); // 540 - 60 = 480 mins (8 hours)

  const events = record.getUncommittedEvents();
  const clockedOutEv = events.find((e) => e.eventType === WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_OUT);
  assert.notEqual(clockedOutEv, undefined);

  const parsed = WorkforceDomainEventSchema.safeParse(clockedOutEv);
  assert.equal(parsed.success, true);
});

test("AttendanceRecord: auto-closing active break on clock-out", () => {
  const record = AttendanceRecord.create({
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T08:00:00.000Z",
  });

  record.startBreak("2026-08-01T12:00:00.000Z");
  assert.equal(record.status, "ON_BREAK");

  // Clock out directly while on break at 16:00
  record.clockOut("2026-08-01T16:00:00.000Z");

  assert.equal(record.status, "CLOCKED_OUT");
  assert.equal(record.breaks[0].endTime, "2026-08-01T16:00:00.000Z");
  assert.equal(record.breaks[0].durationMinutes, 240); // 4 hours
  assert.equal(record.totalBreakMinutes, 240);
  assert.equal(record.activeDurationMinutes, 240); // 8 hours elapsed - 4 hours break = 4 hours active
});

test("AttendanceRecord: exception detection (Late arrival, excessive break, early departure)", () => {
  const record = AttendanceRecord.create({
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
    clockInTime: "2026-08-01T09:15:00.000Z", // Shift expected at 09:00 -> 15 mins late
  });

  // Long break 90 mins (Threshold = 60 mins)
  record.startBreak("2026-08-01T12:00:00.000Z");
  record.endBreak("2026-08-01T13:30:00.000Z");

  // Clock out early at 16:30 (Expected shift end 17:00 -> 30 mins early)
  record.clockOut("2026-08-01T16:30:00.000Z");

  const exceptions = record.detectExceptions("2026-08-01T09:00:00.000Z", "2026-08-01T17:00:00.000Z", 60);

  assert.equal(exceptions.length, 3);
  assert.equal(exceptions.some((e) => e.type === "LATE_ARRIVAL"), true);
  assert.equal(exceptions.some((e) => e.type === "EXCESSIVE_BREAK"), true);
  assert.equal(exceptions.some((e) => e.type === "EARLY_DEPARTURE"), true);

  const events = record.getUncommittedEvents();
  const exceptionEvents = events.filter((e) => e.eventType === WORKFORCE_EVENT_TYPES.ATTENDANCE_EXCEPTION_DETECTED);
  assert.equal(exceptionEvents.length, 3);

  for (const ev of exceptionEvents) {
    const parsed = WorkforceDomainEventSchema.safeParse(ev);
    assert.equal(parsed.success, true);
  }
});

test("AttendanceRecord: reconstitution from state without emitting events", () => {
  const state = {
    id: VALID_RECORD_ID,
    tenantId: VALID_TENANT_ID,
    employeeId: VALID_EMPLOYEE_ID,
    workDate: "2026-08-01",
    status: "CLOCKED_OUT" as const,
    clockInTime: "2026-08-01T08:00:00.000Z",
    clockOutTime: "2026-08-01T17:00:00.000Z",
    breaks: [
      {
        breakId: "44444444-4444-4444-8444-444444444444",
        startTime: "2026-08-01T12:00:00.000Z",
        endTime: "2026-08-01T13:00:00.000Z",
        durationMinutes: 60,
      },
    ],
    activeDurationMinutes: 480,
    totalBreakMinutes: 60,
    exceptions: [],
    createdAt: "2026-08-01T08:00:00.000Z",
    updatedAt: "2026-08-01T17:00:00.000Z",
  };

  const record = AttendanceRecord.reconstitute(state);

  assert.equal(record.id, VALID_RECORD_ID);
  assert.equal(record.status, "CLOCKED_OUT");
  assert.equal(record.activeDurationMinutes, 480);
  assert.equal(record.totalBreakMinutes, 60);
  assert.equal(record.getUncommittedEvents().length, 0);

  const summary = record.toSummary();
  assert.equal(summary.id, VALID_RECORD_ID);
  assert.equal(summary.totalWorkMinutes, 480);
  assert.equal(summary.totalBreakMinutes, 60);
  assert.equal(summary.status, "present");
});
