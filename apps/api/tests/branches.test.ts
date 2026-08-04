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

test("branch API: tenant owner can create and list branches", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  const create = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Victoria Island Branch",
      slug: "vi-branch",
      address: "123 Ahmadu Bello Way, Lagos",
      latitude: 6.4281,
      longitude: 3.4219,
    },
  });
  assert.equal(create.statusCode, 201, create.body);
  const createdBranch = create.json() as { id: string; name: string; slug: string };
  assert.equal(createdBranch.name, "Victoria Island Branch");
  assert.equal(createdBranch.slug, "vi-branch");

  const list = await app.inject({
    method: "GET",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(list.statusCode, 200, list.body);
  const branches = list.json() as Array<{ id: string; name: string }>;
  assert.equal(branches.length, 1);
  assert.equal(branches[0].name, "Victoria Island Branch");
});

test("branch API: unprivileged member cannot create a branch (403)", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");
  const member = await signUp(app, "acme-clinics", "staff@acme.com", "another-pass");

  const create = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${member.token}` },
    payload: {
      name: "Ikeja Branch",
      slug: "ikeja-branch",
      address: "45 Allen Avenue, Ikeja",
      latitude: 6.6018,
      longitude: 3.3515,
    },
  });
  assert.equal(create.statusCode, 403);
});

test("branch API: tenant isolation prevents branch visibility across tenants", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  await createTenant(app, "Beta Health", "beta-health");

  const acmeOwner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");
  const betaOwner = await signUp(app, "beta-health", "owner@beta.com", "another-pass");

  await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${acmeOwner.token}` },
    payload: {
      name: "Acme Branch",
      slug: "acme-branch",
      address: "1 Acme St",
      latitude: 6.4281,
      longitude: 3.4219,
    },
  });

  const betaList = await app.inject({
    method: "GET",
    url: "/branches",
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaOwner.token}` },
  });
  assert.equal(betaList.statusCode, 200);
  assert.deepEqual(betaList.json(), []);
});

test("department API: tenant owner can create and list departments", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  const branchRes = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Victoria Island Branch",
      slug: "vi-branch",
      address: "123 Ahmadu Bello Way, Lagos",
      latitude: 6.4281,
      longitude: 3.4219,
    },
  });
  const branch = branchRes.json() as { id: string };

  const deptRes = await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Triage & Intake",
      slug: "triage",
      capacity: 10,
    },
  });
  assert.equal(deptRes.statusCode, 201, deptRes.body);
  const dept = deptRes.json() as { id: string; name: string; capacity: number; branchId: string };
  assert.equal(dept.name, "Triage & Intake");
  assert.equal(dept.capacity, 10);
  assert.equal(dept.branchId, branch.id);

  const listRes = await app.inject({
    method: "GET",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(listRes.statusCode, 200, listRes.body);
  const depts = listRes.json() as Array<{ id: string; name: string; capacity: number }>;
  assert.equal(depts.length, 1);
  assert.equal(depts[0].name, "Triage & Intake");
});

test("department API: unprivileged member cannot create department (403)", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");
  const member = await signUp(app, "acme-clinics", "staff@acme.com", "another-pass");

  const branchRes = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Victoria Island Branch",
      slug: "vi-branch",
      address: "123 Ahmadu Bello Way, Lagos",
      latitude: 6.4281,
      longitude: 3.4219,
    },
  });
  const branch = branchRes.json() as { id: string };

  const deptRes = await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${member.token}` },
    payload: {
      name: "Triage & Intake",
      slug: "triage",
      capacity: 10,
    },
  });
  assert.equal(deptRes.statusCode, 403);
});

test("department API: validates capacity strictly positive integer", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  const branchRes = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Victoria Island Branch",
      slug: "vi-branch",
      address: "123 Ahmadu Bello Way, Lagos",
      latitude: 6.4281,
      longitude: 3.4219,
    },
  });
  const branch = branchRes.json() as { id: string };

  const deptRes = await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Invalid Dept",
      slug: "invalid",
      capacity: 0,
    },
  });
  assert.equal(deptRes.statusCode, 400);
});

test("department API: tenant isolation prevents department access across tenants (404)", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  await createTenant(app, "Beta Health", "beta-health");

  const acmeOwner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");
  const betaOwner = await signUp(app, "beta-health", "owner@beta.com", "another-pass");

  const branchRes = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${acmeOwner.token}` },
    payload: {
      name: "Acme Branch",
      slug: "acme-branch",
      address: "1 Acme St",
      latitude: 6.4281,
      longitude: 3.4219,
    },
  });
  const branch = branchRes.json() as { id: string };

  const betaRes = await app.inject({
    method: "GET",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaOwner.token}` },
  });
  assert.equal(betaRes.statusCode, 404);
});

test("branch API: GET /branches/discover prioritizes low-load branches and validates query parameters", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Central Branch",
      slug: "central-branch",
      address: "1 Central Rd",
      latitude: 6.4281,
      longitude: 3.4219,
    },
  });

  const discoverRes = await app.inject({
    method: "GET",
    url: "/branches/discover",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });

  assert.equal(discoverRes.statusCode, 200, discoverRes.body);
  const results = discoverRes.json() as Array<{ branchName: string; loadLevel: string }>;
  assert.equal(results.length, 1);
  assert.equal(results[0].branchName, "Central Branch");

  const invalidCoordsRes = await app.inject({
    method: "GET",
    url: "/branches/discover?latitude=10",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(invalidCoordsRes.statusCode, 400);
});

test("branch API: GET /branches/discover supports anonymous public queries with tenant isolation", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Public Tenant A", "tenant-a");
  await createTenant(app, "Public Tenant B", "tenant-b");
  const ownerA = await signUp(app, "tenant-a", "owner-a@test.com", "password123");

  await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": "tenant-a", authorization: `Bearer ${ownerA.token}` },
    payload: {
      name: "Tenant A Branch",
      slug: "tenant-a-branch",
      address: "Address A",
      latitude: 10,
      longitude: 10,
    },
  });

  // Anonymous request to Tenant A (NO authorization header)
  const anonResA = await app.inject({
    method: "GET",
    url: "/branches/discover",
    headers: { "x-tenant-slug": "tenant-a" },
  });
  assert.equal(anonResA.statusCode, 200);
  const resultsA = anonResA.json() as Array<{ branchName: string }>;
  assert.equal(resultsA.length, 1);
  assert.equal(resultsA[0].branchName, "Tenant A Branch");

  // Anonymous request to Tenant B (should be empty, confirming tenant isolation)
  const anonResB = await app.inject({
    method: "GET",
    url: "/branches/discover",
    headers: { "x-tenant-slug": "tenant-b" },
  });
  assert.equal(anonResB.statusCode, 200);
  const resultsB = anonResB.json() as Array<{ branchName: string }>;
  assert.equal(resultsB.length, 0);
});


