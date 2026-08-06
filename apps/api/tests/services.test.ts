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

test("service API: tenant owner can create, validate, and list services", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  // Create valid service
  const createRes = await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      code: "PASSPORT-RENEW",
      name: "Passport Renewal",
      description: "Standard 30 min passport renewal",
      durationMinutes: 30,
      requirements: {
        photoIdRequired: true,
        minAge: 18,
        requiredDocuments: ["Proof of Residence"],
      },
    },
  });
  assert.equal(createRes.statusCode, 201, createRes.body);
  const created = createRes.json() as { id: string; code: string; durationMinutes: number; requirement?: { photoIdRequired: boolean } };
  assert.equal(created.code, "PASSPORT-RENEW");
  assert.equal(created.durationMinutes, 30);
  assert.equal(created.requirement?.photoIdRequired, true);

  // List services
  const listRes = await app.inject({
    method: "GET",
    url: "/services",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(listRes.statusCode, 200, listRes.body);
  const list = listRes.json() as Array<{ id: string; code: string }>;
  assert.equal(list.length, 1);
  assert.equal(list[0].code, "PASSPORT-RENEW");
});

test("service API: duration and code validation constraints (400 / 409)", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  // Invalid duration (> 480 min)
  const invalidDuration = await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      code: "LONG-SERVICE",
      name: "Super Long Service",
      durationMinutes: 600,
    },
  });
  assert.equal(invalidDuration.statusCode, 400, invalidDuration.body);

  // Invalid duration (0 min)
  const zeroDuration = await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      code: "ZERO-SERVICE",
      name: "Zero Duration Service",
      durationMinutes: 0,
    },
  });
  assert.equal(zeroDuration.statusCode, 400, zeroDuration.body);

  // Create first valid
  await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      code: "CONSULTATION",
      name: "General Consultation",
      durationMinutes: 15,
    },
  });

  // Duplicate code (409)
  const duplicateCode = await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      code: "CONSULTATION",
      name: "Duplicate Consultation",
      durationMinutes: 20,
    },
  });
  assert.equal(duplicateCode.statusCode, 409, duplicateCode.body);
});

test("service API: branch service assignment and tenant isolation", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  await createTenant(app, "Beta Health", "beta-health");

  const acmeOwner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");
  const betaOwner = await signUp(app, "beta-health", "owner@beta.com", "another-pass");

  // Create branch in Acme
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

  // Create service in Acme
  const serviceRes = await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${acmeOwner.token}` },
    payload: {
      code: "CHECKUP",
      name: "Annual Checkup",
      durationMinutes: 45,
    },
  });
  const service = serviceRes.json() as { id: string };

  // Assign service to branch
  const assignRes = await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/services`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${acmeOwner.token}` },
    payload: { serviceId: service.id },
  });
  assert.equal(assignRes.statusCode, 201, assignRes.body);

  // List branch services in Acme
  const branchServicesRes = await app.inject({
    method: "GET",
    url: `/branches/${branch.id}/services`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${acmeOwner.token}` },
  });
  assert.equal(branchServicesRes.statusCode, 200);
  const branchServices = branchServicesRes.json() as Array<{ id: string; code: string }>;
  assert.equal(branchServices.length, 1);
  assert.equal(branchServices[0].id, service.id);

  // Beta owner cannot access Acme branch services (404 branch not found)
  const crossTenantGet = await app.inject({
    method: "GET",
    url: `/branches/${branch.id}/services`,
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaOwner.token}` },
  });
  assert.equal(crossTenantGet.statusCode, 404);

  // Beta owner gets empty service list for Beta Health
  const betaServicesRes = await app.inject({
    method: "GET",
    url: "/services",
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaOwner.token}` },
  });
  assert.equal(betaServicesRes.statusCode, 200);
  assert.deepEqual(betaServicesRes.json(), []);
});

test("service API: owner updates catalogue status and requirements", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Operations Group", "operations-group");
  const owner = await signUp(app, "operations-group", "owner@operations.test", "correct-horse");
  const headers = { "x-tenant-slug": "operations-group", authorization: `Bearer ${owner.token}` };

  const created = await app.inject({
    method: "POST", url: "/services", headers,
    payload: { code: "VERIFY", name: "Verification", durationMinutes: 20 },
  });
  assert.equal(created.statusCode, 201, created.body);
  const service = created.json() as { id: string };

  const updated = await app.inject({ method: "PATCH", url: `/services/${service.id}`, headers, payload: { status: "inactive", durationMinutes: 25 } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal((updated.json() as { status: string }).status, "inactive");

  const requirements = await app.inject({
    method: "PUT", url: `/services/${service.id}/requirements`, headers,
    payload: { photoIdRequired: true, minAge: 18, maxAge: null, requiredDocuments: ["Proof of address"], customNotes: "Originals only" },
  });
  assert.equal(requirements.statusCode, 200, requirements.body);
  assert.equal((requirements.json() as { photoIdRequired: boolean }).photoIdRequired, true);

  const fetched = await app.inject({ method: "GET", url: `/services/${service.id}`, headers });
  assert.equal(fetched.statusCode, 200, fetched.body);
  assert.deepEqual((fetched.json() as { requirement: { requiredDocuments: string[] } }).requirement.requiredDocuments, ["Proof of address"]);
});
