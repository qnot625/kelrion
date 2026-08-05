import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Employee,
  EmployeeDomainError,
  WORKFORCE_EVENT_TYPES,
  WorkforceDomainEventSchema,
} from "../src/index.js";

const VALID_TENANT_ID = "11111111-1111-4111-8111-111111111111";
const VALID_EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const VALID_DEPT_ID = "33333333-3333-4333-8333-333333333333";
const VALID_POS_ID = "44444444-4444-4444-8444-444444444444";
const VALID_MANAGER_ID = "55555555-5555-4555-8555-555555555555";

test("Employee aggregate: creates new employee and emits EmployeeCreated event", () => {
  const employee = Employee.create({
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1001",
    firstName: "Jane",
    lastName: "Doe",
    email: "jane.doe@example.com",
    hireDate: "2026-01-15",
    employmentType: "full_time",
  });

  assert.equal(employee.id, VALID_EMPLOYEE_ID);
  assert.equal(employee.tenantId, VALID_TENANT_ID);
  assert.equal(employee.employeeNumber, "EMP-1001");
  assert.equal(employee.firstName, "Jane");
  assert.equal(employee.lastName, "Doe");
  assert.equal(employee.email, "jane.doe@example.com");
  assert.equal(employee.hireDate, "2026-01-15");
  assert.equal(employee.employmentType, "full_time");
  assert.equal(employee.employmentStatus, "active");
  assert.equal(employee.departmentId, null);
  assert.equal(employee.positionId, null);
  assert.equal(employee.managerId, null);
  assert.equal(employee.terminationDate, null);

  const events = employee.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED);
  assert.equal(events[0].aggregateId, VALID_EMPLOYEE_ID);
  assert.equal(events[0].tenantId, VALID_TENANT_ID);

  // Validate emitted event with schema
  const parsed = WorkforceDomainEventSchema.safeParse(events[0]);
  assert.equal(parsed.success, true);
});

test("Employee aggregate: reconstitutes from existing state without emitting events", () => {
  const now = new Date().toISOString();
  const employee = Employee.reconstitute({
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1002",
    firstName: "John",
    lastName: "Smith",
    email: "john.smith@example.com",
    hireDate: "2025-06-01",
    employmentType: "part_time",
    employmentStatus: "suspended",
    departmentId: VALID_DEPT_ID,
    positionId: VALID_POS_ID,
    managerId: VALID_MANAGER_ID,
    branchId: "branch-01",
    terminationDate: null,
    createdAt: now,
    updatedAt: now,
  });

  assert.equal(employee.id, VALID_EMPLOYEE_ID);
  assert.equal(employee.employmentStatus, "suspended");
  assert.equal(employee.departmentId, VALID_DEPT_ID);
  assert.equal(employee.getUncommittedEvents().length, 0);
});

test("Employee aggregate: converts to value objects toRef() and toPlacement()", () => {
  const employee = Employee.create({
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1003",
    firstName: "Alice",
    lastName: "Johnson",
    email: "alice.j@example.com",
    hireDate: "2026-02-01",
    employmentType: "full_time",
    departmentId: VALID_DEPT_ID,
    positionId: VALID_POS_ID,
    managerId: VALID_MANAGER_ID,
  });

  const ref = employee.toRef();
  assert.deepEqual(ref, {
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1003",
    firstName: "Alice",
    lastName: "Johnson",
    email: "alice.j@example.com",
  });

  const placement = employee.toPlacement();
  assert.deepEqual(placement, {
    employeeId: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    departmentId: VALID_DEPT_ID,
    positionId: VALID_POS_ID,
    managerId: VALID_MANAGER_ID,
    branchId: null,
    employmentType: "full_time",
    employmentStatus: "active",
    hireDate: "2026-02-01",
    terminationDate: null,
  });
});

test("Employee aggregate: updates profile and records EmployeeUpdated event", () => {
  const employee = Employee.create({
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1004",
    firstName: "Bob",
    lastName: "Williams",
    email: "bob.w@example.com",
    hireDate: "2026-03-01",
    employmentType: "full_time",
  });

  employee.clearUncommittedEvents();

  employee.updateProfile({
    firstName: "Robert",
    email: "robert.williams@example.com",
  });

  assert.equal(employee.firstName, "Robert");
  assert.equal(employee.email, "robert.williams@example.com");

  const events = employee.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, WORKFORCE_EVENT_TYPES.EMPLOYEE_UPDATED);
  assert.deepEqual((events[0].payload as { changes: Record<string, unknown> }).changes, {
    firstName: "Robert",
    email: "robert.williams@example.com",
  });
});

