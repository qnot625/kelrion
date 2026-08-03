import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  Notification,
  TenantId,
  NotificationStatus,
  NotificationChannel,
  InvalidNotificationDataError,
  InvalidNotificationStateError,
} from "../src/index.js";

describe("Notification Entity Unit Tests", () => {
  const tenantId = TenantId.generate();

  test("creates a valid email notification entity in PENDING status", () => {
    const notification = Notification.create({
      tenantId,
      recipient: "customer@example.com",
      channel: NotificationChannel.EMAIL,
      templateId: "ticket_called_email",
      metadata: { ticketNumber: "A001" },
    });

    assert.ok(notification.id.value);
    assert.equal(notification.tenantId.value, tenantId.value);
    assert.equal(notification.recipient, "customer@example.com");
    assert.equal(notification.channel, NotificationChannel.EMAIL);
    assert.equal(notification.templateId, "ticket_called_email");
    assert.equal(notification.status, NotificationStatus.PENDING);
    assert.equal(notification.retryCount, 0);
    assert.equal(notification.lastError, null);
    assert.equal(notification.sentAt, null);
    assert.equal(notification.metadata.ticketNumber, "A001");
  });

  test("creates a valid SMS notification entity", () => {
    const notification = Notification.create({
      tenantId,
      recipient: "+15551234567",
      channel: NotificationChannel.SMS,
      templateId: "ticket_called_sms",
    });

    assert.equal(notification.channel, NotificationChannel.SMS);
    assert.equal(notification.recipient, "+15551234567");
  });

  test("rejects invalid recipient format for email", () => {
    assert.throws(
      () =>
        Notification.create({
          tenantId,
          recipient: "invalid-email-address",
          channel: NotificationChannel.EMAIL,
          templateId: "tpl_1",
        }),
      InvalidNotificationDataError
    );
  });

  test("rejects invalid recipient format for SMS", () => {
    assert.throws(
      () =>
        Notification.create({
          tenantId,
          recipient: "abc",
          channel: NotificationChannel.SMS,
          templateId: "tpl_1",
        }),
      InvalidNotificationDataError
    );
  });

  test("rejects empty recipient or templateId", () => {
    assert.throws(
      () =>
        Notification.create({
          tenantId,
          recipient: "",
          channel: NotificationChannel.EMAIL,
          templateId: "tpl_1",
        }),
      InvalidNotificationDataError
    );

    assert.throws(
      () =>
        Notification.create({
          tenantId,
          recipient: "user@example.com",
          channel: NotificationChannel.EMAIL,
          templateId: "   ",
        }),
      InvalidNotificationDataError
    );
  });

  test("valid state transitions: PENDING -> PROCESSING -> SENT", () => {
    const notification = Notification.create({
      tenantId,
      recipient: "user@example.com",
      channel: NotificationChannel.EMAIL,
      templateId: "tpl_1",
    });

    notification.markAsProcessing();
    assert.equal(notification.status, NotificationStatus.PROCESSING);

    notification.markAsSent("ref_12345");
    assert.equal(notification.status, NotificationStatus.SENT);
    assert.ok(notification.sentAt instanceof Date);
    assert.equal(notification.metadata.providerReference, "ref_12345");
  });

  test("valid state transitions: PENDING -> PROCESSING -> FAILED -> PROCESSING -> SENT", () => {
    const notification = Notification.create({
      tenantId,
      recipient: "user@example.com",
      channel: NotificationChannel.EMAIL,
      templateId: "tpl_1",
    });

    notification.markAsProcessing();
    notification.markAsFailed("Network timeout");

    assert.equal(notification.status, NotificationStatus.FAILED);
    assert.equal(notification.retryCount, 1);
    assert.equal(notification.lastError, "Network timeout");

    notification.markAsProcessing();
    assert.equal(notification.status, NotificationStatus.PROCESSING);

    notification.markAsSent();
    assert.equal(notification.status, NotificationStatus.SENT);
  });

  test("cancelling a notification", () => {
    const notification = Notification.create({
      tenantId,
      recipient: "user@example.com",
      channel: NotificationChannel.EMAIL,
      templateId: "tpl_1",
    });

    notification.cancel("Customer opted out");
    assert.equal(notification.status, NotificationStatus.CANCELLED);
    assert.equal(notification.metadata.cancelReason, "Customer opted out");
  });

  test("prevents invalid state transition from SENT to FAILED or CANCELLED", () => {
    const notification = Notification.create({
      tenantId,
      recipient: "user@example.com",
      channel: NotificationChannel.EMAIL,
      templateId: "tpl_1",
    });

    notification.markAsProcessing();
    notification.markAsSent();

    assert.throws(
      () => notification.markAsFailed("Some error"),
      InvalidNotificationStateError
    );

    assert.throws(
      () => notification.cancel("No longer needed"),
      InvalidNotificationStateError
    );

    assert.throws(
      () => notification.markAsProcessing(),
      InvalidNotificationStateError
    );
  });

  test("reconstitutes notification entity from raw database fields", () => {
    const notification = Notification.reconstitute({
      id: "33333333-3333-3333-3333-333333333333",
      tenantId: tenantId.value,
      recipient: "+15559998888",
      channel: "sms",
      templateId: "sms_template_1",
      status: "sent",
      metadata: { key: "val" },
      retryCount: 2,
      lastError: "Previous error",
      sentAt: "2026-07-31T10:00:00Z",
      createdAt: "2026-07-31T09:00:00Z",
    });

    assert.equal(notification.id.value, "33333333-3333-3333-3333-333333333333");
    assert.equal(notification.status, NotificationStatus.SENT);
    assert.equal(notification.retryCount, 2);
    assert.equal(notification.lastError, "Previous error");
    assert.equal(notification.sentAt?.toISOString(), "2026-07-31T10:00:00.000Z");
  });
});
