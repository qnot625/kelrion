import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SMSNotificationProvider,
  NotificationChannel,
} from "../src/index.js";

describe("SMSNotificationProvider Unit Tests", () => {
  test("successfully sends SMS via Console adapter", async () => {
    const provider = new SMSNotificationProvider({
      senderId: "KLERION_ALERT",
      silent: true,
    });

    const result = await provider.send({
      to: "+15551234567",
      body: "Your ticket A001 is now being served at Counter 1.",
      channel: NotificationChannel.SMS,
    });

    assert.equal(result.success, true);
    assert.ok(result.providerMessageId?.startsWith("sms_console_"));
    assert.ok(result.sentAt instanceof Date);

    const logs = provider.getSentLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].to, "+15551234567");
    assert.equal(logs[0].senderId, "KLERION_ALERT");
    assert.equal(logs[0].body, "Your ticket A001 is now being served at Counter 1.");
  });

  test("rejects invalid recipient phone number", async () => {
    const provider = new SMSNotificationProvider({ silent: true });

    const result = await provider.send({
      to: "123", // too short
      body: "Test message",
      channel: NotificationChannel.SMS,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /Invalid SMS recipient phone number format/);
    assert.equal(provider.getSentLogs().length, 0);
  });

  test("rejects empty body payload", async () => {
    const provider = new SMSNotificationProvider({ silent: true });

    const result = await provider.send({
      to: "+15551234567",
      body: "",
      channel: NotificationChannel.SMS,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /payload body cannot be empty/);
  });

  test("handles channel mismatch", async () => {
    const provider = new SMSNotificationProvider({ silent: true });

    const result = await provider.send({
      to: "+15551234567",
      body: "Body",
      channel: NotificationChannel.EMAIL,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /cannot handle channel 'email'/);
  });

  test("handles webhook mode and custom transport failures", async () => {
    const provider = new SMSNotificationProvider({
      customTransport: async () => {
        return {
          success: false,
          error: "HTTP 503 Service Unavailable from SMS gateway",
        };
      },
    });

    const result = await provider.send({
      to: "+15551234567",
      body: "Hello",
      channel: NotificationChannel.SMS,
    });

    assert.equal(result.success, false);
    assert.equal(result.error, "HTTP 503 Service Unavailable from SMS gateway");
  });
});
