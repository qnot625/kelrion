import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EmployeeNotFoundError,
  EmployeeService,
  InMemoryEmployeeRepository,
  EmployeeDomainError,
} from "../src/index.js";

test("EmployeeService — CRUD operations, hierarchy validation, and audit recording", async () => {
  const repo = new InMemoryEmployeeRepository();
  const auditLogs: Array<{ action: string; [key: string]: unknown }> = [];
  const mockAudit = {
    record: async (entry: { action: string; [key: string]: unknown }) => {
      auditLogs.push(entry);
    },
  };

  const service = new EmployeeService(repo, mockAudit);
  const tenantId = "11111111-1111-4111-8111-111111111111";

  // 1. Create employee
  const emp1 = await service.createEmployee(tenantId, "user-admin", {
    employeeNumber: "EMP-001",
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@acme.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
  });

  assert.equal(emp1.firstName, "Alice");
  assert.equal(emp1.employeeNumber, "EMP-001");
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "employee.created");

  // 2. Reject duplicate employee number
  await assert.rejects(
    async () => {
      await service.createEmployee(tenantId, "user-admin", {
        employeeNumber: "EMP-001",
        firstName: "Bob",
        lastName: "Jones",
        email: "bob@acme.com",
        hireDate: "2026-01-01",
        employmentType: "full_time",
      });
    },
    (err: unknown) => err instanceof EmployeeDomainError && err.message.includes("already exists"),
  );

  // 3. Create second employee under emp1 as manager
  const emp2 = await service.createEmployee(tenantId, "user-admin", {
    employeeNumber: "EMP-002",
    firstName: "Bob",
    lastName: "Jones",
    email: "bob@acme.com",
    hireDate: "2026-01-01",
    employmentType: "full_time",
    managerId: emp1.id,
  });

  assert.equal(emp2.managerId, emp1.id);

  // 4. Reject circular hierarchy assignment (making emp1's manager = emp2)
  await assert.rejects(
    async () => {
      await service.assignManager(tenantId, "user-admin", emp1.id, emp2.id);
    },
    (err: unknown) => err instanceof EmployeeDomainError && err.message.includes("Circular reporting hierarchy"),
  );

  // 5. Update profile
  const updated = await service.updateEmployee(tenantId, "user-admin", emp2.id, {
    firstName: "Robert",
  });
  assert.equal(updated.firstName, "Robert");

  // 6. Change employment status
  const suspended = await service.updateEmploymentStatus(
    tenantId,
    "user-admin",
    emp2.id,
    "suspend",
    "Policy violation",
  );
  assert.equal(suspended.employmentStatus, "suspended");

  const reactivated = await service.updateEmploymentStatus(
    tenantId,
    "user-admin",
    emp2.id,
    "reactivate",
  );
  assert.equal(reactivated.employmentStatus, "active");

  // 7. Get by ID
  const fetched = await service.getEmployeeById(tenantId, emp1.id);
  assert.equal(fetched.id, emp1.id);

  // 8. List & pagination
  const listResult = await service.listEmployees(tenantId, { limit: 10, offset: 0 });
  assert.equal(listResult.total, 2);
  assert.equal(listResult.data.length, 2);

  // 9. Delete employee
  const delRes = await service.deleteEmployee(tenantId, "user-admin", emp2.id);
  assert.equal(delRes.success, true);

  await assert.rejects(
    async () => {
      await service.getEmployeeById(tenantId, emp2.id);
    },
    (err: unknown) => err instanceof EmployeeNotFoundError,
  );
});
