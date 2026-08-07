import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EmployeeService,
  InMemoryEmployeeRepository,
  WorkforceValidationError,
} from "../src/index.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function employeeInput(employeeNumber: string, email: string) {
  return {
    employeeNumber,
    firstName: "Ada",
    lastName: "Lovelace",
    email,
    hireDate: "2026-01-15",
    employmentType: "full_time" as const,
  };
}

test("employee records enforce tenant uniqueness while allowing the same identifiers in another tenant", async () => {
  const repository = new InMemoryEmployeeRepository();
  const service = new EmployeeService(repository);
  const first = await service.create(tenantA, null, { ...employeeInput("EMP-001", "ada@example.com"), userId: userA });
  assert.equal(first.userId, userA);

  await assert.rejects(
    service.create(tenantA, null, employeeInput("EMP-001", "other@example.com")),
    WorkforceValidationError,
  );
  await assert.rejects(
    service.create(tenantA, null, employeeInput("EMP-002", "ada@example.com")),
    WorkforceValidationError,
  );

  const otherTenant = await service.create(tenantB, null, employeeInput("EMP-001", "ada@example.com"));
  assert.notEqual(first.id, otherTenant.id);
  assert.equal((await service.list(tenantA)).total, 1);
  assert.equal((await service.list(tenantB)).total, 1);
});

test("manager hierarchy rejects reporting cycles and terminated managers", async () => {
  const repository = new InMemoryEmployeeRepository();
  const service = new EmployeeService(repository);
  const manager = await service.create(tenantA, null, employeeInput("MGR-001", "manager@example.com"));
  const report = await service.create(tenantA, null, {
    ...employeeInput("EMP-002", "report@example.com"),
    managerId: manager.id,
  });

  await assert.rejects(
    service.update(tenantA, null, manager.id, { managerId: report.id }),
    /reporting cycle/,
  );

  await service.changeStatus(tenantA, null, manager.id, "terminated", "2026-07-31");
  await assert.rejects(
    service.create(tenantA, null, { ...employeeInput("EMP-003", "new@example.com"), managerId: manager.id }),
    /terminated employee cannot be assigned as manager/,
  );
});

test("user links are unique inside a tenant and support self-service lookup", async () => {
  const repository = new InMemoryEmployeeRepository();
  const service = new EmployeeService(repository);
  const employee = await service.create(tenantA, null, { ...employeeInput("EMP-010", "linked@example.com"), userId: userA });
  assert.equal((await service.getByUserId(tenantA, userA))?.id, employee.id);
  await assert.rejects(
    service.create(tenantA, null, { ...employeeInput("EMP-011", "other@example.com"), userId: userA }),
    /already linked/,
  );
});
