import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryNotificationDeliveryRepository,
  InMemoryNotificationPreferenceRepository,
  InMemoryNotificationRepository,
  InMemoryNotificationTemplateRepository,
  NotificationService,
  renderNotificationTemplate,
  type NotificationProvider,
} from "../src/index.js";

function service() {
  return new NotificationService(
    new InMemoryNotificationRepository(),
    new InMemoryNotificationPreferenceRepository(),
    new InMemoryNotificationTemplateRepository(),
    new InMemoryNotificationDeliveryRepository(),
  );
}

test("notifications use monotonic per-tenant sequences and read state", async () => {
  const notifications = service();
  const first = await notifications.notify({
    tenantId: "tenant-a",
    recipientUserId: "user-1",
    kind: "test.first",
    title: "First",
    message: "First message",
  });
  const second = await notifications.notify({
    tenantId: "tenant-a",
    recipientUserId: "user-1",
    kind: "test.second",
    title: "Second",
    message: "Second message",
  });
  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.equal(await notifications.unreadCount("tenant-a", "user-1"), 2);
  await notifications.markRead("tenant-a", "user-1", first.id);
  assert.equal(await notifications.unreadCount("tenant-a", "user-1"), 1);
  assert.deepEqual((await notifications.listForUser("tenant-a", "user-1", { afterSequence: 1 })).map((item) => item.id), [second.id]);
});

test("channel preferences create pending external deliveries without pretending delivery succeeded", async () => {
  const notificationsRepo = new InMemoryNotificationRepository();
  const preferences = new InMemoryNotificationPreferenceRepository();
  const templates = new InMemoryNotificationTemplateRepository();
  const deliveries = new InMemoryNotificationDeliveryRepository();
  const notifications = new NotificationService(notificationsRepo, preferences, templates, deliveries);
  await notifications.updatePreferences({
    tenantId: "tenant-a",
    userId: "user-1",
    emailEnabled: true,
    emailAddress: "person@example.com",
  });
  const created = await notifications.notify({
    tenantId: "tenant-a",
    recipientUserId: "user-1",
    kind: "queue.called",
    title: "Called",
    message: "Please proceed",
    usePreferences: true,
  });
  const rows = await deliveries.list("tenant-a", { notificationId: created.id });
  assert.equal(rows.find((row) => row.channel === "IN_APP")?.status, "SENT");
  assert.equal(rows.find((row) => row.channel === "EMAIL")?.status, "PENDING");

  const provider: NotificationProvider = {
    channel: "EMAIL",
    async send({ delivery }) {
      assert.equal(delivery.destination, "person@example.com");
      return { providerReference: "mail-123" };
    },
  };
  const processed = await notifications.processPending("tenant-a", { EMAIL: provider });
  assert.equal(processed[0]?.status, "SENT");
  assert.equal(processed[0]?.providerReference, "mail-123");
});

test("templates render variables and can drive channel-specific delivery", async () => {
  const notificationsRepo = new InMemoryNotificationRepository();
  const preferences = new InMemoryNotificationPreferenceRepository();
  const templates = new InMemoryNotificationTemplateRepository();
  const deliveries = new InMemoryNotificationDeliveryRepository();
  const notifications = new NotificationService(notificationsRepo, preferences, templates, deliveries);
  const template = await notifications.createTemplate({
    tenantId: "tenant-a",
    key: "queue.called",
    channel: "SMS",
    titleTemplate: "Ticket {{ticket}}",
    bodyTemplate: "Proceed to {{station}}",
    actorUserId: "owner-1",
  });
  assert.equal(template.key, "queue.called");
  assert.equal(renderNotificationTemplate("Hello {{name}}", { name: "Ada" }), "Hello Ada");
  const created = await notifications.sendTemplate({
    tenantId: "tenant-a",
    key: "queue.called",
    channel: "SMS",
    destination: "+2348000000000",
    values: { ticket: "A104", station: "Desk 3" },
  });
  assert.equal(created.title, "Ticket A104");
  assert.equal(created.message, "Proceed to Desk 3");
  const rows = await deliveries.list("tenant-a", { notificationId: created.id });
  assert.equal(rows[0]?.channel, "SMS");
  assert.equal(rows[0]?.status, "PENDING");
});

test("queue events generate user notifications", async () => {
  const notifications = service();
  const created = await notifications.notifyQueueEvent({
    tenantId: "tenant-a",
    eventType: "CALLED",
    entry: {
      id: "entry-1",
      publicToken: "public-1",
      ticketNumber: "Q007",
      branchId: "branch-1",
      serviceId: "service-1",
      customer: { userId: "user-1" },
    },
    data: { stationId: "Counter 4" },
  });
  assert.equal(created?.recipientUserId, "user-1");
  assert.match(created?.message ?? "", /Counter 4/);
});
