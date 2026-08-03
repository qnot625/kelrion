import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  EmailNotificationProvider,
  NotificationChannel,
} from "../src/index.js";

describe("EmailNotificationProvider Unit Tests", () => {
  test("successfully sends email via Console adapter", async () => {
    const provider = new EmailNotificationProvider({
      fromAddress: "support@klerion.app",
      silent: true,
    });

    const result = await provider.send({
      to: "customer@example.com",
      subject: "Your Ticket is Ready",
      body: "Please step forward to Counter 2.",
      channel: NotificationChannel.EMAIL,
    });

    assert.equal(result.success, true);
    assert.ok(result.providerMessageId?.startsWith("email_console_"));
    assert.ok(result.sentAt instanceof Date);

    const logs = provider.getSentLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].to, "customer@example.com");
    assert.equal(logs[0].from, "support@klerion.app");
    assert.equal(logs[0].subject, "Your Ticket is Ready");
    assert.equal(logs[0].body, "Please step forward to Counter 2.");
  });

  test("rejects invalid email recipient format", async () => {
    const provider = new EmailNotificationProvider({ silent: true });

    const result = await provider.send({
      to: "not-an-email",
      subject: "Test",
      body: "Body",
      channel: NotificationChannel.EMAIL,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /Invalid email recipient address/);
    assert.equal(provider.getSentLogs().length, 0);
  });

  test("rejects empty body payload", async () => {
    const provider = new EmailNotificationProvider({ silent: true });

    const result = await provider.send({
      to: "user@example.com",
      subject: "Subject",
      body: "   ",
      channel: NotificationChannel.EMAIL,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /payload body cannot be empty/);
  });

  test("handles channel mismatch", async () => {
    const provider = new EmailNotificationProvider({ silent: true });

    const result = await provider.send({
      to: "user@example.com",
      body: "Body",
      channel: NotificationChannel.SMS,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /cannot handle channel 'sms'/);
  });

  test("handles simulated transport failure in customTransport / SMTP", async () => {
    const provider = new EmailNotificationProvider({
      customTransport: async () => {
        throw new Error("Connection timed out to SMTP server");
      },
    });

    const result = await provider.send({
      to: "user@example.com",
      subject: "Hello",
      body: "World",
      channel: NotificationChannel.EMAIL,
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /Connection timed out to SMTP server/);
  });
});
