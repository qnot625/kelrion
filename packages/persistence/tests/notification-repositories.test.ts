import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NotificationService } from "@adminops/notifications";
import {
  PostgresNotificationDeliveryRepository,
  PostgresNotificationPreferenceRepository,
  PostgresNotificationRepository,
  PostgresNotificationTemplateRepository,
  PostgresTenantRepository,
  PostgresUserRepository,
  runMigrations,
  schema,
  type Database,
} from "../src/index.js";

async function database(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  await runMigrations(db);
  return db;
}

function notificationService(db: Database) {
  return new NotificationService(
    new PostgresNotificationRepository(db),
    new PostgresNotificationPreferenceRepository(db),
    new PostgresNotificationTemplateRepository(db),
    new PostgresNotificationDeliveryRepository(db),
  );
}

test("Postgres Notifications persist sequence, preferences, templates and delivery outbox", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);
  const tenant = await tenants.create({ name: "Notify Co", slug: "notify-co" });
  const user = await users.create({ tenantId: tenant.id, email: "person@notify.test", passwordHash: "test-hash", roles: ["member"] });
  const service = notificationService(db);

  await service.updatePreferences({
    tenantId: tenant.id,
    userId: user.id,
    emailEnabled: true,
    emailAddress: "person@notify.test",
  });
  const first = await service.notify({ tenantId: tenant.id, recipientUserId: user.id, kind: "test.one", title: "One", message: "First", usePreferences: true });
  const second = await service.notify({ tenantId: tenant.id, recipientUserId: user.id, kind: "test.two", title: "Two", message: "Second" });
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(await service.unreadCount(tenant.id, user.id), 2);

  const deliveries = await service.listDeliveries(tenant.id, { notificationId: first.id });
  assert.equal(deliveries.find((row) => row.channel === "EMAIL")?.status, "PENDING");
  assert.equal(deliveries.find((row) => row.channel === "IN_APP")?.status, "SENT");

  const template = await service.createTemplate({
    tenantId: tenant.id,
    key: "service.ready",
    channel: "EMAIL",
    titleTemplate: "Ready {{ticket}}",
    bodyTemplate: "Proceed to {{station}}",
    actorUserId: user.id,
  });
  assert.equal((await service.listTemplates(tenant.id))[0]?.id, template.id);

  await service.markRead(tenant.id, user.id, first.id);
  assert.equal(await service.unreadCount(tenant.id, user.id), 1);
  assert.deepEqual((await service.listForUser(tenant.id, user.id, { afterSequence: 1 })).map((item) => item.id), [second.id]);
  await runMigrations(db);
  assert.equal(await service.unreadCount(tenant.id, user.id), 1);
});

test("Postgres notification sequences are tenant isolated", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const users = new PostgresUserRepository(db);
  const alpha = await tenants.create({ name: "Notify Alpha", slug: "notify-alpha" });
  const beta = await tenants.create({ name: "Notify Beta", slug: "notify-beta" });
  const alphaUser = await users.create({ tenantId: alpha.id, email: "alpha@notify.test", passwordHash: "hash", roles: ["member"] });
  const betaUser = await users.create({ tenantId: beta.id, email: "beta@notify.test", passwordHash: "hash", roles: ["member"] });
  const service = notificationService(db);
  const a = await service.notify({ tenantId: alpha.id, recipientUserId: alphaUser.id, kind: "test", title: "A", message: "Alpha" });
  const b = await service.notify({ tenantId: beta.id, recipientUserId: betaUser.id, kind: "test", title: "B", message: "Beta" });
  assert.equal(a.sequence, 1);
  assert.equal(b.sequence, 1);
  assert.equal((await service.listForUser(alpha.id, alphaUser.id)).length, 1);
  assert.equal((await service.listForUser(alpha.id, betaUser.id)).length, 0);
});
