import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

test("the customer visit journey leaves a verifiable audit trail, readable only by the owner", async () => {
  const app = buildServer(createAppContext());

  const createTenant = await app.inject({
    method: "POST",
    url: "/tenants",
    payload: { name: "Acme Clinics", slug: "acme-clinics" },
  });
  assert.equal(createTenant.statusCode, 201, createTenant.body);

  const signUp = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": "acme-clinics" },
    payload: { email: "owner@acme.com", password: "correct-horse" },
  });
  const owner = signUp.json() as { userId: string; token: string };

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

  await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });

  const auditResponse = await app.inject({
    method: "GET",
    url: "/audit-events",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
  });
  assert.equal(auditResponse.statusCode, 200);

  const events = auditResponse.json() as { action: string; actorUserId: string | null; previousHash: string | null }[];
  
  const actions = events.map((event) => event.action);
  assert.ok(actions.includes("tenant.created"));
  assert.ok(actions.includes("user.signed_up"));
  assert.ok(actions.includes("appointment.booked"));
  assert.ok(actions.includes("appointment.checked_in"));

  const tenantCreatedEvent = events.find(e => e.action === "tenant.created");
  const userSignedUpEvent = events.find(e => e.action === "user.signed_up");
  assert.equal(tenantCreatedEvent!.actorUserId, null);
  assert.equal(userSignedUpEvent!.actorUserId, owner.userId);
  assert.equal(tenantCreatedEvent!.previousHash, null);
  assert.notEqual(userSignedUpEvent!.previousHash, null);
});

test("a member cannot read the audit trail", async () => {
  const app = buildServer(createAppContext());
  await app.inject({ method: "POST", url: "/tenants", payload: { name: "Acme Clinics", slug: "acme-clinics" } });
  await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": "acme-clinics" },
    payload: { email: "owner@acme.com", password: "correct-horse" },
  });
  const memberSignUp = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": "acme-clinics" },
    payload: { email: "member@acme.com", password: "another-pass" },
  });
  const member = memberSignUp.json() as { token: string };

  const response = await app.inject({
    method: "GET",
    url: "/audit-events",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${member.token}` },
  });
  assert.equal(response.statusCode, 403);
});
