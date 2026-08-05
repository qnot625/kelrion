import assert from "node:assert/strict";
import { test } from "node:test";
import { type AuditLog, InMemoryAuditLog, verifyChainIntegrity } from "@adminops/audit";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function createTenant(app: ReturnType<typeof buildServer>, name: string, slug: string) {
  const response = await app.inject({ method: "POST", url: "/tenants", payload: { name, slug } });
  assert.equal(response.statusCode, 201, response.body);
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

test("Cross-Tenant Security: Token issued for Tenant A is rejected when used with Tenant B header", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Tenant Alpha", "tenant-alpha");
  await createTenant(app, "Tenant Beta", "tenant-beta");

  const userAlpha = await signUp(app, "tenant-alpha", "admin@alpha.com", "secure-pass-1");
  await signUp(app, "tenant-beta", "admin@beta.com", "secure-pass-2");

  // Attempt to use userAlpha's token against tenant-beta endpoint
  const crossTenantReq = await app.inject({
    method: "GET",
    url: "/employees",
    headers: {
      "x-tenant-slug": "tenant-beta",
      authorization: `Bearer ${userAlpha.token}`,
    },
  });

  assert.equal(crossTenantReq.statusCode, 401);
  const body = crossTenantReq.json() as { error: string };
  assert.match(body.error, /tenant/i);
});

test("Cross-Tenant Security: Requests without tenant header are rejected with HTTP 400", async () => {
  const app = buildServer(createAppContext());
  const req = await app.inject({
    method: "GET",
    url: "/employees",
  });
  assert.equal(req.statusCode, 400);
});

test("Cross-Tenant Security: Requests with non-existent tenant slug are rejected with HTTP 404", async () => {
  const app = buildServer(createAppContext());
  const req = await app.inject({
    method: "GET",
    url: "/employees",
    headers: { "x-tenant-slug": "non-existent-tenant-999" },
  });
  assert.equal(req.statusCode, 404);
});

test("Cross-Tenant Security: Requests without Bearer token are rejected with HTTP 401", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Tenant Gamma", "tenant-gamma");

  const req = await app.inject({
    method: "GET",
    url: "/employees",
    headers: { "x-tenant-slug": "tenant-gamma" },
  });
  assert.equal(req.statusCode, 401);
});

test("Cross-Tenant Security: Data isolation ensures Tenant B cannot see Tenant A employees", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Org A", "org-a");
  await createTenant(app, "Org B", "org-b");

  const adminA = await signUp(app, "org-a", "owner@orga.com", "password-a");
  const adminB = await signUp(app, "org-b", "owner@orgb.com", "password-b");

  // Create employee in Org A
  const createEmp = await app.inject({
    method: "POST",
    url: "/employees",
    headers: {
      "x-tenant-slug": "org-a",
      authorization: `Bearer ${adminA.token}`,
    },
    payload: {
      employeeNumber: "EMP_A101",
      firstName: "Alice",
      lastName: "Alpha",
      email: "alice@orga.com",
      hireDate: "2026-01-01",
      employmentType: "full_time",
    },
  });
  assert.equal(createEmp.statusCode, 201, createEmp.body);

  // Query employees as Org B
  const listB = await app.inject({
    method: "GET",
    url: "/employees",
    headers: {
      "x-tenant-slug": "org-b",
      authorization: `Bearer ${adminB.token}`,
    },
  });
  assert.equal(listB.statusCode, 200);
  const itemsB = listB.json() as { data: Array<{ employeeNumber: string }>; total: number };
  assert.equal(itemsB.data.length, 0, "Org B should not see Org A employee records");
  assert.equal(itemsB.total, 0, "Org B employee count should be 0");
});

test("Audit Integrity: Validates cryptographic hash chain and detects event tampering", async () => {
  const auditLog: AuditLog = new InMemoryAuditLog();
  const tenantId = "ten_test_100";
  const actorUserId = "usr_admin_1";

  await auditLog.record({
    tenantId,
    actorUserId,
    action: "employee.created",
    targetType: "employee",
    targetId: "emp_1",
    metadata: { name: "John Doe" },
  });

  await auditLog.record({
    tenantId,
    actorUserId,
    action: "attendance.clocked_in",
    targetType: "attendance_event",
    targetId: "att_1",
    metadata: { type: "clock_in" },
  });

  const chain = await auditLog.listByTenant(tenantId);
  assert.equal(chain.length, 2);

  // Convert string timestamps back to Date objects if needed by verifyChainIntegrity
  const normalizedChain = chain.map((evt) => ({
    ...evt,
    occurredAt: typeof evt.occurredAt === "string" ? new Date(evt.occurredAt) : evt.occurredAt,
  }));

  assert.equal(verifyChainIntegrity(normalizedChain), true, "Hash chain should be cryptographically valid");

  // Tamper with event1 metadata
  const tamperedChain = JSON.parse(JSON.stringify(normalizedChain));
  tamperedChain[0].metadata.name = "Tampered Name";
  const normalizedTamperedChain = tamperedChain.map((evt: (typeof normalizedChain)[number]) => ({
    ...evt,
    occurredAt: new Date(evt.occurredAt),
  }));

  assert.equal(verifyChainIntegrity(normalizedTamperedChain), false, "Tampered chain must fail verification");
});
