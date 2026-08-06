import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function fixture() {
  const context = createAppContext();
  const app = buildServer(context);
  const tenantResponse = await app.inject({ method: "POST", url: "/tenants", payload: { name: "Acme", slug: "acme" } });
  assert.equal(tenantResponse.statusCode, 201, tenantResponse.body);
  const tenant = tenantResponse.json() as { id: string };
  const signup = await app.inject({
    method: "POST", url: "/auth/signup", headers: { "x-tenant-slug": "acme" },
    payload: { email: "owner@acme.test", password: "correct-horse" },
  });
  assert.equal(signup.statusCode, 201, signup.body);
  const owner = signup.json() as { token: string };

  const branch = await context.branchRepository.createBranch({
    tenantId: tenant.id, slug: "central", name: "Central", status: "active",
    address: "1 Main", latitude: 6.45, longitude: 3.4,
  });
  await context.branchRepository.createDepartment({
    tenantId: tenant.id, branchId: branch.id, name: "Desk", slug: "desk", capacity: 1,
  });
  await context.branchRepository.setOperatingWindows(branch.id, [{ dayOfWeek: 1, openMinutes: 540, closeMinutes: 720 }]);
  const { service } = await context.serviceRepository.createService({
    tenantId: tenant.id, code: "CONSULT", name: "Consultation", durationMinutes: 30, status: "active",
  });
  await context.serviceRepository.assignServiceToBranch(tenant.id, branch.id, service.id);
  return { app, context, tenant, owner, branch, service };
}

const publicHeaders = { "x-tenant-slug": "acme" };
const startAt = "2026-08-03T09:00:00.000Z";
const endAt = "2026-08-03T09:30:00.000Z";

test("public availability and booking use tenant-scoped branch capacity", async () => {
  const setup = await fixture();
  const availability = await setup.app.inject({
    method: "GET",
    url: `/public/appointments/availability?branchId=${setup.branch.id}&serviceId=${setup.service.id}&startAt=${encodeURIComponent("2026-08-03T09:00:00Z")}&endAt=${encodeURIComponent("2026-08-03T10:00:00Z")}`,
    headers: publicHeaders,
  });
  assert.equal(availability.statusCode, 200, availability.body);
  assert.equal((availability.json() as unknown[]).length, 2);

  const booking = await setup.app.inject({
    method: "POST", url: "/public/appointments", headers: publicHeaders,
    payload: { branchId: setup.branch.id, serviceId: setup.service.id, customerEmail: "visitor@example.com", startAt, endAt },
  });
  assert.equal(booking.statusCode, 201, booking.body);
  const duplicate = await setup.app.inject({
    method: "POST", url: "/public/appointments", headers: publicHeaders,
    payload: { branchId: setup.branch.id, serviceId: setup.service.id, customerEmail: "second@example.com", startAt, endAt },
  });
  assert.equal(duplicate.statusCode, 409, duplicate.body);
});

test("owner can manage waitlists and cancellation promotes FIFO entry", async () => {
  const setup = await fixture();
  const booking = await setup.app.inject({
    method: "POST", url: "/public/appointments", headers: publicHeaders,
    payload: { branchId: setup.branch.id, serviceId: setup.service.id, customerEmail: "booked@example.com", startAt, endAt },
  });
  const appointment = booking.json() as { id: string };
  const joined = await setup.app.inject({
    method: "POST", url: "/public/waitlists", headers: publicHeaders,
    payload: { branchId: setup.branch.id, serviceId: setup.service.id, customerEmail: "waiting@example.com", desiredStartAt: startAt, desiredEndAt: endAt },
  });
  assert.equal(joined.statusCode, 201, joined.body);
  assert.equal((joined.json() as { queuePosition: number }).queuePosition, 1);

  const headers = { ...publicHeaders, authorization: `Bearer ${setup.owner.token}` };
  const cancelled = await setup.app.inject({ method: "POST", url: `/appointments/${appointment.id}/cancel`, headers });
  assert.equal(cancelled.statusCode, 200, cancelled.body);
  const queue = await setup.app.inject({ method: "GET", url: "/waitlists", headers });
  assert.equal(queue.statusCode, 200, queue.body);
  assert.equal((queue.json() as Array<{ status: string }>)[0]?.status, "promoted");
  const appointments = await setup.app.inject({ method: "GET", url: "/appointments", headers });
  const promoted = (appointments.json() as Array<{ customerEmail: string; status: string }>).find((item) => item.customerEmail === "waiting@example.com");
  assert.equal(promoted?.status, "booked");
});

test("rescheduling validates capacity and another tenant cannot list records", async () => {
  const setup = await fixture();
  const headers = { ...publicHeaders, authorization: `Bearer ${setup.owner.token}` };
  const booking = await setup.app.inject({
    method: "POST", url: "/appointments", headers,
    payload: { branchId: setup.branch.id, serviceId: setup.service.id, customerEmail: "visitor@example.com", startAt, endAt },
  });
  const appointment = booking.json() as { id: string };
  const moved = await setup.app.inject({
    method: "PATCH", url: `/appointments/${appointment.id}/reschedule`, headers,
    payload: { startAt: "2026-08-03T10:00:00Z", endAt: "2026-08-03T10:30:00Z" },
  });
  assert.equal(moved.statusCode, 200, moved.body);

  const beta = await setup.app.inject({ method: "POST", url: "/tenants", payload: { name: "Beta", slug: "beta" } });
  assert.equal(beta.statusCode, 201, beta.body);
  const betaSignup = await setup.app.inject({
    method: "POST", url: "/auth/signup", headers: { "x-tenant-slug": "beta" },
    payload: { email: "owner@beta.test", password: "another-pass" },
  });
  const betaToken = (betaSignup.json() as { token: string }).token;
  const betaList = await setup.app.inject({
    method: "GET", url: "/appointments",
    headers: { "x-tenant-slug": "beta", authorization: `Bearer ${betaToken}` },
  });
  assert.deepEqual(betaList.json(), []);
});
