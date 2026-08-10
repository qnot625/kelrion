import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup(slug = "notifications-co") {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({
    name: "Notifications Co",
    slug,
    enabledModules: ["notifications", "queue"],
  });
  const app = buildServer(context);
  const ownerResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": slug },
    payload: { email: `owner@${slug}.test`, password: "owner-password" },
  });
  assert.equal(ownerResponse.statusCode, 201, ownerResponse.body);
  const owner = ownerResponse.json() as { userId: string; token: string };
  const memberResponse = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": slug },
    payload: { email: `member@${slug}.test`, password: "member-password" },
  });
  assert.equal(memberResponse.statusCode, 201, memberResponse.body);
  const member = memberResponse.json() as { userId: string; token: string };
  return { context, app, slug, owner, member };
}

function headers(slug: string, token: string) {
  return { "x-tenant-slug": slug, authorization: `Bearer ${token}` };
}

test("notification inbox, unread state and preferences are tenant-scoped", async () => {
  const { app, slug, owner, member } = await setup();

  const preferences = await app.inject({
    method: "PUT",
    url: "/notifications/preferences",
    headers: headers(slug, member.token),
    payload: { emailEnabled: true, emailAddress: `member@${slug}.test` },
  });
  assert.equal(preferences.statusCode, 200, preferences.body);

  const sent = await app.inject({
    method: "POST",
    url: "/notifications/send",
    headers: headers(slug, owner.token),
    payload: {
      recipientUserId: member.userId,
      kind: "operations.update",
      title: "Operations update",
      message: "Your request is ready.",
      usePreferences: true,
    },
  });
  assert.equal(sent.statusCode, 201, sent.body);
  const created = sent.json() as { id: string; sequence: number };
  assert.equal(created.sequence, 1);

  const inbox = await app.inject({ method: "GET", url: "/notifications", headers: headers(slug, member.token) });
  assert.equal(inbox.statusCode, 200, inbox.body);
  assert.equal((inbox.json() as Array<{ id: string }>)[0]?.id, created.id);

  const count = await app.inject({ method: "GET", url: "/notifications/unread-count", headers: headers(slug, member.token) });
  assert.equal(count.statusCode, 200, count.body);
  assert.equal((count.json() as { unread: number }).unread, 1);

  const read = await app.inject({ method: "POST", url: `/notifications/${created.id}/read`, headers: headers(slug, member.token) });
  assert.equal(read.statusCode, 200, read.body);
  const after = await app.inject({ method: "GET", url: "/notifications/unread-count", headers: headers(slug, member.token) });
  assert.equal((after.json() as { unread: number }).unread, 0);
});

test("members cannot manage templates or send arbitrary notifications", async () => {
  const { app, slug, member } = await setup("notifications-rbac");
  const template = await app.inject({
    method: "POST",
    url: "/notifications/templates",
    headers: headers(slug, member.token),
    payload: { key: "test.template", channel: "IN_APP", titleTemplate: "Hello", bodyTemplate: "World" },
  });
  assert.equal(template.statusCode, 403, template.body);

  const send = await app.inject({
    method: "POST",
    url: "/notifications/send",
    headers: headers(slug, member.token),
    payload: { recipientUserId: member.userId, kind: "test", title: "Test", message: "No" },
  });
  assert.equal(send.statusCode, 403, send.body);
});

test("Queue events fan out into Notifications only when the module is entitled", async () => {
  const { context, slug, owner, member } = await setup("queue-notify");
  const tenant = await context.tenantRepository.findBySlug(slug);
  assert.ok(tenant);
  const branchId = "00000000-0000-4000-8000-000000000301";
  const serviceId = "00000000-0000-4000-8000-000000000401";
  await context.queueService.createConfiguration({
    tenantId: tenant.id,
    actorUserId: owner.userId,
    branchId,
    serviceId,
    prefix: "N",
  });
  const entry = await context.queueService.checkInWalkIn({
    tenantId: tenant.id,
    branchId,
    serviceId,
    customer: { userId: member.userId, email: `member@${slug}.test` },
    actorUserId: member.userId,
  });
  const notifications = await context.notificationService.listForUser(tenant.id, member.userId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.entityId, entry.id);
  assert.equal(notifications[0]?.kind, "queue.checked_in");
});
