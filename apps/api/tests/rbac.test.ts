import assert from "node:assert/strict";
import { test } from "node:test";
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

test("a member can book but cannot check in, complete or list appointments", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");

  // first signup becomes owner; the second becomes an unprivileged member
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");
  const member = await signUp(app, "acme-clinics", "staffer@acme.com", "another-pass");

  const b1 = await app.inject({ method: "POST", url: "/branches", headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { name: "Downtown", slug: "downtown", address: "123 Main St", latitude: 51, longitude: -0.1, status: "active" } }).then(r => r.json() as {id: string});
  await app.inject({ method: "POST", url: `/branches/${b1.id}/operating-windows`, headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: [{ dayOfWeek: 6, openMinutes: 480, closeMinutes: 1020 }] }); // Saturday
  await app.inject({ method: "POST", url: `/branches/${b1.id}/departments`, headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { name: "D1", slug: "d1", capacity: 1 } });
  const s1 = await app.inject({ method: "POST", url: "/services", headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { code: "S1", name: "S1", durationMinutes: 30 } }).then(r => r.json() as {id: string});
  await app.inject({ method: "POST", url: `/branches/${b1.id}/services`, headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { serviceId: s1.id } });

  const book = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${member.token}` },
    payload: {
      customerEmail: "patient@example.com",
      branchId: b1.id,
      serviceId: s1.id,
      startAt: "2026-08-01T09:00:00Z",
      endAt: "2026-08-01T09:30:00Z",
    },
  });
  assert.equal(book.statusCode, 201, book.body);
  const appointment = book.json() as { id: string };

  const checkIn = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${member.token}` },
  });
  assert.equal(checkIn.statusCode, 403);

  const list = await app.inject({
    method: "GET",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${member.token}` },
  });
  assert.equal(list.statusCode, 403);
});

test("the tenant owner can check in, complete and list appointments", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  const b1 = await app.inject({ method: "POST", url: "/branches", headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { name: "Downtown", slug: "downtown", address: "123 Main St", latitude: 51, longitude: -0.1, status: "active" } }).then(r => r.json() as {id: string});
  await app.inject({ method: "POST", url: `/branches/${b1.id}/operating-windows`, headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: [{ dayOfWeek: 6, openMinutes: 480, closeMinutes: 1020 }] }); // Saturday
  await app.inject({ method: "POST", url: `/branches/${b1.id}/departments`, headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { name: "D1", slug: "d1", capacity: 1 } });
  const s1 = await app.inject({ method: "POST", url: "/services", headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { code: "S1", name: "S1", durationMinutes: 30 } }).then(r => r.json() as {id: string});
  await app.inject({ method: "POST", url: `/branches/${b1.id}/services`, headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` }, payload: { serviceId: s1.id } });

  const book = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      customerEmail: "patient@example.com",
      branchId: b1.id,
      serviceId: s1.id,
      startAt: "2026-08-01T09:00:00Z",
      endAt: "2026-08-01T09:30:00Z",
    },
  });
  const appointment = book.json() as { id: string };

  const checkIn = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(checkIn.statusCode, 200);

  const list = await app.inject({
    method: "GET",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(list.statusCode, 200);
  assert.equal((list.json() as unknown[]).length, 1);
});
