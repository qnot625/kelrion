import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function lifecycleApp(name: string, slug: string) {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({
    name,
    slug,
    enabledModules: ["leave", "lifecycle"],
  });
  return buildServer(context);
}

async function signUp(
  app: ReturnType<typeof buildServer>,
  slug: string,
  email: string,
  password = "correct-horse",
) {
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
  return response.json() as { id: string; userId: string | null };
}

test("leave requests automatically carry the authenticated user's employee reference", async () => {
  const app = await lifecycleApp("Lifecycle Co", "lifecycle-co");
  const owner = await signUp(app, "lifecycle-co", "owner@lifecycle.co");
  const member = await signUp(app, "lifecycle-co", "member@lifecycle.co", "member-pass");
  const employee = await createEmployee(app, "lifecycle-co", owner.token, {
    userId: member.userId,
    email: "member@lifecycle.co",
  });

  const leave = await app.inject({
    method: "POST",
    url: "/leave-requests",
    headers: auth("lifecycle-co", member.token),
    payload: {
      type: "annual",
      startDate: "2027-09-06",
      endDate: "2027-09-10",
      reason: "Annual leave",
    },
  });
  assert.equal(leave.statusCode, 201, leave.body);
  const created = leave.json() as { requesterUserId: string; requesterEmployeeId: string | null };
  assert.equal(created.requesterUserId, member.userId);
  assert.equal(created.requesterEmployeeId, employee.id);

  const mine = await app.inject({
    method: "GET",
    url: "/leave-requests",
    headers: auth("lifecycle-co", member.token),
  });
  assert.equal(mine.statusCode, 200, mine.body);
  assert.equal((mine.json() as Array<{ requesterEmployeeId: string | null }>)[0]?.requesterEmployeeId, employee.id);
});

test("employee-first lifecycle plans survive later user-account linking", async () => {
  const app = await lifecycleApp("Onboarding Co", "onboarding-co");
  const owner = await signUp(app, "onboarding-co", "owner@onboarding.co");
  const employee = await createEmployee(app, "onboarding-co", owner.token, {
    employeeNumber: "EMP-NEW",
    firstName: "Maya",
    lastName: "Okafor",
    email: "maya@onboarding.co",
    userId: null,
  });

  const create = await app.inject({
    method: "POST",
    url: "/lifecycle-plans",
    headers: auth("onboarding-co", owner.token),
    payload: {
      subjectEmployeeId: employee.id,
      kind: "onboarding",
      title: "Maya onboarding",
    },
  });
  assert.equal(create.statusCode, 201, create.body);
  const plan = create.json() as { id: string; subjectEmployeeId: string | null; subjectUserId: string | null; steps: unknown[] };
  assert.equal(plan.subjectEmployeeId, employee.id);
  assert.equal(plan.subjectUserId, null);
  assert.equal(plan.steps.length, 5);

  const maya = await signUp(app, "onboarding-co", "maya@onboarding.co", "maya-password");
  const link = await app.inject({
    method: "PATCH",
    url: `/employees/${employee.id}`,
    headers: auth("onboarding-co", owner.token),
    payload: { userId: maya.userId },
  });
  assert.equal(link.statusCode, 200, link.body);

  const ownPlans = await app.inject({
    method: "GET",
    url: "/lifecycle-plans",
    headers: auth("onboarding-co", maya.token),
  });
  assert.equal(ownPlans.statusCode, 200, ownPlans.body);
  const visible = ownPlans.json() as Array<{ id: string; subjectEmployeeId: string | null }>;
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.id, plan.id);
  assert.equal(visible[0]?.subjectEmployeeId, employee.id);

  const missing = await app.inject({
    method: "POST",
    url: "/lifecycle-plans",
    headers: auth("onboarding-co", owner.token),
    payload: {
      subjectEmployeeId: "00000000-0000-4000-8000-000000000001",
      kind: "offboarding",
    },
  });
  assert.equal(missing.statusCode, 400, missing.body);
});

test("legacy subjectUserId input resolves to the linked employee and remains visible to that employee", async () => {
  const app = await lifecycleApp("Legacy Lifecycle", "legacy-lifecycle");
  const owner = await signUp(app, "legacy-lifecycle", "owner@legacy.co");
  const member = await signUp(app, "legacy-lifecycle", "member@legacy.co", "member-pass");
  const employee = await createEmployee(app, "legacy-lifecycle", owner.token, {
    userId: member.userId,
    email: "member@legacy.co",
  });

  const create = await app.inject({
    method: "POST",
    url: "/lifecycle-plans",
    headers: auth("legacy-lifecycle", owner.token),
    payload: {
      subjectUserId: member.userId,
      kind: "onboarding",
      title: "Linked-user onboarding",
    },
  });
  assert.equal(create.statusCode, 201, create.body);
  const plan = create.json() as { id: string; subjectEmployeeId: string | null; subjectUserId: string | null };
  assert.equal(plan.subjectEmployeeId, employee.id);
  assert.equal(plan.subjectUserId, member.userId);

  const own = await app.inject({
    method: "GET",
    url: "/lifecycle-plans",
    headers: auth("legacy-lifecycle", member.token),
  });
  assert.equal(own.statusCode, 200, own.body);
  const plans = own.json() as Array<{ id: string; subjectEmployeeId: string | null }>;
  assert.equal(plans.length, 1);
  assert.equal(plans[0]?.id, plan.id);
  assert.equal(plans[0]?.subjectEmployeeId, employee.id);
});