test("Employee aggregate: handles suspend, activate, and terminate lifecycle", () => {
  const employee = Employee.create({
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1005",
    firstName: "Charlie",
    lastName: "Brown",
    email: "charlie@example.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
  });

  employee.clearUncommittedEvents();

  // Suspend
  employee.suspend("Policy violation investigation");
  assert.equal(employee.employmentStatus, "suspended");
  let events = employee.getUncommittedEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, WORKFORCE_EVENT_TYPES.EMPLOYEE_SUSPENDED);

  // Activate
  employee.activate("Investigation cleared");
  assert.equal(employee.employmentStatus, "active");
  events = employee.getUncommittedEvents();
  assert.equal(events.length, 2);
  assert.equal(events[1].eventType, WORKFORCE_EVENT_TYPES.EMPLOYEE_ACTIVATED);

  // Terminate
  employee.terminate({ terminationDate: "2026-07-31", reason: "Resignation" });
  assert.equal(employee.employmentStatus, "terminated");
  assert.equal(employee.terminationDate, "2026-07-31");
  events = employee.getUncommittedEvents();
  assert.equal(events.length, 3);
  assert.equal(events[2].eventType, WORKFORCE_EVENT_TYPES.EMPLOYEE_TERMINATED);
});

test("Employee aggregate: handles assignments (department, position, manager, transfer)", () => {
  const employee = Employee.create({
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1006",
    firstName: "Diana",
    lastName: "Prince",
    email: "diana@example.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
  });

  employee.clearUncommittedEvents();

  employee.assignDepartment(VALID_DEPT_ID);
  assert.equal(employee.departmentId, VALID_DEPT_ID);

  employee.assignPosition(VALID_POS_ID);
  assert.equal(employee.positionId, VALID_POS_ID);

  employee.assignManager(VALID_MANAGER_ID);
  assert.equal(employee.managerId, VALID_MANAGER_ID);

  employee.transfer({ toBranchId: "branch-west", effectiveDate: "2026-08-01" });
  assert.equal(employee.branchId, "branch-west");

  const events = employee.getUncommittedEvents();
  assert.equal(events.length, 4);
  assert.equal(events[0].eventType, WORKFORCE_EVENT_TYPES.DEPARTMENT_ASSIGNED);
  assert.equal(events[1].eventType, WORKFORCE_EVENT_TYPES.POSITION_ASSIGNED);
  assert.equal(events[2].eventType, WORKFORCE_EVENT_TYPES.MANAGER_ASSIGNED);
  assert.equal(events[3].eventType, WORKFORCE_EVENT_TYPES.EMPLOYEE_TRANSFERRED);
});

test("Employee aggregate invariants: enforces validation errors and state transition protections", () => {
  // Invalid Creation
  assert.throws(
    () =>
      Employee.create({
        id: "invalid-uuid",
        tenantId: VALID_TENANT_ID,
        employeeNumber: "",
        firstName: "Invalid",
        lastName: "User",
        email: "not-an-email",
        hireDate: "invalid-date",
        employmentType: "full_time",
      }),
    EmployeeDomainError
  );

  // Self Manager Creation Error
  assert.throws(
    () =>
      Employee.create({
        id: VALID_EMPLOYEE_ID,
        tenantId: VALID_TENANT_ID,
        employeeNumber: "EMP-1007",
        firstName: "Self",
        lastName: "Manager",
        email: "self@example.com",
        hireDate: "2026-01-01",
        employmentType: "full_time",
        managerId: VALID_EMPLOYEE_ID,
      }),
    EmployeeDomainError
  );

  const employee = Employee.create({
    id: VALID_EMPLOYEE_ID,
    tenantId: VALID_TENANT_ID,
    employeeNumber: "EMP-1008",
    firstName: "Eve",
    lastName: "Adams",
    email: "eve@example.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
  });

  // Cannot activate already active employee
  assert.throws(() => employee.activate(), EmployeeDomainError);

  // Cannot suspend without reason
  assert.throws(() => employee.suspend(""), EmployeeDomainError);

  // Self manager assignment error
  assert.throws(() => employee.assignManager(VALID_EMPLOYEE_ID), EmployeeDomainError);

  // Terminate employee
  employee.terminate({ terminationDate: "2026-07-31" });

  // Cannot perform actions on terminated employee
  assert.throws(() => employee.updateProfile({ firstName: "NewEve" }), EmployeeDomainError);
  assert.throws(() => employee.activate(), EmployeeDomainError);
  assert.throws(() => employee.suspend("Test"), EmployeeDomainError);
  assert.throws(() => employee.terminate({ terminationDate: "2026-08-01" }), EmployeeDomainError);
  assert.throws(() => employee.assignDepartment(VALID_DEPT_ID), EmployeeDomainError);
  assert.throws(() => employee.assignPosition(VALID_POS_ID), EmployeeDomainError);
  assert.throws(() => employee.assignManager(VALID_MANAGER_ID), EmployeeDomainError);
  assert.throws(
    () => employee.transfer({ toBranchId: "branch-2", effectiveDate: "2026-08-01" }),
    EmployeeDomainError
  );
});
