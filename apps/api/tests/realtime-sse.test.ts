import assert from "node:assert/strict";
import { test } from "node:test";
import type { FastifyRequest } from "fastify";
import { encodeSseEvent, parseSseCursor } from "../src/realtime/sse.js";

test("SSE encoder emits reconnect id, event name and JSON data", () => {
  const encoded = encodeSseEvent({ id: 42, event: "queue", data: { type: "CALLED", ticket: "Q042" } });
  assert.match(encoded, /^id: 42\nevent: queue\ndata: /);
  assert.match(encoded, /"type":"CALLED"/);
  assert.ok(encoded.endsWith("\n\n"));
});

test("SSE cursor accepts query cursor first and falls back to Last-Event-ID", () => {
  const request = { headers: { "last-event-id": "17" } } as unknown as FastifyRequest;
  assert.equal(parseSseCursor(request), 17);
  assert.equal(parseSseCursor(request, "29"), 29);
  assert.equal(parseSseCursor(request, "invalid"), 0);
  assert.equal(parseSseCursor({ headers: {} } as unknown as FastifyRequest), 0);
});
