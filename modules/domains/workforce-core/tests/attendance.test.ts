import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AttendanceIdempotencyConflictError,
  AttendanceService,
  EmployeeService,
  InMemoryAttendanceCorrectionRepository,
  InMemoryAttendanceRepository,
  InMemoryEmployeeRepository,
} from "../src/index.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

async function setup() {
  const employees = new InMemoryEmployeeRepository();
  const employeeService = new EmployeeService(employees);
  const employee = await employeeService.create(tenantId, userId, {
    userId,
    employeeNumber: "EMP-100",
    firstName: "Grace",
    lastName: "Hopper",
    email: "grace@example.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
  });
  const records = new InMemoryAttendanceRepository();
  const corrections = new InMemoryAttendanceCorrectionRepository();
  return { employee, records, corrections, service: new AttendanceService(employees, records, corrections) };
}

test("attendance state machine tracks breaks and active work minutes", async () => {
  const { employee, service } = await setup();
  await service.apply({ tenantId, employeeId: employee.id, action: "clock_in", timestamp: new Date("2026-08-06T08:00:00Z") });
  await service.apply({ tenantId, employeeId: employee.id, action: "break_start", timestamp: new Date("2026-08-06T12:00:00Z") });
  await service.apply({ tenantId, employeeId: employee.id, action: "break_end", timestamp: new Date("2026-08-06T12:30:00Z") });
  const final = await service.apply({ tenantId, employeeId: employee.id, action: "clock_out", timestamp: new Date("2026-08-06T17:00:00Z") });
  assert.equal(final.status, "clocked_out");
  assert.equal(final.totalBreakMinutes, 30);
  assert.equal(final.activeDurationMinutes, 510);
});

test("idempotency returns the original record and rejects payload reuse", async () => {
  const { employee, service } = await setup();
  const input = {
    tenantId,
    employeeId: employee.id,
    action: "clock_in" as const,
    timestamp: new Date("2026-08-06T08:00:00Z"),
    idempotencyKey: "device-1:event-1",
  };
  const first = await service.apply(input);
  const duplicate = await service.apply(input);
  assert.equal(duplicate.id, first.id);

  await assert.rejects(
    service.apply({ ...input, timestamp: new Date("2026-08-06T08:05:00Z") }),
    AttendanceIdempotencyConflictError,
  );
});

test("batch sync reports duplicates and correction approval applies the requested event", async () => {
  const { employee, service } = await setup();
  const batchItem = {
    employeeId: employee.id,
    action: "clock_in" as const,
    timestamp: new Date("2026-08-07T08:00:00Z"),
    idempotencyKey: "offline:001",
    source: "mobile" as const,
  };
  const first = await service.sync(tenantId, [batchItem], userId);
  const second = await service.sync(tenantId, [batchItem], userId);
  assert.equal(first[0]?.status, "processed");
  assert.equal(second[0]?.status, "duplicate");

  const correction = await service.requestCorrection(tenantId, userId, {
    employeeId: employee.id,
    requestedAction: "clock_in",
    requestedAt: new Date("2026-08-08T09:00:00Z"),
    reason: "Forgot to clock in",
  });
  const reviewed = await service.reviewCorrection(tenantId, userId, correction.id, true, "Approved from manager review");
  assert.equal(reviewed.status, "approved");
  const record = await service.list(tenantId, { employeeId: employee.id, startDate: "2026-08-08", endDate: "2026-08-08" });
  assert.equal(record[0]?.status, "clocked_in");
});
