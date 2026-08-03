import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NotificationStatus, isNotificationStatus } from "../src/index.js";

describe("NotificationStatus Enum Unit Tests", () => {
  test("contains all required lifecycle statuses", () => {
    assert.equal(NotificationStatus.PENDING, "pending");
    assert.equal(NotificationStatus.PROCESSING, "processing");
    assert.equal(NotificationStatus.SENT, "sent");
    assert.equal(NotificationStatus.FAILED, "failed");
    assert.equal(NotificationStatus.CANCELLED, "cancelled");
  });

  test("type guard validates status strings", () => {
    assert.equal(isNotificationStatus("pending"), true);
    assert.equal(isNotificationStatus("processing"), true);
    assert.equal(isNotificationStatus("sent"), true);
    assert.equal(isNotificationStatus("failed"), true);
    assert.equal(isNotificationStatus("cancelled"), true);

    assert.equal(isNotificationStatus("invalid_status"), false);
    assert.equal(isNotificationStatus(123), false);
    assert.equal(isNotificationStatus(null), false);
    assert.equal(isNotificationStatus(undefined), false);
  });

  test("serializes cleanly to JSON string", () => {
    const payload = { status: NotificationStatus.SENT };
    const jsonStr = JSON.stringify(payload);
    assert.equal(jsonStr, '{"status":"sent"}');
    assert.equal(JSON.parse(jsonStr).status, NotificationStatus.SENT);
  });
});
