import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AttendanceEventSchema,
  AttendanceSummarySchema,
  CreateEmployeeSchema,
  EmployeeRefSchema,
  EmploymentPlacementSchema,
  RecordAttendanceEventSchema,
  RequestAttendanceCorrectionSchema,
} from "../src/index.js";

test("workforce-core contracts: validates EmployeeRef and EmploymentPlacement value objects", () => {
  const validEmployeeRef = {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    employeeNumber: "EMP-001",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane.doe@acme.com",
  };

  const parsedRef = EmployeeRefSchema.parse(validEmployeeRef);
  assert.equal(parsedRef.employeeNumber, "EMP-001");

  const validPlacement = {
    employeeId: validEmployeeRef.id,
    tenantId: validEmployeeRef.tenantId,
    departmentId: "33333333-3333-4333-8333-333333333333",
    positionId: null,
    managerId: null,
    branchId: "MAIN-BRANCH",
    employmentType: "full_time" as const,
    employmentStatus: "active" as const,
    hireDate: "2026-01-15",
    terminationDate: null,
  };

  const parsedPlacement = EmploymentPlacementSchema.parse(validPlacement);
  assert.equal(parsedPlacement.employmentType, "full_time");
  assert.equal(parsedPlacement.employmentStatus, "active");
});

test("workforce-core contracts: validates AttendanceEvent and AttendanceSummary value objects", () => {
  const validEvent = {
    id: "44444444-4444-4444-8444-444444444444",
    tenantId: "22222222-2222-4222-8222-222222222222",
    employeeId: "11111111-1111-4111-8111-111111111111",
    eventType: "clock_in" as const,
    timestamp: "2026-07-30T08:00:00Z",
    idempotencyKey: "key-12345",
    source: "web" as const,
    location: { latitude: 37.7749, longitude: -122.4194 },
    notes: "Shift start",
    createdAt: "2026-07-30T08:00:01Z",
  };

  const parsedEvent = AttendanceEventSchema.parse(validEvent);
  assert.equal(parsedEvent.eventType, "clock_in");

  const validSummary = {
    id: "55555555-5555-4555-8555-555555555555",
    tenantId: "22222222-2222-4222-8222-222222222222",
    employeeId: "11111111-1111-4111-8111-111111111111",
    workDate: "2026-07-30",
    firstClockIn: "2026-07-30T08:00:00Z",
    lastClockOut: "2026-07-30T17:00:00Z",
    totalWorkMinutes: 480,
    totalBreakMinutes: 60,
    overtimeMinutes: 0,
    status: "present" as const,
    createdAt: "2026-07-30T17:00:01Z",
    updatedAt: "2026-07-30T17:00:01Z",
  };

  const parsedSummary = AttendanceSummarySchema.parse(validSummary);
  assert.equal(parsedSummary.totalWorkMinutes, 480);
});

test("workforce-core contracts: enforces validation rules on input schemas", () => {
  // Invalid email in CreateEmployeeSchema
  assert.throws(() => {
    CreateEmployeeSchema.parse({
      tenantId: "22222222-2222-4222-8222-222222222222",
      employeeNumber: "EMP-002",
      firstName: "Bob",
      lastName: "Smith",
      email: "invalid-email",
      hireDate: "2026-02-01",
    });
  });

  // Invalid date format in hireDate
  assert.throws(() => {
    CreateEmployeeSchema.parse({
      tenantId: "22222222-2222-4222-8222-222222222222",
      employeeNumber: "EMP-002",
      firstName: "Bob",
      lastName: "Smith",
      email: "bob@acme.com",
      hireDate: "02/01/2026",
    });
  });

  // RecordAttendanceEventSchema parsing
  const recordInput = RecordAttendanceEventSchema.parse({
    tenantId: "22222222-2222-4222-8222-222222222222",
    employeeId: "11111111-1111-4111-8111-111111111111",
    eventType: "clock_out",
    timestamp: "2026-07-30T17:00:00Z",
    idempotencyKey: "out-key-999",
  });
  assert.equal(recordInput.source, "web"); // default

  // Correction request with empty reason fails
  assert.throws(() => {
    RequestAttendanceCorrectionSchema.parse({
      tenantId: "22222222-2222-4222-8222-222222222222",
      employeeId: "11111111-1111-4111-8111-111111111111",
      requestedEventType: "clock_in",
      requestedTimestamp: "2026-07-30T08:00:00Z",
      reason: "",
    });
  });
});
