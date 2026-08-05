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

test("Attendance REST API — Real-time clocking, Break state transitions, Lookup, Summary, and Multi-tenant isolation", async () => {
  const app = buildServer(createAppContext());

  // 1. Setup Tenant Alpha & Tenant Beta with users
  await createTenant(app, "Tenant Alpha", "tenant-alpha");
  const ownerAlpha = await signUp(app, "tenant-alpha", "owner@alpha.com", "securepass123");

  await createTenant(app, "Tenant Beta", "tenant-beta");
  const ownerBeta = await signUp(app, "tenant-beta", "owner@beta.com", "securepass123");

  const empIdAlpha = "11111111-1111-4111-a111-111111111111";
  const today = "2026-08-02";

  // 2. Unauthorized request (no token) -> 401
  const unauthClockIn = await app.inject({
    method: "POST",
    url: "/attendance/clock-in",
    headers: { "x-tenant-slug": "tenant-alpha" },
    payload: { employeeId: empIdAlpha, workDate: today },
  });
  assert.equal(unauthClockIn.statusCode, 401);

  // 3. Invalid payload (missing employeeId) -> 400
  const invalidClockIn = await app.inject({
    method: "POST",
    url: "/attendance/clock-in",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: { workDate: today },
  });
  assert.equal(invalidClockIn.statusCode, 400);

  // 4. Clock In -> 201
  const clockIn1 = await app.inject({
    method: "POST",
    url: "/attendance/clock-in",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: empIdAlpha,
      workDate: today,
      timestamp: `${today}T08:00:00.000Z`,
      idempotencyKey: "evt_clk_in_001",
      location: { latitude: 37.7749, longitude: -122.4194 },
      notes: "Morning shift start",
    },
  });
  assert.equal(clockIn1.statusCode, 201, clockIn1.body);
  const clockInBody = clockIn1.json() as { message: string; record: { status: string; clockInTime: string } };
  assert.equal(clockInBody.record.status, "CLOCKED_IN");
  assert.equal(clockInBody.record.clockInTime, `${today}T08:00:00.000Z`);

  // 5. Duplicate Clock In -> 409 Conflict Error
  const duplicateClockIn = await app.inject({
    method: "POST",
    url: "/attendance/clock-in",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: empIdAlpha,
      workDate: today,
      timestamp: `${today}T08:05:00.000Z`,
    },
  });
  assert.equal(duplicateClockIn.statusCode, 409, duplicateClockIn.body);

  // 6. Start Break -> 200
  const breakStart = await app.inject({
    method: "POST",
    url: "/attendance/break-start",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: empIdAlpha,
      workDate: today,
      timestamp: `${today}T12:00:00.000Z`,
      notes: "Lunch break",
    },
  });
  assert.equal(breakStart.statusCode, 200, breakStart.body);
  assert.equal((breakStart.json() as { record: { status: string } }).record.status, "ON_BREAK");

  // 7. End Break -> 200
  const breakEnd = await app.inject({
    method: "POST",
    url: "/attendance/break-end",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: empIdAlpha,
      workDate: today,
      timestamp: `${today}T12:30:00.000Z`,
    },
  });
  assert.equal(breakEnd.statusCode, 200, breakEnd.body);
  assert.equal((breakEnd.json() as { record: { status: string } }).record.status, "CLOCKED_IN");

  // 8. Clock Out -> 200
  const clockOut = await app.inject({
    method: "POST",
    url: "/attendance/clock-out",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: empIdAlpha,
      workDate: today,
      timestamp: `${today}T17:00:00.000Z`,
    },
  });
  assert.equal(clockOut.statusCode, 200, clockOut.body);
  const clockOutBody = clockOut.json() as { record: { status: string; totalBreakMinutes: number } };
  assert.equal(clockOutBody.record.status, "CLOCKED_OUT");
  assert.equal(clockOutBody.record.totalBreakMinutes, 30);

  // 9. Employee Lookup GET /attendance/employee/:employeeId -> 200
  const lookup = await app.inject({
    method: "GET",
    url: `/attendance/employee/${empIdAlpha}?workDate=${today}`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
  });
  assert.equal(lookup.statusCode, 200, lookup.body);
  assert.equal((lookup.json() as { record: { employeeId: string } }).record.employeeId, empIdAlpha);

  // 10. Multi-Tenant Isolation: Tenant Beta querying Tenant Alpha's employee record -> 404
  const tenantIsolationLookup = await app.inject({
    method: "GET",
    url: `/attendance/employee/${empIdAlpha}?workDate=${today}`,
    headers: { "x-tenant-slug": "tenant-beta", authorization: `Bearer ${ownerBeta.token}` },
  });
  assert.equal(tenantIsolationLookup.statusCode, 404);

  // 11. GET /attendance/summary -> 200
  const summary = await app.inject({
    method: "GET",
    url: `/attendance/summary?employeeId=${empIdAlpha}&startDate=${today}`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
  });
  assert.equal(summary.statusCode, 200, summary.body);
  assert.equal((summary.json() as { count: number }).count, 1);
});

