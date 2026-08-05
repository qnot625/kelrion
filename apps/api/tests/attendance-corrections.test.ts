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

async function createEmployee(
  app: ReturnType<typeof buildServer>,
  slug: string,
  token: string,
  empNumber: string,
  email: string,
) {
  const response = await app.inject({
    method: "POST",
    url: "/employees",
    headers: { "x-tenant-slug": slug, authorization: `Bearer ${token}` },
    payload: {
      employeeNumber: empNumber,
      firstName: "John",
      lastName: "Doe",
      email,
      hireDate: "2026-01-15",
      employmentType: "full_time",
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { id: string };
}

test("Attendance Correction Request Workflow API — Submission, Filtering, Single Lookup, Approval & Rejection Lifecycle, and Multi-Tenant Isolation", async () => {
  const app = buildServer(createAppContext());

  // 1. Setup Tenant Alpha & Tenant Beta
  await createTenant(app, "Tenant Alpha", "tenant-alpha");
  const ownerAlpha = await signUp(app, "tenant-alpha", "owner@alpha.com", "securepass123");
  const empAlpha = await createEmployee(app, "tenant-alpha", ownerAlpha.token, "EMP-101", "john.doe@alpha.com");

  await createTenant(app, "Tenant Beta", "tenant-beta");
  const ownerBeta = await signUp(app, "tenant-beta", "owner@beta.com", "securepass123");
  const empBeta = await createEmployee(app, "tenant-beta", ownerBeta.token, "EMP-201", "jane.doe@beta.com");

  // 2. Submit Correction Request (Tenant Alpha)
  const submitRes = await app.inject({
    method: "POST",
    url: "/attendance/corrections",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: empAlpha.id,
      requestedEventType: "clock_in",
      requestedTimestamp: "2026-08-02T08:00:00.000Z",
      reason: "Forgot to clock in on arrival",
    },
  });
  assert.equal(submitRes.statusCode, 201, submitRes.body);
  const submitBody = submitRes.json() as {
    message: string;
    correction: { id: string; status: string; employeeId: string; requestedEventType: string };
  };
  assert.equal(submitBody.correction.status, "pending");
  assert.equal(submitBody.correction.employeeId, empAlpha.id);
  assert.equal(submitBody.correction.requestedEventType, "clock_in");
  const correctionIdAlpha = submitBody.correction.id;

  // 3. Invalid Submission Payload -> 400 Bad Request
  const invalidSubmit = await app.inject({
    method: "POST",
    url: "/attendance/corrections",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: empAlpha.id,
      requestedEventType: "invalid_event",
      requestedTimestamp: "2026-08-02T08:00:00.000Z",
      reason: "Invalid event type test",
    },
  });
  assert.equal(invalidSubmit.statusCode, 400, invalidSubmit.body);

  // 4. Submit for Non-Existent Employee -> 404 Not Found
  const nonExistentEmpSubmit = await app.inject({
    method: "POST",
    url: "/attendance/corrections",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: {
      employeeId: "99999999-9999-4999-9999-999999999999",
      requestedEventType: "clock_in",
      requestedTimestamp: "2026-08-02T08:00:00.000Z",
      reason: "Non existent employee",
    },
  });
  assert.equal(nonExistentEmpSubmit.statusCode, 404, nonExistentEmpSubmit.body);

  // 5. List Corrections (Tenant Alpha) -> 200 OK
  const listRes = await app.inject({
    method: "GET",
    url: "/attendance/corrections",
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
  });
  assert.equal(listRes.statusCode, 200, listRes.body);
  const listBody = listRes.json() as { corrections: Array<{ id: string }>; total: number };
  assert.equal(listBody.total, 1);
  assert.equal(listBody.corrections[0].id, correctionIdAlpha);

  // 6. Get Single Correction (Tenant Alpha) -> 200 OK
  const singleRes = await app.inject({
    method: "GET",
    url: `/attendance/corrections/${correctionIdAlpha}`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
  });
  assert.equal(singleRes.statusCode, 200, singleRes.body);

  // 7. Multi-Tenant Isolation Protection (Tenant Beta attempting to view Tenant Alpha correction) -> 404
  const crossTenantGet = await app.inject({
    method: "GET",
    url: `/attendance/corrections/${correctionIdAlpha}`,
    headers: { "x-tenant-slug": "tenant-beta", authorization: `Bearer ${ownerBeta.token}` },
  });
  assert.equal(crossTenantGet.statusCode, 404);

  // 8. Approve Correction Request (Tenant Alpha) -> 200 OK
  const approveRes = await app.inject({
    method: "POST",
    url: `/attendance/corrections/${correctionIdAlpha}/approve`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: { reviewNotes: "Verified via security gate log" },
  });
  assert.equal(approveRes.statusCode, 200, approveRes.body);
  const approveBody = approveRes.json() as {
    message: string;
    correction: { status: string; reviewNotes: string };
    attendanceRecord: { status: string; clockInTime: string };
  };
  assert.equal(approveBody.correction.status, "approved");
  assert.equal(approveBody.correction.reviewNotes, "Verified via security gate log");
  assert.equal(approveBody.attendanceRecord.status, "CLOCKED_IN");
  assert.equal(approveBody.attendanceRecord.clockInTime, "2026-08-02T08:00:00.000Z");

  // 9. Re-Approve Already Approved Request -> 409 Conflict
  const reApproveRes = await app.inject({
    method: "POST",
    url: `/attendance/corrections/${correctionIdAlpha}/approve`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: { reviewNotes: "Attempting re-approval" },
  });
  assert.equal(reApproveRes.statusCode, 409, reApproveRes.body);

  // 10. Re-Reject Already Approved Request -> 409 Conflict
  const reRejectRes = await app.inject({
    method: "POST",
    url: `/attendance/corrections/${correctionIdAlpha}/reject`,
    headers: { "x-tenant-slug": "tenant-alpha", authorization: `Bearer ${ownerAlpha.token}` },
    payload: { reviewNotes: "Attempting rejection on approved ticket" },
  });
  assert.equal(reRejectRes.statusCode, 409, reRejectRes.body);

  // 11. Test Rejection Lifecycle (Tenant Beta)
  const submitBeta = await app.inject({
    method: "POST",
    url: "/attendance/corrections",
    headers: { "x-tenant-slug": "tenant-beta", authorization: `Bearer ${ownerBeta.token}` },
    payload: {
      employeeId: empBeta.id,
      requestedEventType: "clock_out",
      requestedTimestamp: "2026-08-02T17:00:00.000Z",
      reason: "Forgot to clock out",
    },
  });
  assert.equal(submitBeta.statusCode, 201, submitBeta.body);
  const correctionIdBeta = (submitBeta.json() as { correction: { id: string } }).correction.id;

  const rejectRes = await app.inject({
    method: "POST",
    url: `/attendance/corrections/${correctionIdBeta}/reject`,
    headers: { "x-tenant-slug": "tenant-beta", authorization: `Bearer ${ownerBeta.token}` },
    payload: { reviewNotes: "Badges indicate employee left early at 15:00" },
  });
  assert.equal(rejectRes.statusCode, 200, rejectRes.body);
  const rejectBody = rejectRes.json() as { correction: { status: string; reviewNotes: string } };
  assert.equal(rejectBody.correction.status, "rejected");
  assert.equal(rejectBody.correction.reviewNotes, "Badges indicate employee left early at 15:00");
});
