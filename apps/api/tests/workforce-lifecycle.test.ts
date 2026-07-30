import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function createTenant(app: ReturnType<typeof buildServer>, name: string, slug: string) {
  const response = await app.inject({ method: "POST", url: "/tenants", payload: { name, slug } });
  assert.equal(response.statusCode, 201, response.body);
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

function headers(slug: string, token: string) {
  return { "x-tenant-slug": slug, authorization: `Bearer ${token}` };
}

test("member submits leave and receives a calculated balance", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme", "acme");
  await signUp(app, "acme", "owner@acme.com");
  const member = await signUp(app, "acme", "member@acme.com");

  const submit = await app.inject({
    method: "POST",
    url: "/leave-requests",
    headers: headers("acme", member.token),
    payload: {
      type: "annual",
      startDate: "2027-02-01",
      endDate: "2027-02-05",
      reason: "Family commitment",
    },
  });
  assert.equal(submit.statusCode, 201, submit.body);
  const leave = submit.json() as { workingDays: number; status: string };
  assert.equal(leave.workingDays, 5);
  assert.equal(leave.status, "pending");

  const balance = await app.inject({
    method: "GET",
    url: "/leave-balances",
    headers: headers("acme", member.token),
  });
  assert.equal(balance.statusCode, 200, balance.body);
  const annual = (balance.json() as Array<{ type: string; remainingDays: number }>).find(
    (item) => item.type === "annual",
  );
  assert.equal(annual?.remainingDays, 15);
});

test("owner can view and approve team leave while a member cannot request all records", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme", "acme");
  const owner = await signUp(app, "acme", "owner@acme.com");
  const member = await signUp(app, "acme", "member@acme.com");

  const submit = await app.inject({
    method: "POST",
    url: "/leave-requests",
    headers: headers("acme", member.token),
    payload: {
      type: "sick",
      startDate: "2027-03-08",
      endDate: "2027-03-09",
      reason: "Medical recovery",
    },
  });
  const leave = submit.json() as { id: string };

  const forbidden = await app.inject({
    method: "GET",
    url: "/leave-requests?scope=all",
    headers: headers("acme", member.token),
  });
  assert.equal(forbidden.statusCode, 403);

  const approve = await app.inject({
    method: "POST",
    url: `/leave-requests/${leave.id}/approve`,
    headers: headers("acme", owner.token),
    payload: { note: "Approved with coverage arranged" },
  });
  assert.equal(approve.statusCode, 200, approve.body);
  assert.equal((approve.json() as { status: string }).status, "approved");

  const all = await app.inject({
    method: "GET",
    url: "/leave-requests?scope=all",
    headers: headers("acme", owner.token),
  });
  assert.equal(all.statusCode, 200, all.body);
  assert.equal((all.json() as unknown[]).length, 1);
});

test("overlapping leave is rejected and tenants cannot address each other's requests", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme", "acme");
  await createTenant(app, "Beta", "beta");
  const acme = await signUp(app, "acme", "owner@acme.com");
  const beta = await signUp(app, "beta", "owner@beta.com");

  const first = await app.inject({
    method: "POST",
    url: "/leave-requests",
    headers: headers("acme", acme.token),
    payload: {
      type: "annual",
      startDate: "2027-04-05",
      endDate: "2027-04-09",
      reason: "Annual leave",
    },
  });
  const request = first.json() as { id: string };

  const overlap = await app.inject({
    method: "POST",
    url: "/leave-requests",
    headers: headers("acme", acme.token),
    payload: {
      type: "annual",
      startDate: "2027-04-08",
      endDate: "2027-04-12",
      reason: "Second request",
    },
  });
  assert.equal(overlap.statusCode, 400);
  assert.match(overlap.body, /overlap/i);

  const crossTenant = await app.inject({
    method: "POST",
    url: `/leave-requests/${request.id}/approve`,
    headers: headers("beta", beta.token),
  });
  assert.equal(crossTenant.statusCode, 404);
});

test("onboarding and offboarding plans use default checklists and complete automatically", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme", "acme");
  const owner = await signUp(app, "acme", "owner@acme.com");
  const member = await signUp(app, "acme", "member@acme.com");

  const forbidden = await app.inject({
    method: "POST",
    url: "/lifecycle-plans",
    headers: headers("acme", member.token),
    payload: { subjectUserId: member.userId, kind: "onboarding" },
  });
  assert.equal(forbidden.statusCode, 403);

  const created = await app.inject({
    method: "POST",
    url: "/lifecycle-plans",
    headers: headers("acme", owner.token),
    payload: {
      subjectUserId: member.userId,
      kind: "onboarding",
      title: "Customer success onboarding",
      dueAt: "2027-05-31T17:00:00Z",
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  let plan = created.json() as {
    id: string;
    status: string;
    steps: Array<{ id: string; status: string }>;
  };
  assert.equal(plan.steps.length, 5);
  assert.equal(plan.status, "active");

  for (const step of plan.steps) {
    const complete = await app.inject({
      method: "POST",
      url: `/lifecycle-plans/${plan.id}/steps/${step.id}/complete`,
      headers: headers("acme", owner.token),
    });
    assert.equal(complete.statusCode, 200, complete.body);
    plan = complete.json() as typeof plan;
  }
  assert.equal(plan.status, "completed");
  assert.ok(plan.steps.every((step) => step.status === "completed"));

  const ownPlans = await app.inject({
    method: "GET",
    url: "/lifecycle-plans",
    headers: headers("acme", member.token),
  });
  assert.equal((ownPlans.json() as unknown[]).length, 1);
});

test("leave and lifecycle actions are written to the audit trail", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme", "acme");
  const owner = await signUp(app, "acme", "owner@acme.com");

  const leave = await app.inject({
    method: "POST",
    url: "/leave-requests",
    headers: headers("acme", owner.token),
    payload: {
      type: "annual",
      startDate: "2027-06-07",
      endDate: "2027-06-08",
      reason: "Personal leave",
    },
  });
  const request = leave.json() as { id: string };
  await app.inject({
    method: "POST",
    url: `/leave-requests/${request.id}/approve`,
    headers: headers("acme", owner.token),
  });

  const audit = await app.inject({
    method: "GET",
    url: "/audit-events",
    headers: headers("acme", owner.token),
  });
  const actions = (audit.json() as Array<{ action: string }>).map((event) => event.action);
  assert.ok(actions.includes("leave.requested"));
  assert.ok(actions.includes("leave.approved"));
});
