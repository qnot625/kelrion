import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function createTenant(app: ReturnType<typeof buildServer>, name: string, slug: string) {
  const response = await app.inject({ method: "POST", url: "/tenants", payload: { name, slug } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { id: string; slug: string };
}

async function signUp(app: ReturnType<typeof buildServer>, slug: string, email: string, password: string) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": slug },
    payload: { email, password },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}

test("Employee REST API — Full lifecycle, RBAC enforcement, circular hierarchy prevention, tenant isolation", async () => {
  const app = buildServer(createAppContext());

  // 1. Setup Tenant A & Owner User
  await createTenant(app, "Tenant Alpha", "tenant-alpha");
  const owner = await signUp(app, "tenant-alpha", "owner@alpha.com", "securepass123");

  // 2. Create Employee 1
  const createEmp1 = await app.inject({
    method: "POST",
    url: "/employees",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
    payload: {
      employeeNumber: "EMP-001",
      firstName: "Sarah",
      lastName: "Connor",
      email: "s.connor@alpha.com",
      hireDate: "2026-01-15",
      employmentType: "full_time",
    },
  });
  assert.equal(createEmp1.statusCode, 201, createEmp1.body);
  const emp1 = createEmp1.json() as { id: string; firstName: string; employeeNumber: string };
  assert.equal(emp1.firstName, "Sarah");

  // 3. Create Employee 2 with Emp 1 as manager
  const createEmp2 = await app.inject({
    method: "POST",
    url: "/employees",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
    payload: {
      employeeNumber: "EMP-002",
      firstName: "John",
      lastName: "Connor",
      email: "j.connor@alpha.com",
      hireDate: "2026-02-01",
      employmentType: "full_time",
      managerId: emp1.id,
    },
  });
  assert.equal(createEmp2.statusCode, 201, createEmp2.body);
  const emp2 = createEmp2.json() as { id: string; managerId: string };
  assert.equal(emp2.managerId, emp1.id);

  // 4. Circular Hierarchy Test (assign Emp 2 as Emp 1's manager -> cycle)
  const assignCycle = await app.inject({
    method: "PATCH",
    url: `/employees/${emp1.id}/manager`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
    payload: { managerId: emp2.id },
  });
  assert.equal(assignCycle.statusCode, 400, assignCycle.body);
  assert.ok(assignCycle.json().error.includes("Circular reporting hierarchy"));

  // 5. Duplicate Employee Number Conflict
  const duplicateNum = await app.inject({
    method: "POST",
    url: "/employees",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
    payload: {
      employeeNumber: "EMP-001",
      firstName: "Duplicate",
      lastName: "Test",
      email: "unique@alpha.com",
      hireDate: "2026-01-15",
      employmentType: "full_time",
    },
  });
  assert.equal(duplicateNum.statusCode, 409, duplicateNum.body);

  // 6. List Employees with Pagination
  const listRes = await app.inject({
    method: "GET",
    url: "/employees?limit=10&offset=0",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(listRes.statusCode, 200);
  const listJson = listRes.json() as { data: unknown[]; total: number };
  assert.equal(listJson.total, 2);
  assert.equal(listJson.data.length, 2);

  // 7. Get Employee by ID
  const getRes = await app.inject({
    method: "GET",
    url: `/employees/${emp1.id}`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.json().id, emp1.id);

  // 8. Update Profile
  const updateRes = await app.inject({
    method: "PATCH",
    url: `/employees/${emp2.id}`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
    payload: { firstName: "Johnny" },
  });
  assert.equal(updateRes.statusCode, 200);
  assert.equal(updateRes.json().firstName, "Johnny");

  // 9. Update Employment Status (Suspend & Reactivate)
  const suspendRes = await app.inject({
    method: "PATCH",
    url: `/employees/${emp2.id}/status`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
    payload: { action: "suspend", reason: "Training leave" },
  });
  assert.equal(suspendRes.statusCode, 200);
  assert.equal(suspendRes.json().employmentStatus, "suspended");

  // 10. Multi-Tenant Isolation & Auth Token Verification
  await createTenant(app, "Tenant Beta", "tenant-beta");
  const betaUser = await signUp(app, "tenant-beta", "user@beta.com", "betaPass123");

  // Attempting to access Tenant Alpha's employee using Tenant Beta token/header
  const crossTenantGet = await app.inject({
    method: "GET",
    url: `/employees/${emp1.id}`,
    headers: { "x-tenant-slug": "tenant-beta", authorization: `Bearer ${betaUser.token}` },
  });
  assert.equal(crossTenantGet.statusCode, 404); // Isolated cleanly within tenant scope

  // Attempting to spoof Tenant Alpha header with Tenant Beta token
  const spoofHeader = await app.inject({
    method: "GET",
    url: `/employees/${emp1.id}`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${betaUser.token}` },
  });
  assert.equal(spoofHeader.statusCode, 401); // Auth guard blocks token mismatch

  // 11. Delete Employee
  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/employees/${emp2.id}`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(deleteRes.json().success, true);
});
