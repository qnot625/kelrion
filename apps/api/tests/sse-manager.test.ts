import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SSEManager, SSEClient, BroadcastEvent } from "../src/realtime/sse-manager.js";

describe("SSEManager Unit Tests", () => {
  test("connection registration and removal", () => {
    const sseManager = new SSEManager({ heartbeatIntervalMs: 10000 });
    const received: string[] = [];

    const client: SSEClient = {
      id: "conn-1",
      tenantId: "tenant-1",
      queueId: "queue-1",
      userId: "user-1",
      send: (msg) => received.push(msg),
    };

    sseManager.addClient(client);
    assert.equal(sseManager.getClientCount(), 1);
    assert.equal(sseManager.getClientCount("tenant-1", "queue-1"), 1);
    assert.equal(sseManager.isHeartbeatActive(), true);

    sseManager.removeClient("conn-1");
    assert.equal(sseManager.getClientCount(), 0);
    assert.equal(sseManager.getClientCount("tenant-1", "queue-1"), 0);
    assert.equal(sseManager.isHeartbeatActive(), false); // Heartbeat stops when 0 clients remain

    sseManager.destroy();
  });

  test("tenant isolation and queue isolation on broadcast delivery", () => {
    const sseManager = new SSEManager();

    const tenant1Queue1Messages: string[] = [];
    const tenant1Queue2Messages: string[] = [];
    const tenant2Queue1Messages: string[] = [];

    const clientT1Q1: SSEClient = {
      id: "c1",
      tenantId: "tenant-1",
      queueId: "queue-1",
      userId: "u1",
      send: (msg) => tenant1Queue1Messages.push(msg),
    };

    const clientT1Q2: SSEClient = {
      id: "c2",
      tenantId: "tenant-1",
      queueId: "queue-2",
      userId: "u2",
      send: (msg) => tenant1Queue2Messages.push(msg),
    };

    const clientT2Q1: SSEClient = {
      id: "c3",
      tenantId: "tenant-2",
      queueId: "queue-1",
      userId: "u3",
      send: (msg) => tenant2Queue1Messages.push(msg),
    };

    sseManager.addClient(clientT1Q1);
    sseManager.addClient(clientT1Q2);
    sseManager.addClient(clientT2Q1);

    const eventT1Q1: BroadcastEvent = {
      eventId: "evt-1",
      eventType: "queue.ticket_joined.v1",
      tenantId: "tenant-1",
      payload: { queueId: "queue-1", ticketNumber: "A001" },
    };

    sseManager.broadcast(eventT1Q1);

    assert.equal(tenant1Queue1Messages.length, 1);
    assert.match(tenant1Queue1Messages[0], /queue.ticket_joined.v1/);
    assert.equal(tenant1Queue2Messages.length, 0, "Queue 2 client must not receive Queue 1 events");
    assert.equal(tenant2Queue1Messages.length, 0, "Tenant 2 client must not receive Tenant 1 events");

    sseManager.destroy();
  });

  test("multiple connections under same tenant and queue receive broadcast", () => {
    const sseManager = new SSEManager();
    const c1Msgs: string[] = [];
    const c2Msgs: string[] = [];

    sseManager.addClient({
      id: "c1",
      tenantId: "t1",
      queueId: "q1",
      userId: "u1",
      send: (msg) => c1Msgs.push(msg),
    });

    sseManager.addClient({
      id: "c2",
      tenantId: "t1",
      queueId: "q1",
      userId: "u2",
      send: (msg) => c2Msgs.push(msg),
    });

    sseManager.broadcast({
      eventId: "evt-100",
      eventType: "queue.ticket_called.v1",
      tenantId: "t1",
      payload: { queueId: "q1", ticketNumber: "A001" },
    });

    assert.equal(c1Msgs.length, 1);
    assert.equal(c2Msgs.length, 1);

    sseManager.destroy();
  });

  test("replay buffer behavior, replay ordering, and missing/invalid Last-Event-ID", () => {
    const sseManager = new SSEManager({ maxReplaySize: 5 });

    // Populate broadcast history
    for (let i = 1; i <= 3; i++) {
      sseManager.broadcast({
        eventId: `evt-${i}`,
        eventType: "queue.ticket_joined.v1",
        tenantId: "t1",
        payload: { queueId: "q1", seq: i },
      });
    }

    // Connect new client with valid Last-Event-ID = evt-1
    const replayedMsgs: string[] = [];
    sseManager.addClient(
      {
        id: "c-replay",
        tenantId: "t1",
        queueId: "q1",
        userId: "u1",
        send: (msg) => replayedMsgs.push(msg),
      },
      "evt-1"
    );

    // Should replay evt-2 and evt-3 in order
    assert.equal(replayedMsgs.length, 2);
    assert.match(replayedMsgs[0], /evt-2/);
    assert.match(replayedMsgs[1], /evt-3/);

    // Connect client with invalid/missing Last-Event-ID
    const invalidMsgs: string[] = [];
    sseManager.addClient(
      {
        id: "c-invalid",
        tenantId: "t1",
        queueId: "q1",
        userId: "u2",
        send: (msg) => invalidMsgs.push(msg),
      },
      "non-existent-evt-id"
    );

    assert.equal(invalidMsgs.length, 0, "Invalid Last-Event-ID should replay nothing");

    sseManager.destroy();
  });

  test("replay buffer overflow handling (oldest evicted when exceeding maxReplaySize)", () => {
    const sseManager = new SSEManager({ maxReplaySize: 3 });

    for (let i = 1; i <= 5; i++) {
      sseManager.broadcast({
        eventId: `evt-${i}`,
        eventType: "queue.ticket_joined.v1",
        tenantId: "t1",
        payload: { queueId: "q1", seq: i },
      });
    }

    // Since maxReplaySize = 3, only evt-3, evt-4, evt-5 remain in buffer
    // Replay with lastEventId = evt-1 (which was evicted)
    const evictedMsgs: string[] = [];
    sseManager.addClient(
      {
        id: "c-evicted",
        tenantId: "t1",
        queueId: "q1",
        userId: "u1",
        send: (msg) => evictedMsgs.push(msg),
      },
      "evt-1"
    );

    assert.equal(evictedMsgs.length, 0, "Evicted Last-Event-ID should return no replayed events");

    // Replay with lastEventId = evt-3
    const validMsgs: string[] = [];
    sseManager.addClient(
      {
        id: "c-valid",
        tenantId: "t1",
        queueId: "q1",
        userId: "u1",
        send: (msg) => validMsgs.push(msg),
      },
      "evt-3"
    );

    assert.equal(validMsgs.length, 2);
    assert.match(validMsgs[0], /evt-4/);
    assert.match(validMsgs[1], /evt-5/);

    sseManager.destroy();
  });

  test("heartbeat interval sending and timer leak prevention", async () => {
    const sseManager = new SSEManager({ heartbeatIntervalMs: 50 });
    const heartbeats: string[] = [];

    sseManager.addClient({
      id: "c-hb",
      tenantId: "t1",
      queueId: "q1",
      userId: "u1",
      send: (msg) => heartbeats.push(msg),
    });

    assert.equal(sseManager.isHeartbeatActive(), true);

    await new Promise((r) => setTimeout(r, 120));

    assert.ok(heartbeats.length >= 2, "Heartbeat should fire periodically");
    assert.match(heartbeats[0], /event: heartbeat/);

    // Remove client -> heartbeat stops, timer cleared
    sseManager.removeClient("c-hb");
    assert.equal(sseManager.isHeartbeatActive(), false);

    sseManager.destroy();
  });
});
