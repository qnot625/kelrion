import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  INotificationProvider,
  EmailNotificationProvider,
  SMSNotificationProvider,
  NotificationChannel,
  NotificationPayload,
} from "../src/index.js";

describe("INotificationProvider Interface Compliance & Polymorphism", () => {
  test("providers satisfy contract compliance and interchangeable dispatch", async () => {
    const emailProvider: INotificationProvider = new EmailNotificationProvider({ silent: true });
    const smsProvider: INotificationProvider = new SMSNotificationProvider({ silent: true });

    const providers: INotificationProvider[] = [emailProvider, smsProvider];

    assert.equal(emailProvider.channel, NotificationChannel.EMAIL);
    assert.equal(smsProvider.channel, NotificationChannel.SMS);

    const emailPayload: NotificationPayload = {
      to: "alice@example.com",
      subject: "Welcome",
      body: "Welcome to Klerion!",
      channel: NotificationChannel.EMAIL,
    };

    const smsPayload: NotificationPayload = {
      to: "+15559876543",
      body: "Your code is 1234",
      channel: NotificationChannel.SMS,
    };

    // Dispatch by matching provider.channel
    for (const payload of [emailPayload, smsPayload]) {
      const matchingProvider = providers.find((p) => p.channel === payload.channel);
      assert.ok(matchingProvider, `Provider for channel ${payload.channel} must exist`);

      const res = await matchingProvider.send(payload);
      assert.equal(res.success, true);
      assert.ok(res.providerMessageId);
      assert.ok(res.sentAt instanceof Date);
    }
  });
});
