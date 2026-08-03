import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  NotificationTemplateEngine,
  NotificationChannel,
  InvalidTemplateError,
  MissingTemplateVariableError,
  TemplateNotFoundError,
} from "../src/index.js";

describe("NotificationTemplateEngine Unit Tests", () => {
  test("renders template with variable interpolation and multiple variables", () => {
    const engine = new NotificationTemplateEngine();
    engine.registerTemplate({
      id: "ticket_called_email",
      channel: NotificationChannel.EMAIL,
      subject: "Ticket {{ ticketNumber }} is ready!",
      body: "Hello {{ customerName }}, please proceed to counter {{ counterNumber }}.",
    });

    const result = engine.renderTemplate("ticket_called_email", {
      ticketNumber: "A014",
      customerName: "Alice Smith",
      counterNumber: "3",
    });

    assert.equal(result.subject, "Ticket A014 is ready!");
    assert.equal(
      result.body,
      "Hello Alice Smith, please proceed to counter 3."
    );
  });

  test("handles repeated variables in the same template", () => {
    const engine = new NotificationTemplateEngine();
    const result = engine.renderInline(
      "Ticket {{ ticketNumber }} for {{ name }}. Reminder: Ticket {{ ticketNumber }}!",
      { ticketNumber: "E002", name: "Bob" }
    );

    assert.equal(
      result,
      "Ticket E002 for Bob. Reminder: Ticket E002!"
    );
  });

  test("handles nested property path interpolation", () => {
    const engine = new NotificationTemplateEngine();
    const result = engine.renderInline(
      "Hello {{ user.name }}, your ticket code is {{ queue.prefix }}{{ ticket.number }}.",
      {
        user: { name: "Carol" },
        queue: { prefix: "VIP" },
        ticket: { number: 7 },
      }
    );

    assert.equal(result, "Hello Carol, your ticket code is VIP7.");
  });

  test("throws MissingTemplateVariableError when required variable is omitted or null", () => {
    const engine = new NotificationTemplateEngine();
    engine.registerTemplate({
      id: "sms_alert",
      channel: NotificationChannel.SMS,
      body: "Hi {{ customerName }}, your estimated wait is {{ waitTime }} mins.",
    });

    assert.throws(
      () =>
        engine.renderTemplate("sms_alert", {
          customerName: "David",
          // waitTime is missing
        }),
      (err: unknown) => {
        assert.ok(err instanceof MissingTemplateVariableError);
        assert.deepEqual(err.missingVariables, ["waitTime"]);
        return true;
      }
    );
  });

  test("throws TemplateNotFoundError for unknown/unregistered template ID", () => {
    const engine = new NotificationTemplateEngine();
    assert.throws(
      () => engine.renderTemplate("non_existent_template", {}),
      TemplateNotFoundError
    );
  });

  test("rejects registering empty template ID or empty body", () => {
    const engine = new NotificationTemplateEngine();
    assert.throws(
      () =>
        engine.registerTemplate({
          id: "",
          channel: NotificationChannel.EMAIL,
          body: "Hello {{ name }}",
        }),
      InvalidTemplateError
    );

    assert.throws(
      () =>
        engine.registerTemplate({
          id: "valid_id",
          channel: NotificationChannel.EMAIL,
          body: "",
        }),
      InvalidTemplateError
    );
  });

  test("rejects malformed templates with unclosed placeholders or empty placeholders", () => {
    const engine = new NotificationTemplateEngine();

    // Unclosed placeholder
    assert.throws(
      () => engine.renderInline("Hello {{ name, welcome!", { name: "Alice" }),
      InvalidTemplateError
    );

    // Empty placeholder
    assert.throws(
      () => engine.renderInline("Hello {{}}, welcome!", {}),
      InvalidTemplateError
    );

    // Invalid placeholder character
    assert.throws(
      () => engine.renderInline("Hello {{ 123-bad! }}", {}),
      InvalidTemplateError
    );
  });

  test("handles empty templates without placeholders gracefully", () => {
    const engine = new NotificationTemplateEngine();
    const result = engine.renderInline("Static text without variables.", {});
    assert.equal(result, "Static text without variables.");
  });
});
