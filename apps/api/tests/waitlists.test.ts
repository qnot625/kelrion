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

test("waitlist API: supports waitlist entry creation, validation, deletion, and no-show triggers FIFO promotion", async () => {
  const app = buildServer(createAppContext());
  const tenant = await createTenant(app, "Acme Clinics", "acme-clinics");
  const owner = await signUp(app, "acme-clinics", "owner@acme.com", "correct-horse");

  // Create branch
  const createBranchRes = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Downtown",
      slug: "downtown",
      address: "123 Main St",
      latitude: 51,
      longitude: -0.1,
      status: "active",
    },
  });
  assert.equal(createBranchRes.statusCode, 201);
  const branch = createBranchRes.json() as { id: string };

  // Set operating windows
  await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/operating-windows`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: [
      { dayOfWeek: 3, openMinutes: 480, closeMinutes: 1020 } // Wed
    ],
  });

  // Create department with capacity 1
  await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: { name: "Cardiology", slug: "cardio", capacity: 1 },
  });

  // Create service
  const createServiceRes = await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      code: "checkup",
      name: "General Checkup",
      durationMinutes: 30,
    },
  });
  assert.equal(createServiceRes.statusCode, 201);
  const service = createServiceRes.json() as { id: string };

  // Assign service to branch
  await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/services`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: { serviceId: service.id },
  });

  // 1. Book the slot
  const bookRes = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      branchId: branch.id,
      serviceId: service.id,
      customerEmail: "patient@example.com",
      startAt: "2026-08-05T09:00:00Z",
      endAt: "2026-08-05T09:30:00Z"
    }
  });
  assert.equal(bookRes.statusCode, 201);
  const appointment = bookRes.json() as { id: string };

  // 2. Try booking the same slot - should fail with 400
  const bookFailRes = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      branchId: branch.id,
      serviceId: service.id,
      customerEmail: "other@example.com",
      startAt: "2026-08-05T09:00:00Z",
      endAt: "2026-08-05T09:30:00Z"
    }
  });
  assert.equal(bookFailRes.statusCode, 400);

  // 3. Add first person to waitlist
  const waitlist1Res = await app.inject({
    method: "POST",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      branchId: branch.id,
      serviceId: service.id,
      customerEmail: "waitlisted1@example.com"
    }
  });
  assert.equal(waitlist1Res.statusCode, 201);
  const entry1 = waitlist1Res.json() as { id: string; queuePosition: number };
  assert.equal(entry1.queuePosition, 1);

  // 4. Add second person to waitlist
  const waitlist2Res = await app.inject({
    method: "POST",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      branchId: branch.id,
      serviceId: service.id,
      customerEmail: "waitlisted2@example.com"
    }
  });
  assert.equal(waitlist2Res.statusCode, 201);
  const entry2 = waitlist2Res.json() as { id: string; queuePosition: number };
  assert.equal(entry2.queuePosition, 2);

  // 5. Test POST validation with invalid payload
  const waitlistFailRes = await app.inject({
    method: "POST",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      branchId: branch.id,
      serviceId: service.id,
      customerEmail: "" // empty string violates minLength: 1
    }
  });
  assert.equal(waitlistFailRes.statusCode, 400);

  // 6. Test list waitlists
  const getWaitlistRes = await app.inject({
    method: "GET",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
  });
  assert.equal(getWaitlistRes.statusCode, 200);
  const list = getWaitlistRes.json() as Array<{ customerEmail: string }>;
  assert.equal(list.length, 2);
  assert.equal(list[0].customerEmail, "waitlisted1@example.com");
  assert.equal(list[1].customerEmail, "waitlisted2@example.com");

  // 7. Trigger PUT /appointments/:id/no-show on the booked appointment. This should auto-promote waitlisted1.
  const noShowRes = await app.inject({
    method: "PUT",
    url: `/appointments/${appointment.id}/no-show`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
  });
  assert.equal(noShowRes.statusCode, 200);

  // 8. Verify first waitlisted is promoted (no longer in waitlist, and appointment created)
  const getWaitlistResAfter = await app.inject({
    method: "GET",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
  });
  assert.equal(getWaitlistResAfter.statusCode, 200);
  const listAfter = getWaitlistResAfter.json() as Array<{ customerEmail: string }>;
  assert.equal(listAfter.length, 1);
  assert.equal(listAfter[0].customerEmail, "waitlisted2@example.com");

  // Check the promoted appointment
  const getApptsRes = await app.inject({
    method: "GET",
    url: "/appointments",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
  });
  const appointments = getApptsRes.json() as Array<{ customerEmail: string; status: string }>;
  const promoted = appointments.find(a => a.customerEmail === "waitlisted1@example.com");
  assert.ok(promoted);
  assert.equal(promoted.status, "booked");

  // 9. DELETE waitlisted2 from waitlist
  const deleteRes = await app.inject({
    method: "DELETE",
    url: `/waitlists/${entry2.id}`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
  });
  assert.equal(deleteRes.statusCode, 204);

  // Verify waitlist is now empty
  const getWaitlistResEmpty = await app.inject({
    method: "GET",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
  });
  assert.equal(getWaitlistResEmpty.json().length, 0);
});