test("Attendance REST API — Offline Batch Synchronization (/attendance/sync)", async () => {
  const app = buildServer(createAppContext());

  const tenantSync = await createTenant(app, "Tenant Sync", "tenant-sync");
  const user = await signUp(app, "tenant-sync", "sync@test.com", "securepass123");

  const empId = "33333333-3333-4333-a333-333333333333";
  const workDate = "2026-08-02";

  // Batch payload with out-of-order events and duplicate idempotency key
  const batchPayload = {
    events: [
      {
        eventId: "evt-002",
        tenantId: tenantSync.id,
        employeeId: empId,
        workDate,
        eventType: "break_start",
        timestamp: `${workDate}T12:00:00.000Z`,
        idempotencyKey: "idem-brk-start-001",
        source: "mobile",
      },
      {
        eventId: "evt-001",
        tenantId: tenantSync.id,
        employeeId: empId,
        workDate,
        eventType: "clock_in",
        timestamp: `${workDate}T08:00:00.000Z`,
        idempotencyKey: "idem-clk-in-001",
        source: "mobile",
      },
      {
        eventId: "evt-003",
        tenantId: tenantSync.id,
        employeeId: empId,
        workDate,
        eventType: "break_end",
        timestamp: `${workDate}T12:30:00.000Z`,
        idempotencyKey: "idem-brk-end-001",
        source: "mobile",
      },
    ],
  };

  const syncResponse1 = await app.inject({
    method: "POST",
    url: "/attendance/sync",
    headers: { "x-tenant-slug": "tenant-sync", authorization: `Bearer ${user.token}` },
    payload: batchPayload,
  });
  assert.equal(syncResponse1.statusCode, 200, syncResponse1.body);
  const syncBody1 = syncResponse1.json() as { processedCount: number; duplicateCount: number; rejectedCount: number };
  assert.equal(syncBody1.processedCount, 3);
  assert.equal(syncBody1.duplicateCount, 0);
  assert.equal(syncBody1.rejectedCount, 0);

  // Re-sync exact same batch -> All 3 detected as DUPLICATES
  const syncResponse2 = await app.inject({
    method: "POST",
    url: "/attendance/sync",
    headers: { "x-tenant-slug": "tenant-sync", authorization: `Bearer ${user.token}` },
    payload: batchPayload,
  });
  assert.equal(syncResponse2.statusCode, 200, syncResponse2.body);
  const syncBody2 = syncResponse2.json() as { processedCount: number; duplicateCount: number; rejectedCount: number };
  assert.equal(syncBody2.processedCount, 0);
  assert.equal(syncBody2.duplicateCount, 3);
  assert.equal(syncBody2.rejectedCount, 0);
});
