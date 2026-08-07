import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function workforceApp(name: string, slug: string) {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({
    name,
    slug,
    enabledModules: ["employees", "attendance"],
  });
  return { app: buildServer(context), context };
}

async function signUp(app: ReturnType<typeof buildServer>, slug: string, email: string, password = "correct-horse") {
  const response = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": slug },
    payload: { email, password },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}

function auth(slug: string, token: string) {
  return { "x-tenant-slug": slug, authorization: `Bearer ${token}` };
}

async function createEmployee(
  app: ReturnType<typeof buildServer>,
  slug: string,
  token: string,
  input: Record<string, unknown>,
) {
  const response = await app.inject({
    method: "POST",
    url: "/employees",
    headers: auth(slug, token),
    payload: {
      employeeNumber: "EMP-001",
      firstName: "Amina",
      lastName: "Yusuf",
      email: "amina@example.com",
      hireDate: "2026-01-15",
      employmentType: "full_time",
      ...input,
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { id: string; userId: string | null; managerId: string | null };
}

test("owner manages employee records while member access is restricted to the linked employee", async () => {
  const { app } = await workforceApp("Acme Workforce", "acme-workforce");
  const owner = await signUp(app, "acme-workforce", "owner@acme.com");
  const member = await signUp(app, "acme-workforce", "member@acme.com", "member-pass");
  const employee = await createEmployee(app, "acme-workforce", owner.token, {
    userId: member.userId,
    email: "member@acme.com",
  });
  assert.equal(employee.userId, member.userId);

  const own = await app.inject({ method: "GET", url: "/employees/me", headers: auth("acme-workforce", member.token) });
  assert.equal(own.statusCode, 200, own.body);
  assert.equal((own.json() as { id: string }).id, employee.id);

  const memberList = await app.inject({ method: "GET", url: "/employees", headers: auth("acme-workforce", member.token) });
  assert.equal(memberList.statusCode, 200, memberList.body);
  assert.equal((memberList.json() as { total: number }).total, 1);

  const memberCreate = await app.inject({
    method: "POST",
    url: "/employees",
    headers: auth("acme-workforce", member.token),
    payload: {
      employeeNumber: "EMP-002",
      firstName: "Other",
      lastName: "User",
      email: "other@example.com",
      hireDate: "2026-02-01",
      employmentType: "full_time",
    },
  });
  assert.equal(memberCreate.statusCode, 403);
});

test("employee hierarchy is tenant isolated and rejects reporting cycles", async () => {
  const first = await workforceApp("Alpha Workforce", "alpha-workforce");
  const alphaOwner = await signUp(first.app, "alpha-workforce", "owner@alpha.com");
  const manager = await createEmployee(first.app, "alpha-workforce", alphaOwner.token, {
    employeeNumber: "MGR-001",
    email: "manager@alpha.com",
  });
  const report = await createEmployee(first.app, "alpha-workforce", alphaOwner.token, {
    employeeNumber: "EMP-002",
    email: "report@alpha.com",
    managerId: manager.id,
  });

  const cycle = await first.app.inject({
    method: "PATCH",
    url: `/employees/${manager.id}`,
    headers: auth("alpha-workforce", alphaOwner.token),
    payload: { managerId: report.id },
  });
  assert.equal(cycle.statusCode, 400, cycle.body);

  const secondContext = createAppContext();
  await secondContext.controlPlaneService.provisionTenant({ name: "Beta Workforce", slug: "beta-workforce", enabledModules: ["employees"] });
  const secondApp = buildServer(secondContext);
  const betaOwner = await signUp(secondApp, "beta-workforce", "owner@beta.com");
  const hidden = await secondApp.inject({
    method: "GET",
    url: `/employees/${report.id}`,
    headers: auth("beta-workforce", betaOwner.token),
  });
  assert.equal(hidden.statusCode, 404);
});

test("member attendance is self-only, idempotent and corrections can be approved by the owner", async () => {
  const { app } = await workforceApp("Clock Co", "clock-co");
  const owner = await signUp(app, "clock-co", "owner@clock.com");
  const member = await signUp(app, "clock-co", "member@clock.com", "member-pass");
  const employee = await createEmployee(app, "clock-co", owner.token, {
    userId: member.userId,
    email: "member@clock.com",
  });
  const other = await createEmployee(app, "clock-co", owner.token, {
    employeeNumber: "EMP-002",
    email: "other@clock.com",
  });

  const clockIn = await app.inject({
    method: "POST",
    url: "/attendance/clock",
    headers: auth("clock-co", member.token),
    payload: {
      action: "clock_in",
      timestamp: "2026-08-06T08:00:00.000Z",
      idempotencyKey: "mobile-1:event-1",
    },
  });
  assert.equal(clockIn.statusCode, 200, clockIn.body);
  const recordId = (clockIn.json() as { id: string }).id;

  const duplicate = await app.inject({
    method: "POST",
    url: "/attendance/clock",
    headers: auth("clock-co", member.token),
    payload: {
      action: "clock_in",
      timestamp: "2026-08-06T08:00:00.000Z",
      idempotencyKey: "mobile-1:event-1",
    },
  });
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal((duplicate.json() as { id: string }).id, recordId);

  const impersonation = await app.inject({
    method: "POST",
    url: "/attendance/clock",
    headers: auth("clock-co", member.token),
    payload: {
      employeeId: other.id,
      action: "clock_in",
      timestamp: "2026-08-06T09:00:00.000Z",
    },
  });
  assert.equal(impersonation.statusCode, 403);

  const requestCorrection = await app.inject({
    method: "POST",
    url: "/attendance/corrections",
    headers: auth("clock-co", member.token),
    payload: {
      requestedAction: "clock_in",
      requestedAt: "2026-08-07T09:00:00.000Z",
      reason: "Forgot to clock in",
    },
  });
  assert.equal(requestCorrection.statusCode, 201, requestCorrection.body);
  const correctionId = (requestCorrection.json() as { id: string }).id;

  const approve = await app.inject({
    method: "POST",
    url: `/attendance/corrections/${correctionId}/approve`,
    headers: auth("clock-co", owner.token),
    payload: { reviewNotes: "Verified by manager" },
  });
  assert.equal(approve.statusCode, 200, approve.body);
  assert.equal((approve.json() as { status: string }).status, "approved");

  const history = await app.inject({
    method: "GET",
    url: `/attendance/records?employeeId=${employee.id}&startDate=2026-08-07&endDate=2026-08-07`,
    headers: auth("clock-co", member.token),
  });
  assert.equal(history.statusCode, 200, history.body);
  assert.equal((history.json() as Array<{ status: string }>)[0]?.status, "clocked_in");
});