test("waitlist API: enforces tenant isolation and RBAC", async () => {
  const app = buildServer(createAppContext());

  // Tenant 1
  const tenant1 = await createTenant(app, "Tenant One", "tenant-one");
  const owner1 = await signUp(app, "tenant-one", "owner1@test.com", "correct-horse");
  const member1 = await signUp(app, "tenant-one", "member1@test.com", "correct-horse");

  // Tenant 2
  const tenant2 = await createTenant(app, "Tenant Two", "tenant-two");
  const owner2 = await signUp(app, "tenant-two", "owner2@test.com", "correct-horse");

  // Create branch for Tenant 1
  const createBranchRes = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": tenant1.slug, authorization: `Bearer ${owner1.token}` },
    payload: {
      name: "Branch T1",
      slug: "branch-t1",
      address: "123 Main St",
      latitude: 51,
      longitude: -0.1,
      status: "active",
    },
  });
  assert.equal(createBranchRes.statusCode, 201);
  const branchT1 = createBranchRes.json() as { id: string };

  // Create service for Tenant 1
  const createServiceRes = await app.inject({
    method: "POST",
    url: "/services",
    headers: { "x-tenant-slug": tenant1.slug, authorization: `Bearer ${owner1.token}` },
    payload: {
      code: "t1-service",
      name: "Service T1",
      durationMinutes: 30,
    },
  });
  assert.equal(createServiceRes.statusCode, 201);
  const serviceT1 = createServiceRes.json() as { id: string };

  // Add to waitlist in Tenant 1 by Owner 1
  const waitlistRes = await app.inject({
    method: "POST",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant1.slug, authorization: `Bearer ${owner1.token}` },
    payload: {
      branchId: branchT1.id,
      serviceId: serviceT1.id,
      customerEmail: "t1-waiting@example.com"
    }
  });
  assert.equal(waitlistRes.statusCode, 201);
  const entryT1 = waitlistRes.json() as { id: string };

  // 1. Tenant Isolation: Owner 2 in Tenant 2 lists waitlist - should be empty
  const getWaitlistResT2 = await app.inject({
    method: "GET",
    url: "/waitlists",
    headers: { "x-tenant-slug": tenant2.slug, authorization: `Bearer ${owner2.token}` },
  });
  assert.equal(getWaitlistResT2.statusCode, 200);
  assert.equal(getWaitlistResT2.json().length, 0);

  // 2. Tenant Isolation: Owner 2 in Tenant 2 deletes Tenant 1's entry - should be 404
  const deleteResT2 = await app.inject({
    method: "DELETE",
    url: `/waitlists/${entryT1.id}`,
    headers: { "x-tenant-slug": tenant2.slug, authorization: `Bearer ${owner2.token}` },
  });
  assert.equal(deleteResT2.statusCode, 404);

  // 3. RBAC: Member 1 in Tenant 1 (no appointments:manage) deletes entry - should be 403
  const deleteResM1 = await app.inject({
    method: "DELETE",
    url: `/waitlists/${entryT1.id}`,
    headers: { "x-tenant-slug": tenant1.slug, authorization: `Bearer ${member1.token}` },
  });
  assert.equal(deleteResM1.statusCode, 403);
});

