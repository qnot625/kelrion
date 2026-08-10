import type { FastifyReply, FastifyRequest } from "fastify";

export interface SequencedEvent {
  readonly sequence: number;
}

export function parseSseCursor(request: FastifyRequest, queryValue?: string): number {
  const raw = queryValue ?? (typeof request.headers["last-event-id"] === "string" ? request.headers["last-event-id"] : undefined);
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function encodeSseEvent(event: { id?: string | number; event?: string; data: unknown }): string {
  const lines: string[] = [];
  if (event.id !== undefined) lines.push(`id: ${event.id}`);
  if (event.event) lines.push(`event: ${event.event}`);
  const payload = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
  for (const line of payload.split(/\r?\n/)) lines.push(`data: ${line}`);
  return `${lines.join("\n")}\n\n`;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function startSsePolling<T extends SequencedEvent>(input: {
  request: FastifyRequest;
  reply: FastifyReply;
  cursor: number;
  eventName: string;
  load: (afterSequence: number) => Promise<readonly T[]>;
  serialize?: (event: T) => unknown;
  pollMilliseconds?: number;
  heartbeatMilliseconds?: number;
}): void {
  const { request, reply } = input;
  reply.hijack();
  const response = reply.raw;
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.write(": connected\n\n");

  let closed = false;
  let cursor = input.cursor;
  let lastWriteAt = Date.now();
  const close = () => { closed = true; };
  request.raw.on("close", close);
  request.raw.on("aborted", close);

  const pollMilliseconds = Math.max(input.pollMilliseconds ?? 750, 250);
  const heartbeatMilliseconds = Math.max(input.heartbeatMilliseconds ?? 15_000, 5_000);

  void (async () => {
    try {
      while (!closed && !response.destroyed) {
        const events = await input.load(cursor);
        for (const event of events) {
          if (event.sequence <= cursor) continue;
          cursor = event.sequence;
          response.write(encodeSseEvent({
            id: event.sequence,
            event: input.eventName,
            data: input.serialize ? input.serialize(event) : event,
          }));
          lastWriteAt = Date.now();
        }
        if (Date.now() - lastWriteAt >= heartbeatMilliseconds) {
          response.write(`: heartbeat ${Date.now()}\n\n`);
          lastWriteAt = Date.now();
        }
        await delay(pollMilliseconds);
      }
    } catch {
      if (!closed && !response.destroyed) {
        response.write(encodeSseEvent({ event: "error", data: { message: "Realtime stream interrupted" } }));
        response.end();
      }
    }
  })();
}
