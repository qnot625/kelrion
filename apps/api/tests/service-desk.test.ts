import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModuleKey } from "@adminops/control-plane";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup(name: string, slug: string, enabledModules: ModuleKey[] = ["service-desk"]) {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name, slug, enabledModules });
  return buildServer(context);
}

async function signup(app: ReturnType<typeof buildServer>, slug: string, email: string) {
  const response = await app.inject({ method: "POST", url: "/auth/signup", headers: { "x-tenant-slug": slug }, payload: { email, password: "test-password" } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}

function headers(slug: string, token: string) { return { "x-tenant-slug": slug, authorization: `Bearer ${token}` }; }

test("service desk API separates requester visibility from operator management", async () => {
  const app = await setup("Desk Co", "desk-co");
  const owner = await signup(app, "desk-co", "owner@desk.co");
  const member = await signup(app, "desk-co", "member@desk.co");
  const stranger = await signup(app, "desk-co", "stranger@desk.co");

  const sla = await app.inject({ method: "POST", url: "/service-desk/sla-policies", headers: headers("desk-co", owner.token), payload: { name: "Urgent incidents", ticketTypes: ["INCIDENT"], priorities: ["URGENT"], firstResponseMinutes: 15, resolutionMinutes: 120 } });
  assert.equal(sla.statusCode, 201, sla.body);
  const slaId = (sla.json() as { id: string }).id;

  const created = await app.inject({ method: "POST", url: "/service-desk/tickets", headers: headers("desk-co", member.token), payload: { type: "INCIDENT", priority: "URGENT", subject: "VPN is down", description: "Cannot reach corporate resources" } });
  assert.equal(created.statusCode, 201, created.body);
  const ticket = created.json() as { id: string; slaPolicyId: string; requester: { userId: string } };
  assert.equal(ticket.slaPolicyId, slaId);
  assert.equal(ticket.requester.userId, member.userId);

  assert.equal((await app.inject({ method: "GET", url: `/service-desk/tickets/${ticket.id}`, headers: headers("desk-co", stranger.token) })).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/service-desk/tickets?scope=all", headers: headers("desk-co", member.token) })).statusCode, 403);

  const internal = await app.inject({ method: "POST", url: `/service-desk/tickets/${ticket.id}/comments`, headers: headers("desk-co", owner.token), payload: { visibility: "INTERNAL", body: "Investigating firewall change" } });
  assert.equal(internal.statusCode, 200, internal.body);
  const response = await app.inject({ method: "POST", url: `/service-desk/tickets/${ticket.id}/comments`, headers: headers("desk-co", owner.token), payload: { visibility: "REQUESTER", body: "We are investigating" } });
  assert.equal(response.statusCode, 200, response.body);
  assert.ok((response.json() as { firstRespondedAt: string | null }).firstRespondedAt);

  const memberView = await app.inject({ method: "GET", url: `/service-desk/tickets/${ticket.id}`, headers: headers("desk-co", member.token) });
  assert.equal(memberView.statusCode, 200, memberView.body);
  const comments = (memberView.json() as { comments: Array<{ visibility: string }> }).comments;
  assert.deepEqual(comments.map((item) => item.visibility), ["REQUESTER"]);

  assert.equal((await app.inject({ method: "POST", url: `/service-desk/tickets/${ticket.id}/assign`, headers: headers("desk-co", member.token), payload: { assigneeUserId: member.userId } })).statusCode, 403);
  const assigned = await app.inject({ method: "POST", url: `/service-desk/tickets/${ticket.id}/assign`, headers: headers("desk-co", owner.token), payload: { assigneeUserId: owner.userId, assignmentGroupId: "it" } });
  assert.equal(assigned.statusCode, 200, assigned.body);
  const resolved = await app.inject({ method: "POST", url: `/service-desk/tickets/${ticket.id}/transition`, headers: headers("desk-co", owner.token), payload: { status: "RESOLVED", reason: "VPN route restored" } });
  assert.equal(resolved.statusCode, 200, resolved.body);
  assert.equal((resolved.json() as { status: string }).status, "RESOLVED");
});

test("service desk routes are tenant-isolated and entitlement guarded", async () => {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name: "Alpha", slug: "alpha-desk", enabledModules: ["service-desk"] });
  await context.controlPlaneService.provisionTenant({ name: "Beta", slug: "beta-desk", enabledModules: ["service-desk"] });
  await context.controlPlaneService.provisionTenant({ name: "Disabled", slug: "disabled-desk", enabledModules: ["forms"] });
  const app = buildServer(context);
  const alpha = await signup(app, "alpha-desk", "owner@alpha.desk");
  const beta = await signup(app, "beta-desk", "owner@beta.desk");
  const disabled = await signup(app, "disabled-desk", "owner@disabled.desk");

  const created = await app.inject({ method: "POST", url: "/service-desk/tickets", headers: headers("alpha-desk", alpha.token), payload: { type: "SERVICE_REQUEST", subject: "New monitor" } });
  assert.equal(created.statusCode, 201, created.body);
  const id = (created.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "GET", url: `/service-desk/tickets/${id}`, headers: headers("beta-desk", beta.token) })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/service-desk/tickets", headers: headers("disabled-desk", disabled.token) })).statusCode, 403);
});
