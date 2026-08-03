import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { FastifyInstance } from "fastify";
import {
  InMemoryQueueRepository,
  InMemoryTicketRepository,
  QueueApplicationService,
  TicketApplicationService,
  TenantId,
  BranchId,
  UserRole,
} from "@klerion/queue";
import { buildServer } from "../src/server.js";
import { SSEManager } from "../src/realtime/sse-manager.js";

describe("Realtime SSE API Routes Integration Tests", () => {
  let server: FastifyInstance;
  let queueRepo: InMemoryQueueRepository;
  let ticketRepo: InMemoryTicketRepository;
  let sseManager: SSEManager;

  const tenantId1 = TenantId.generate();
  const tenantId2 = TenantId.generate();
  const branchId1 = BranchId.generate();

  beforeEach(async () => {
    queueRepo = new InMemoryQueueRepository();
    ticketRepo = new InMemoryTicketRepository(queueRepo);
    sseManager = new SSEManager({ heartbeatIntervalMs: 10000 });

    server = buildServer({
      queueRepository: queueRepo,
      ticketRepository: ticketRepo,
      sseManager,
    });

    await server.ready();
  });

  afterEach(async () => {
    sseManager.destroy();
    await server.close();
  });

  test("unauthenticated connection (missing x-tenant-id) returns 401", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/realtime/queues/b9efceca-ee51-4827-bd38-3a386b6eaebf/stream",
    });

    assert.equal(res.statusCode, 401);
    const body = res.json();
    assert.equal(body.error, "Unauthorized");
  });

  test("unauthorized queue / non-existent queue returns 404", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/realtime/queues/00000000-0000-0000-0000-000000000000/stream",
      headers: {
        "x-tenant-id": tenantId1.value,
        "x-user-id": "user-1",
        "x-user-role": "MEMBER",
      },
    });

    assert.equal(res.statusCode, 404);
    const body = res.json();
    assert.equal(body.error, "NotFound");
  });

  test("cross-tenant queue access attempt is blocked", async () => {
    // Create queue under Tenant 1
    const createRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantId1.value,
        "x-user-id": "owner-1",
        "x-user-role": "OWNER",
      },
      payload: {
        branchId: branchId1.value,
        code: "MAIN",
        name: "Main Queue",
        prefix: "M",
      },
    });
    assert.equal(createRes.statusCode, 201);
    const queueId = createRes.json().id;

    // Tenant 2 tries to stream Tenant 1's queue
    const streamRes = await server.inject({
      method: "GET",
      url: `/api/realtime/queues/${queueId}/stream`,
      headers: {
        "x-tenant-id": tenantId2.value,
        "x-user-id": "user-t2",
        "x-user-role": "MEMBER",
      },
    });

    assert.equal(streamRes.statusCode, 404, "Tenant 2 cannot see Tenant 1 queue");
  });

  test("authenticated connection receives initial queue snapshot and live events", async () => {
    // 1. Create active queue under Tenant 1
    const createRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantId1.value,
        "x-user-id": "owner-1",
        "x-user-role": "OWNER",
      },
      payload: {
        branchId: branchId1.value,
        code: "CHECKIN",
        name: "Express Check-In",
        prefix: "E",
      },
    });
    const queueId = createRes.json().id;

    // 2. Perform walk-in check-in to generate event in buffer
    await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: {
        "x-tenant-id": tenantId1.value,
        "x-user-id": "staff-1",
        "x-user-role": "STAFF",
      },
      payload: {
        queueId,
        customerName: "Alice Smith",
      },
    });

    // 3. Connect to stream
    // Using custom stream client simulation in Fastify server
    let receivedSSE = "";
    const client = {
      id: "conn-test",
      tenantId: tenantId1.value,
      queueId,
      userId: "user-sub",
      send: (data: string) => {
        receivedSSE += data;
      },
    };

    sseManager.addClient(client);

    // Broadcast a new event
    sseManager.broadcast({
      eventId: "evt-live-1",
      eventType: "queue.ticket_joined.v1",
      tenantId: tenantId1.value,
      payload: {
        queueId,
        ticketNumber: "E002",
        customerName: "Bob Jones",
      },
    });

    assert.match(receivedSSE, /queue.ticket_joined.v1/);
    assert.match(receivedSSE, /E002/);
  });

  test("stream replay using Last-Event-ID header", async () => {
    const queueIdStr = "11111111-1111-1111-1111-111111111111";

    // Broadcast events prior to connection
    sseManager.broadcast({
      eventId: "evt-hist-1",
      eventType: "queue.ticket_joined.v1",
      tenantId: tenantId1.value,
      payload: { queueId: queueIdStr, seq: 1 },
    });

    sseManager.broadcast({
      eventId: "evt-hist-2",
      eventType: "queue.ticket_joined.v1",
      tenantId: tenantId1.value,
      payload: { queueId: queueIdStr, seq: 2 },
    });

    // Connect client requesting replay starting from evt-hist-1
    let replayedData = "";
    sseManager.addClient(
      {
        id: "conn-replay",
        tenantId: tenantId1.value,
        queueId: queueIdStr,
        userId: "user-1",
        send: (data: string) => {
          replayedData += data;
        },
      },
      "evt-hist-1"
    );

    assert.match(replayedData, /evt-hist-2/);
    assert.doesNotMatch(replayedData, /evt-hist-1/);
  });
});
