import assert from "node:assert/strict";
import { test } from "node:test";
import { TicketNumber } from "../src/value-objects/ticket-number.js";

test("TicketNumber construction and formatting", () => {
  const t1 = new TicketNumber("a", 1, 3);
  assert.equal(t1.prefix, "A");
  assert.equal(t1.sequence, 1);
  assert.equal(t1.padding, 3);
  assert.equal(t1.formatted, "A001");
  assert.equal(t1.toString(), "A001");
  assert.equal(t1.toJSON(), "A001");

  const t2 = TicketNumber.create("VIP", 42, 3);
  assert.equal(t2.formatted, "VIP042");

  const t3 = TicketNumber.create("B", 1234, 3);
  assert.equal(t3.formatted, "B1234");
});

test("TicketNumber parsing from string", () => {
  const parsed1 = TicketNumber.parse("A001");
  assert.equal(parsed1.prefix, "A");
  assert.equal(parsed1.sequence, 1);
  assert.equal(parsed1.formatted, "A001");

  const parsed2 = TicketNumber.parse("VIP017");
  assert.equal(parsed2.prefix, "VIP");
  assert.equal(parsed2.sequence, 17);
  assert.equal(parsed2.formatted, "VIP017");

  const parsed3 = TicketNumber.parse("c12");
  assert.equal(parsed3.prefix, "C");
  assert.equal(parsed3.sequence, 12);
  assert.equal(parsed3.formatted, "C012");
});

test("TicketNumber validation and rejection of invalid inputs", () => {
  // Invalid construction parameters
  assert.throws(() => new TicketNumber("", 1), /non-empty/);
  assert.throws(() => new TicketNumber("   ", 1), /non-empty/);
  assert.throws(() => new TicketNumber("A#", 1), /invalid characters/);
  assert.throws(() => new TicketNumber("A", 0), /positive integer/);
  assert.throws(() => new TicketNumber("A", -5), /positive integer/);
  assert.throws(() => new TicketNumber("A", 1.5), /positive integer/);
  assert.throws(() => new TicketNumber("A", 1, 0), /positive integer/);

  // Invalid parse inputs
  assert.throws(() => TicketNumber.parse(""), /empty/);
  assert.throws(() => TicketNumber.parse("   "), /empty/);
  assert.throws(() => TicketNumber.parse("NO_DIGITS"), /Invalid ticket number format/);
  assert.throws(() => TicketNumber.parse("12345"), /Invalid ticket number format/);
  assert.throws(() => TicketNumber.parse("A-001"), /Invalid ticket number format/);
});

test("TicketNumber equality and immutability", () => {
  const t1 = TicketNumber.parse("A001");
  const t2 = TicketNumber.create("A", 1, 3);
  const t3 = TicketNumber.parse("A002");

  assert.ok(t1.equals(t2));
  assert.equal(t1.equals(t3), false);
  assert.equal(t1.equals(null), false);

  assert.ok(Object.isFrozen(t1));
  assert.throws(() => {
    // @ts-expect-error testing immutability
    t1._prefix = "B";
  }, TypeError);
});
