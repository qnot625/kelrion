import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModuleKey } from "@adminops/control-plane";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup(name: string, slug: string, enabledModules: ModuleKey[] = ["queue"]) {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name, slug, enabledModules });
  return { context, app: buildServer(context) };
}

async function signup(app: ReturnType<typeof buildServer>, slug: string, email: string) {
  const response = await app.inject({ method: "POST", url: "/auth/signup", headers: { "x-tenant-slug": slug }, payload: { email, password: "test-password" } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}

function headers(slug: string, token: string) { return { "x-tenant-slug": slug, authorization: `Bearer ${token}` }; }

const BRANCH = "00000000-0000-4000-8000-000000000101";
const SERVICE = "00000000-0000-4000-8000-000000000201";

test("queue API supports idempotent check-in, priority ordering, service lifecycle and event replay", async () => {
  const { app } = await setup("Queue Co", "queue-co");
  const owner = await signup(app, "queue-co", "owner@queue.co");
  const member = await signup(app, "queue-co", "member@queue.co");

  const configuration = await app.inject({
    method: "POST", url: "/queue/configurations", headers: headers("queue-co", owner.token),
    payload: { branchId: BRANCH, serviceId: SERVICE, prefix: "Q", averageServiceMinutes: 8, maxConcurrentServing: 1 },
  });
  assert.equal(configuration.statusCode, 201, configuration.body);

  const standard = await app.inject({
    method: "POST", url: "/queue/check-in/walk-in", headers: headers("queue-co", member.token),
    payload: { branchId: BRANCH, serviceId: SERVICE, idempotencyKey: "mobile:001", customer: { name: "Member" } },
  });
  assert.equal(standard.statusCode, 201, standard.body);
  const standardEntry = standard.json() as { id: string; publicToken: string; ticketNumber: string; customer: { userId: string } };
  assert.equal(standardEntry.customer.userId, member.userId);
  assert.equal(standardEntry.ticketNumber, "Q001");

  const duplicate = await app.inject({
    method: "POST", url: "/queue/check-in/walk-in", headers: headers("queue-co", member.token),
    payload: { branchId: BRANCH, serviceId: SERVICE, idempotencyKey: "mobile:001" },
  });
  assert.equal(duplicate.statusCode, 201, duplicate.body);
  assert.equal((duplicate.json() as { id: string }).id, standardEntry.id);

  const urgent = await app.inject({
    method: "POST", url: "/queue/check-in/walk-in", headers: headers("queue-co", owner.token),
    payload: { branchId: BRANCH, serviceId: SERVICE, priority: "URGENT", customer: { name: "Urgent customer" } },
  });
  assert.equal(urgent.statusCode, 201, urgent.body);
  const urgentId = (urgent.json() as { id: string }).id;

  const called = await app.inject({ method: "POST", url: "/queue/call-next", headers: headers("queue-co", owner.token), payload: { branchId: BRANCH, serviceId: SERVICE, stationId: "counter-1" } });
  assert.equal(called.statusCode, 200, called.body);
  assert.equal((called.json() as { id: string }).id, urgentId);
  assert.equal((await app.inject({ method: "POST", url: `/queue/entries/${urgentId}/start`, headers: headers("queue-co", owner.token), payload: { stationId: "counter-1" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: `/queue/entries/${urgentId}/complete`, headers: headers("queue-co", owner.token), payload: {} })).statusCode, 200);

  const status = await app.inject({ method: "GET", url: `/queue/status/${standardEntry.publicToken}`, headers: headers("queue-co", member.token) });
  assert.equal(status.statusCode, 200, status.body);
  assert.equal((status.json() as { ticketNumber: string }).ticketNumber, "Q001");

  const events = await app.inject({ method: "GET", url: "/queue/events?afterSequence=0", headers: headers("queue-co", owner.token) });
  assert.equal(events.statusCode, 200, events.body);
  const eventList = events.json() as Array<{ sequence: number; type: string }>;
  assert.ok(eventList.length >= 5);
  assert.deepEqual(eventList.map((event) => event.sequence), [...eventList].map((event) => event.sequence).sort((a, b) => a - b));
  const after = await app.inject({ method: "GET", url: `/queue/events?afterSequence=${eventList[0]!.sequence}`, headers: headers("queue-co", owner.token) });
  assert.equal(after.statusCode, 200, after.body);
  assert.ok((after.json() as Array<{ sequence: number }>).every((event) => event.sequence > eventList[0]!.sequence));
});

test("members only see/cancel their own entries while owners can transfer and reprioritize", async () => {
  const { app } = await setup("Queue Access", "queue-access");
  const owner = await signup(app, "queue-access", "owner@access.queue");
  const alice = await signup(app, "queue-access", "alice@access.queue");
  const bob = await signup(app, "queue-access", "bob@access.queue");
  await app.inject({ method: "POST", url: "/queue/configurations", headers: headers("queue-access", owner.token), payload: { branchId: BRANCH, serviceId: SERVICE, prefix: "A" } });
  const branchB = "00000000-0000-4000-8000-000000000102";
  const serviceB = "00000000-0000-4000-8000-000000000202";
  await app.inject({ method: "POST", url: "/queue/configurations", headers: headers("queue-access", owner.token), payload: { branchId: branchB, serviceId: serviceB, prefix: "B" } });

  const entryResponse = await app.inject({ method: "POST", url: "/queue/check-in/walk-in", headers: headers("queue-access", alice.token), payload: { branchId: BRANCH, serviceId: SERVICE } });
  assert.equal(entryResponse.statusCode, 201, entryResponse.body);
  const entry = entryResponse.json() as { id: string };
  assert.equal((await app.inject({ method: "GET", url: `/queue/entries/${entry.id}`, headers: headers("queue-access", bob.token) })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: `/queue/entries/${entry.id}/cancel`, headers: headers("queue-access", bob.token), payload: {} })).statusCode, 403);

  const priority = await app.inject({ method: "POST", url: `/queue/entries/${entry.id}/priority`, headers: headers("queue-access", owner.token), payload: { priority: "PRIORITY", adjustment: 10 } });
  assert.equal(priority.statusCode, 200, priority.body);
  const transfer = await app.inject({ method: "POST", url: `/queue/entries/${entry.id}/transfer`, headers: headers("queue-access", owner.token), payload: { branchId: branchB, serviceId: serviceB } });
  assert.equal(transfer.statusCode, 200, transfer.body);
  const transferBody = transfer.json() as { from: { status: string }; to: { status: string; ticketNumber: string } };
  assert.equal(transferBody.from.status, "TRANSFERRED");
  assert.equal(transferBody.to.status, "WAITING");
  assert.equal(transferBody.to.ticketNumber, "B001");
});

test("queue routes are tenant-isolated, entitlement guarded and unknown appointments cannot check in", async () => {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name: "Alpha Queue", slug: "alpha-queue", enabledModules: ["queue"] });
  await context.controlPlaneService.provisionTenant({ name: "Beta Queue", slug: "beta-queue", enabledModules: ["queue"] });
  await context.controlPlaneService.provisionTenant({ name: "Disabled Queue", slug: "disabled-queue", enabledModules: ["forms"] });
  const app = buildServer(context);
  const alpha = await signup(app, "alpha-queue", "owner@alpha.queue");
  const beta = await signup(app, "beta-queue", "owner@beta.queue");
  const disabled = await signup(app, "disabled-queue", "owner@disabled.queue");
  await app.inject({ method: "POST", url: "/queue/configurations", headers: headers("alpha-queue", alpha.token), payload: { branchId: BRANCH, serviceId: SERVICE, prefix: "A" } });
  const entry = await app.inject({ method: "POST", url: "/queue/check-in/walk-in", headers: headers("alpha-queue", alpha.token), payload: { branchId: BRANCH, serviceId: SERVICE } });
  const id = (entry.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "GET", url: `/queue/entries/${id}`, headers: headers("beta-queue", beta.token) })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/queue/configurations", headers: headers("disabled-queue", disabled.token) })).statusCode, 403);
  const unknownAppointment = await app.inject({ method: "POST", url: "/queue/check-in/appointments/00000000-0000-4000-8000-000000000999", headers: headers("alpha-queue", alpha.token), payload: {} });
  assert.equal(unknownAppointment.statusCode, 404, unknownAppointment.body);
});
