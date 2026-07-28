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

  const book = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "acme-clinics", authorization: `Bearer ${owner.token}` },
    payload: {
      customerEmail: "patient@example.com",
      serviceName: "General consultation",
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
  assert.deepEqual(
    events.map((event) => event.action),
    ["tenant.created", "user.signed_up", "appointment.booked", "appointment.checked_in"],
  );

  assert.equal(events[0]!.actorUserId, null);
  assert.equal(events[1]!.actorUserId, owner.userId);
  assert.equal(events[0]!.previousHash, null);
  assert.notEqual(events[1]!.previousHash, null);
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
