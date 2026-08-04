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

test("appointment API: prevents concurrent double bookings for the same timeslot", async () => {
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
  assert.equal(createBranchRes.statusCode, 201, createBranchRes.body);
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
  const createDeptRes = await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: { name: "Cardiology", slug: "cardio", capacity: 1 },
  });
  assert.equal(createDeptRes.statusCode, 201);

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

  // 10 concurrent requests for the same slot
  // Wednesday is 2026-08-05. Let's say 2026-08-05T09:00:00Z to 2026-08-05T09:30:00Z.
  const payload = {
    branchId: branch.id,
    serviceId: service.id,
    customerEmail: "patient@example.com",
    startAt: "2026-08-05T09:00:00Z",
    endAt: "2026-08-05T09:30:00Z"
  };

  const requests = Array.from({ length: 10 }).map(() =>
    app.inject({
      method: "POST",
      url: "/appointments",
      headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
      payload,
    })
  );

  const responses = await Promise.all(requests);
  
  const successes = responses.filter(r => r.statusCode === 201);
  const failures = responses.filter(r => r.statusCode === 400);

  // Since capacity is 1, only 1 should succeed
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 9);
  
  for (const f of failures) {
    const err = f.json() as { error: string };
    assert.equal(err.error, "The requested timeslot is not available");
  }
});

test("appointment API: prevents cross-tenant data leakage on GET", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Tenant 1", "t1");
  await createTenant(app, "Tenant 2", "t2");
  const o1 = await signUp(app, "t1", "owner@t1.com", "password");
  const o2 = await signUp(app, "t2", "owner@t2.com", "password");

  // Create branch & service in T1
  const b1 = await app.inject({ method: "POST", url: "/branches", headers: { "x-tenant-slug": "t1", authorization: `Bearer ${o1.token}` }, payload: { name: "B1", slug: "b1", address: "123", latitude: 51, longitude: 0 } }).then(r => r.json() as {id: string});
  await app.inject({ method: "POST", url: `/branches/${b1.id}/operating-windows`, headers: { "x-tenant-slug": "t1", authorization: `Bearer ${o1.token}` }, payload: [{ dayOfWeek: 3, openMinutes: 480, closeMinutes: 1020 }] });
  await app.inject({ method: "POST", url: `/branches/${b1.id}/departments`, headers: { "x-tenant-slug": "t1", authorization: `Bearer ${o1.token}` }, payload: { name: "D1", slug: "d1", capacity: 1 } });
  const s1 = await app.inject({ method: "POST", url: "/services", headers: { "x-tenant-slug": "t1", authorization: `Bearer ${o1.token}` }, payload: { code: "S1", name: "S1", durationMinutes: 30 } }).then(r => r.json() as {id: string});
  await app.inject({ method: "POST", url: `/branches/${b1.id}/services`, headers: { "x-tenant-slug": "t1", authorization: `Bearer ${o1.token}` }, payload: { serviceId: s1.id } });
  
  // Book appointment in T1
  await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": "t1", authorization: `Bearer ${o1.token}` },
    payload: { branchId: b1.id, serviceId: s1.id, customerEmail: "a@a.com", startAt: "2026-08-05T09:00:00Z", endAt: "2026-08-05T09:30:00Z" }
  });

  const getT1 = await app.inject({ method: "GET", url: "/appointments", headers: { "x-tenant-slug": "t1", authorization: `Bearer ${o1.token}` } });
  assert.equal(getT1.statusCode, 200);
  assert.equal((getT1.json() as Array<Record<string, unknown>>).length, 1);

  const getT2 = await app.inject({ method: "GET", url: "/appointments", headers: { "x-tenant-slug": "t2", authorization: `Bearer ${o2.token}` } });
  assert.equal(getT2.statusCode, 200);
  assert.equal((getT2.json() as Array<Record<string, unknown>>).length, 0);
});

test("appointment API: can reschedule and cancel bookings", async () => {
  const app = buildServer(createAppContext());
  const tenant = await createTenant(app, "Acme Clinics 3", "acme-clinics-3");
  const owner = await signUp(app, "acme-clinics-3", "owner3@acme.com", "correct-horse");

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

  // Book appointment
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
    },
  });
  assert.equal(bookRes.statusCode, 201);
  const appointment = bookRes.json() as { id: string };

  // Reschedule to a new slot
  const rescheduleRes = await app.inject({
    method: "PUT",
    url: `/appointments/${appointment.id}/reschedule`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      startAt: "2026-08-05T10:00:00Z",
      endAt: "2026-08-05T10:30:00Z"
    },
  });
  assert.equal(rescheduleRes.statusCode, 200, rescheduleRes.body);
  const rescheduledAppointment = rescheduleRes.json() as { startAt: string };
  assert.equal(rescheduledAppointment.startAt, "2026-08-05T10:00:00.000Z");

  // Cancel booking
  const cancelRes = await app.inject({
    method: "PUT",
    url: `/appointments/${appointment.id}/cancel`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
  });
  assert.equal(cancelRes.statusCode, 200, cancelRes.body);
  const cancelledAppointment = cancelRes.json() as { status: string };
  assert.equal(cancelledAppointment.status, "cancelled");
});

test("appointment API: public anonymous booking bypasses authentication and allows booking creation only", async () => {
  const app = buildServer(createAppContext());
  const tenant = await createTenant(app, "Public Booking Clinics", "public-clinics");
  const owner = await signUp(app, "public-clinics", "owner@public.com", "correct-horse");

  // Create branch
  const createBranchRes = await app.inject({
    method: "POST",
    url: "/branches",
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: {
      name: "Public Branch",
      slug: "public-branch",
      address: "456 Public Rd",
      latitude: 52,
      longitude: -0.2,
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

  // Create department with capacity 5
  await app.inject({
    method: "POST",
    url: `/branches/${branch.id}/departments`,
    headers: { "x-tenant-slug": tenant.slug, authorization: `Bearer ${owner.token}` },
    payload: { name: "Cardiology", slug: "cardio", capacity: 5 },
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

  // 1. Get services without auth header (public route bypass)
  const getServicesRes = await app.inject({
    method: "GET",
    url: "/services",
    headers: { "x-tenant-slug": tenant.slug },
  });
  assert.equal(getServicesRes.statusCode, 200);

  // 2. Get branch services without auth header (public route bypass)
  const getBranchServicesRes = await app.inject({
    method: "GET",
    url: `/branches/${branch.id}/services`,
    headers: { "x-tenant-slug": tenant.slug },
  });
  assert.equal(getBranchServicesRes.statusCode, 200);

  // 3. Book appointment without auth header (public anonymous booking creation)
  const bookRes = await app.inject({
    method: "POST",
    url: "/appointments",
    headers: { "x-tenant-slug": tenant.slug },
    payload: {
      branchId: branch.id,
      serviceId: service.id,
      customerEmail: "anonymous@example.com",
      startAt: "2026-08-05T09:00:00Z",
      endAt: "2026-08-05T09:30:00Z"
    },
  });
  assert.equal(bookRes.statusCode, 201, bookRes.body);
  const appointment = bookRes.json() as { id: string };

  // 4. Try administrative action (check-in) without auth header -> Must fail with 401
  const checkInRes = await app.inject({
    method: "POST",
    url: `/appointments/${appointment.id}/check-in`,
    headers: { "x-tenant-slug": tenant.slug },
  });
  assert.equal(checkInRes.statusCode, 401);
});
