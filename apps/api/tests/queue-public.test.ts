import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup() {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name: "Public Queue Co", slug: "public-queue", enabledModules: ["queue"] });
  const tenant = await context.tenantRepository.findBySlug("public-queue");
  assert.ok(tenant);
  const branchId = "00000000-0000-4000-8000-000000000811";
  const serviceId = "00000000-0000-4000-8000-000000000812";
  await context.queueService.createConfiguration({ tenantId: tenant.id, actorUserId: "00000000-0000-4000-8000-000000000813", branchId, serviceId, prefix: "P", maxConcurrentServing: 2 });
  const entry = await context.queueService.checkInWalkIn({
    tenantId: tenant.id,
    branchId,
    serviceId,
    actorUserId: null,
    customer: { userId: "00000000-0000-4000-8000-000000000814", name: "Private Person", email: "private@example.test", phone: "+2348000000000" },
  });
  await context.queueService.callNext({ tenantId: tenant.id, branchId, serviceId, actorUserId: "00000000-0000-4000-8000-000000000813", stationId: "Desk 7" });
  return { app: buildServer(context), branchId, serviceId, entry };
}

test("public Queue ticket status never exposes customer PII", async () => {
  const { app, entry } = await setup();
  const response = await app.inject({ method: "GET", url: `/public/queue/status/${entry.publicToken}`, headers: { "x-tenant-slug": "public-queue" } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json() as Record<string, unknown>;
  assert.equal(body.ticketNumber, entry.ticketNumber);
  assert.equal(body.stationId, "Desk 7");
  assert.equal("customer" in body, false);
  assert.equal("tenantId" in body, false);
  assert.doesNotMatch(response.body, /Private Person|private@example|234800/);
});

test("public Queue display exposes operational ticket state but no customer data", async () => {
  const { app, branchId, serviceId } = await setup();
  const response = await app.inject({ method: "GET", url: `/public/queue/display?branchId=${branchId}&serviceId=${serviceId}`, headers: { "x-tenant-slug": "public-queue" } });
  assert.equal(response.statusCode, 200, response.body);
  const body = response.json() as { waiting: number; active: Array<Record<string, unknown>> };
  assert.equal(body.active.length, 1);
  assert.equal(body.active[0]?.stationId, "Desk 7");
  assert.equal("customer" in (body.active[0] ?? {}), false);
  assert.doesNotMatch(response.body, /Private Person|private@example|234800/);
});

test("public Queue surfaces are read-only; check-in remains authenticated", async () => {
  const { app, branchId, serviceId } = await setup();
  const response = await app.inject({
    method: "POST",
    url: "/queue/check-in/walk-in",
    headers: { "x-tenant-slug": "public-queue" },
    payload: { branchId, serviceId },
  });
  assert.equal(response.statusCode, 401, response.body);
});
