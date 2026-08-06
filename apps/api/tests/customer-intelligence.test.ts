import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function tenant(app: ReturnType<typeof buildServer>, name: string, slug: string) {
  const response = await app.inject({ method: "POST", url: "/tenants", payload: { name, slug } });
  assert.equal(response.statusCode, 201, response.body);
}
async function signup(app: ReturnType<typeof buildServer>, slug: string, email: string) {
  const response = await app.inject({
    method: "POST", url: "/auth/signup", headers: { "x-tenant-slug": slug },
    payload: { email, password: "correct-horse" },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}
function auth(slug: string, token: string) {
  return { "x-tenant-slug": slug, authorization: `Bearer ${token}` };
}
async function createCase(app: ReturnType<typeof buildServer>, slug: string, token: string) {
  const response = await app.inject({
    method: "POST", url: "/cases", headers: auth(slug, token),
    payload: {
      customerEmail: "customer@example.com",
      subject: "Delayed service request",
      description: "The requested service has not been completed.",
      category: "Service delivery",
      priority: "urgent",
    },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { id: string; status: string; slaDueAt: string; reference: string };
}

test("members can create cases but cannot access the operational queue", async () => {
  const app = buildServer(createAppContext());
  await tenant(app, "Acme", "acme");
  await signup(app, "acme", "owner@acme.com");
  const member = await signup(app, "acme", "member@acme.com");
  const customerCase = await createCase(app, "acme", member.token);
  assert.equal(customerCase.status, "open");
  assert.match(customerCase.reference, /^KLR-/);
  const deadlineHours = (new Date(customerCase.slaDueAt).getTime() - Date.now()) / 3_600_000;
  assert.ok(deadlineHours > 3.9 && deadlineHours <= 4.1);

  const list = await app.inject({ method: "GET", url: "/cases", headers: auth("acme", member.token) });
  assert.equal(list.statusCode, 403);
});

test("owner assigns, comments on and resolves a case", async () => {
  const app = buildServer(createAppContext());
  await tenant(app, "Acme", "acme");
  const owner = await signup(app, "acme", "owner@acme.com");
  const customerCase = await createCase(app, "acme", owner.token);

  const assign = await app.inject({
    method: "POST", url: `/cases/${customerCase.id}/assign`, headers: auth("acme", owner.token),
    payload: { ownerUserId: owner.userId },
  });
  assert.equal(assign.statusCode, 200, assign.body);
  assert.equal((assign.json() as { status: string }).status, "in_progress");

  const comment = await app.inject({
    method: "POST", url: `/cases/${customerCase.id}/comments`, headers: auth("acme", owner.token),
    payload: { body: "We contacted the service team.", visibility: "internal" },
  });
  assert.equal(comment.statusCode, 201, comment.body);

  const resolve = await app.inject({
    method: "POST", url: `/cases/${customerCase.id}/status`, headers: auth("acme", owner.token),
    payload: { status: "resolved", resolution: "Service completed and confirmed by the customer." },
  });
  assert.equal(resolve.statusCode, 200, resolve.body);
  assert.equal((resolve.json() as { status: string; slaState: string }).status, "resolved");

  const comments = await app.inject({ method: "GET", url: `/cases/${customerCase.id}/comments`, headers: auth("acme", owner.token) });
  assert.equal((comments.json() as unknown[]).length, 1);
});

test("case records remain tenant isolated", async () => {
  const app = buildServer(createAppContext());
  await tenant(app, "Acme", "acme");
  await tenant(app, "Beta", "beta");
  const acme = await signup(app, "acme", "owner@acme.com");
  const beta = await signup(app, "beta", "owner@beta.com");
  const customerCase = await createCase(app, "acme", acme.token);
  const cross = await app.inject({ method: "GET", url: `/cases/${customerCase.id}`, headers: auth("beta", beta.token) });
  assert.equal(cross.statusCode, 404);
  const betaList = await app.inject({ method: "GET", url: "/cases", headers: auth("beta", beta.token) });
  assert.deepEqual(betaList.json(), []);
});

test("executive summary uses real cases and appointments", async () => {
  const app = buildServer(createAppContext());
  await tenant(app, "Acme", "acme");
  const owner = await signup(app, "acme", "owner@acme.com");
  const customerCase = await createCase(app, "acme", owner.token);
  await app.inject({
    method: "POST", url: `/cases/${customerCase.id}/status`, headers: auth("acme", owner.token),
    payload: { status: "resolved", resolution: "The issue was fixed." },
  });
  const booking = await app.inject({
    method: "POST", url: "/appointments", headers: auth("acme", owner.token),
    payload: {
      customerEmail: "visitor@example.com", serviceName: "Consultation",
      startAt: new Date().toISOString(), endAt: new Date(Date.now() + 1_800_000).toISOString(),
    },
  });
  const appointment = booking.json() as { id: string };
  await app.inject({ method: "POST", url: `/appointments/${appointment.id}/check-in`, headers: auth("acme", owner.token) });
  await app.inject({ method: "POST", url: `/appointments/${appointment.id}/complete`, headers: auth("acme", owner.token) });

  const summary = await app.inject({ method: "GET", url: "/executive/summary", headers: auth("acme", owner.token) });
  assert.equal(summary.statusCode, 200, summary.body);
  const body = summary.json() as { cases: { total: number; resolved: number }; appointments: { total: number; completed: number } };
  assert.deepEqual(body.cases, { ...body.cases, total: 1, resolved: 1 });
  assert.equal(body.appointments.total, 1);
  assert.equal(body.appointments.completed, 1);
});

test("case activity is auditable", async () => {
  const app = buildServer(createAppContext());
  await tenant(app, "Acme", "acme");
  const owner = await signup(app, "acme", "owner@acme.com");
  const customerCase = await createCase(app, "acme", owner.token);
  await app.inject({
    method: "POST", url: `/cases/${customerCase.id}/assign`, headers: auth("acme", owner.token),
    payload: { ownerUserId: owner.userId },
  });
  const audit = await app.inject({ method: "GET", url: "/audit-events", headers: auth("acme", owner.token) });
  const actions = (audit.json() as Array<{ action: string }>).map((event) => event.action);
  assert.ok(actions.includes("case.created"));
  assert.ok(actions.includes("case.assigned"));
});
