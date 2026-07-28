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

test("customer visit journey: book, check in and complete an appointment for one tenant", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const { token } = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  const book = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${token}` },
    payload: {
      customerEmail: "patient@example.com",
      serviceName: "General consultation",
      startAt: "2026-08-01T09:00:00Z",
      endAt: "2026-08-01T09:30:00Z",
    },
  });
  assert.equal(book.statusCode, 201, book.body);
  const appointment = book.json() as { id: string; status: string };
  assert.equal(appointment.status, "booked");

  const checkIn = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${token}` },
  });
  assert.equal(checkIn.statusCode, 200, checkIn.body);
  assert.equal((checkIn.json() as { status: string }).status, "checked_in");

  const complete = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/complete`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${token}` },
  });
  assert.equal(complete.statusCode, 200, complete.body);
  assert.equal((complete.json() as { status: string }).status, "completed");
});

test("tenant isolation: another tenant cannot see or act on the first tenant's appointment", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  await createTenant(app, "Beta Health", "beta-health");

  const { token: acmeToken } = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");
  const { token: betaToken } = await signUp(app, "beta-health", "owner@beta.com", "another-pass");

  const book = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${acmeToken}` },
    payload: {
      customerEmail: "patient@example.com",
      serviceName: "General consultation",
      startAt: "2026-08-01T09:00:00Z",
      endAt: "2026-08-01T09:30:00Z",
    },
  });
  const appointment = book.json() as { id: string };

  const crossTenantList = await app.inject({
    method: "GET",
    url: "/appointments",
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaToken}` },
  });
  assert.deepEqual(crossTenantList.json(), []);

  const crossTenantCheckIn = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${betaToken}` },
  });
  assert.equal(crossTenantCheckIn.statusCode, 404);

  const mismatchedToken = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "beta-health", authorization: `Bearer ${acmeToken}` },
  });
  assert.equal(mismatchedToken.statusCode, 401);
});

test("missing or unknown tenant header is rejected before auth runs", async () => {
  const app = buildServer(createAppContext());

  const missingHeader = await app.inject({ method: "POST", url: "/auth/login", payload: {} });
  assert.equal(missingHeader.statusCode, 400);

  const unknownTenant = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "x-tenant-slug": "does-not-exist" },
    payload: { email: "a@b.com", password: "whatever1" },
  });
  assert.equal(unknownTenant.statusCode, 404);
});
