import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createWorkforceDomainEvent,
  WORKFORCE_EVENT_TYPES,
  WorkforceDomainEventSchema,
} from "../src/index.js";

const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

test("workforce domain events: constructs and validates EmployeeCreated event", () => {
  const event = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
    tenantId: TENANT_ID,
    aggregateId: EMPLOYEE_ID,
    payload: {
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      employeeNumber: "EMP-100",
      firstName: "John",
      lastName: "Doe",
      email: "john.doe@acme.com",
      hireDate: "2026-01-10",
      employmentType: "full_time",
      employmentStatus: "active",
    },
  });

  assert.ok(event.eventId);
  assert.equal(event.eventType, "employee.created");
  assert.equal(event.version, 1);
  assert.equal(event.payload.employeeNumber, "EMP-100");

  // Validate parsing via discriminated union schema
  const parsed = WorkforceDomainEventSchema.parse(event);
  assert.equal(parsed.eventType, "employee.created");
});

test("workforce domain events: constructs and validates Attendance ClockIn/ClockOut events", () => {
  const eventId = "44444444-4444-4444-8444-444444444444";
  const attendanceEventId = "55555555-5555-4555-8555-555555555555";

  const clockInEvent = createWorkforceDomainEvent({
    eventId,
    eventType: WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_IN,
    tenantId: TENANT_ID,
    aggregateId: attendanceEventId,
    payload: {
      attendanceEventId,
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      timestamp: "2026-07-31T08:00:00Z",
      idempotencyKey: "key-clockin-001",
      source: "mobile",
      location: { latitude: 37.7749, longitude: -122.4194 },
    },
  });

  assert.equal(clockInEvent.eventId, eventId);
  assert.equal(clockInEvent.eventType, "attendance.clocked_in");
  assert.equal(clockInEvent.payload.source, "mobile");

  const clockOutEvent = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.ATTENDANCE_CLOCKED_OUT,
    tenantId: TENANT_ID,
    aggregateId: attendanceEventId,
    payload: {
      attendanceEventId,
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      timestamp: "2026-07-31T17:00:00Z",
      idempotencyKey: "key-clockout-001",
      source: "web",
    },
  });

  assert.equal(clockOutEvent.eventType, "attendance.clocked_out");
});

test("workforce domain events: constructs and validates Attendance Correction events", () => {
  const correctionId = "66666666-6666-4666-8666-666666666666";
  const reviewerUserId = "77777777-7777-4777-8777-777777777777";

  const reqEvent = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.CORRECTION_REQUESTED,
    tenantId: TENANT_ID,
    aggregateId: correctionId,
    payload: {
      correctionId,
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      requestedEventType: "clock_in",
      requestedTimestamp: "2026-07-31T08:05:00Z",
      reason: "Badge scanner error at main gate",
    },
  });

  assert.equal(reqEvent.eventType, "attendance.correction_requested");

  const approvedEvent = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.CORRECTION_APPROVED,
    tenantId: TENANT_ID,
    aggregateId: correctionId,
    payload: {
      correctionId,
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      reviewedByUserId: reviewerUserId,
      reviewNotes: "Approved by HR manager",
    },
  });

  assert.equal(approvedEvent.eventType, "attendance.correction_approved");

  const rejectedEvent = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.CORRECTION_REJECTED,
    tenantId: TENANT_ID,
    aggregateId: correctionId,
    payload: {
      correctionId,
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      reviewedByUserId: reviewerUserId,
      reviewNotes: "Inconsistent security logs",
    },
  });

  assert.equal(rejectedEvent.eventType, "attendance.correction_rejected");
});

test("workforce domain events: verifies status transition events (Suspend, Terminate, Transfer)", () => {
  const suspended = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_SUSPENDED,
    tenantId: TENANT_ID,
    aggregateId: EMPLOYEE_ID,
    payload: {
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      reason: "Pending investigation",
    },
  });
  assert.equal(suspended.payload.reason, "Pending investigation");

  const terminated = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_TERMINATED,
    tenantId: TENANT_ID,
    aggregateId: EMPLOYEE_ID,
    payload: {
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      terminationDate: "2026-08-01",
      reason: "Resignation",
    },
  });
  assert.equal(terminated.payload.terminationDate, "2026-08-01");

  const transferred = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_TRANSFERRED,
    tenantId: TENANT_ID,
    aggregateId: EMPLOYEE_ID,
    payload: {
      employeeId: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      fromBranchId: "HQ",
      toBranchId: "NORTH-BRANCH",
      effectiveDate: "2026-08-15",
    },
  });
  assert.equal(transferred.payload.toBranchId, "NORTH-BRANCH");
});

test("workforce domain events: rejects invalid payload and invalid envelope fields", () => {
  // Invalid UUID for aggregateId
  assert.throws(() => {
    createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_SUSPENDED,
      tenantId: TENANT_ID,
      aggregateId: "not-a-uuid",
      payload: {
        employeeId: EMPLOYEE_ID,
        tenantId: TENANT_ID,
        reason: "Suspension test",
      },
    });
  });

  // Invalid email format in EmployeeCreated payload
  assert.throws(() => {
    createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
      tenantId: TENANT_ID,
      aggregateId: EMPLOYEE_ID,
      payload: {
        employeeId: EMPLOYEE_ID,
        tenantId: TENANT_ID,
        employeeNumber: "EMP-100",
        firstName: "John",
        lastName: "Doe",
        email: "bad-email",
        hireDate: "2026-01-10",
        employmentType: "full_time",
        employmentStatus: "active",
      },
    });
  });
});

test("workforce domain events: ensures JSON serialization roundtrip consistency", () => {
  const event = createWorkforceDomainEvent({
    eventType: WORKFORCE_EVENT_TYPES.BREAK_STARTED,
    tenantId: TENANT_ID,
    aggregateId: "88888888-8888-4888-8888-888888888888",
    payload: {
      attendanceEventId: "88888888-8888-4888-8888-888888888888",
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      timestamp: "2026-07-31T12:00:00Z",
      idempotencyKey: "break-key-01",
      source: "kiosk",
    },
  });

  const serialized = JSON.stringify(event);
  const jsonParsed = JSON.parse(serialized);
  const domainParsed = WorkforceDomainEventSchema.parse(jsonParsed);

  assert.equal(domainParsed.eventType, "attendance.break_started");
  assert.equal(domainParsed.payload.idempotencyKey, "break-key-01");
});
