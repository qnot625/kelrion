import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantId, BranchId } from "@klerion/queue";
import { buildServer } from "../src/server.js";
import { SSEManager } from "../src/realtime/sse-manager.js";

test("Multi-Tenant Isolation Integration Suite", async (t) => {
  const tenantA = TenantId.generate().value;
  const tenantB = TenantId.generate().value;
  const branchIdA = BranchId.generate().value;
  const branchIdB = BranchId.generate().value;

  const sseManager = new SSEManager({ heartbeatIntervalMs: 10000 });
  const server = buildServer({ sseManager });

  await server.ready();

  t.after(async () => {
    sseManager.destroy();
    await server.close();
  });

  await t.test("Queue & Ticket API Tenant Isolation", async () => {
    // 1. Tenant A creates Queue A
    const resA = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantA,
        "x-user-id": "owner-a",
        "x-user-role": "OWNER",
      },
      payload: {
        branchId: branchIdA,
        code: "QA",
        name: "Tenant A Queue",
        prefix: "TA",
      },
    });
    assert.equal(resA.statusCode, 201);
    const queueA = JSON.parse(resA.body).queue;

    // 2. Tenant B tries to retrieve Tenant A's queue -> 404
    const resBGet = await server.inject({
      method: "GET",
      url: `/api/queues/${queueA.id}`,
      headers: {
        "x-tenant-id": tenantB,
        "x-user-id": "owner-b",
        "x-user-role": "OWNER",
      },
    });
    assert.equal(resBGet.statusCode, 404);

    // 3. Tenant A creates ticket in Queue A
    const checkInRes = await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: {
        "x-tenant-id": tenantA,
        "x-user-id": "member-a",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId: queueA.id,
        customerName: "Alice Tenant A",
      },
    });
    assert.equal(checkInRes.statusCode, 201);
    const ticketA = JSON.parse(checkInRes.body).ticket;

    // 4. Tenant B tries to call next on Tenant A's queue -> 404
    const callNextResB = await server.inject({
      method: "POST",
      url: `/api/queues/${queueA.id}/tickets/call-next`,
      headers: {
        "x-tenant-id": tenantB,
        "x-user-id": "staff-b",
        "x-user-role": "STAFF",
      },
      payload: { counterId: "Desk B" },
    });
    assert.equal(callNextResB.statusCode, 404);

    // 5. Tenant B tries to complete Tenant A's ticket -> 404
    const completeResB = await server.inject({
      method: "POST",
      url: `/api/tickets/${ticketA.id}/complete`,
      headers: {
        "x-tenant-id": tenantB,
        "x-user-id": "staff-b",
        "x-user-role": "STAFF",
      },
    });
    assert.equal(completeResB.statusCode, 404);
  });

  await t.test("Check-In APIs Cross-Tenant Guard", async () => {
    // Create Queue B under Tenant B
    const resB = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantB,
        "x-user-id": "owner-b",
        "x-user-role": "OWNER",
      },
      payload: {
        branchId: branchIdB,
        code: "QB",
        name: "Tenant B Queue",
        prefix: "TB",
      },
    });
    assert.equal(resB.statusCode, 201);
    const queueB = JSON.parse(resB.body).queue;

    // Tenant A tries remote check-in to Tenant B's queue -> 404
    const remoteResLeak = await server.inject({
      method: "POST",
      url: "/api/check-in/remote",
      headers: {
        "x-tenant-id": tenantA,
        "x-user-id": "user-a",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId: queueB.id,
        customerName: "Leak Attempt",
      },
    });
    assert.equal(remoteResLeak.statusCode, 404);

    // Tenant A tries appointment check-in to Tenant B's queue -> 404
    const apptResLeak = await server.inject({
      method: "POST",
      url: "/api/check-in/appointment",
      headers: {
        "x-tenant-id": tenantA,
        "x-user-id": "user-a",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId: queueB.id,
        appointmentId: "APPT-CROSS",
        customerName: "Cross Appt",
      },
    });
    assert.equal(apptResLeak.statusCode, 404);
  });

  await t.test("Notification Telemetry Logs Tenant Isolation", async () => {
    // 1. Tenant A sends test notification
    const sendA = await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: {
        "x-tenant-id": tenantA,
        "x-user-id": "user-a",
        "x-user-role": "STAFF",
      },
      payload: {
        recipient: "tenantA@example.com",
        channel: "email",
      },
    });
    assert.equal(sendA.statusCode, 200);
    const notifA = JSON.parse(sendA.body);

    // 2. Tenant B fetches notification logs -> must be empty or not contain Tenant A's log
    const logsB = await server.inject({
      method: "GET",
      url: "/api/notifications",
      headers: {
        "x-tenant-id": tenantB,
        "x-user-id": "user-b",
        "x-user-role": "STAFF",
      },
    });
    assert.equal(logsB.statusCode, 200);
    const logsDataB = JSON.parse(logsB.body).data;
    const foundLeak = logsDataB.some((l: any) => l.notificationId === notifA.notificationId);
    assert.equal(foundLeak, false);

    // 3. Tenant B attempts to retry Tenant A's notification -> 404
    const retryResB = await server.inject({
      method: "POST",
      url: `/api/notifications/${notifA.notificationId}/retry`,
      headers: {
        "x-tenant-id": tenantB,
        "x-user-id": "user-b",
        "x-user-role": "STAFF",
      },
    });
    assert.equal(retryResB.statusCode, 404);
  });

  await t.test("Realtime SSE Stream Broadcast Isolation", async () => {
    let receivedA = "";
    let receivedB = "";

    const clientA = {
      id: "conn-tenant-a",
      tenantId: tenantA,
      queueId: "queue-a-id",
      userId: "user-a",
      send: (data: string) => {
        receivedA += data;
      },
    };

    const clientB = {
      id: "conn-tenant-b",
      tenantId: tenantB,
      queueId: "queue-a-id", // Same queueId string, different tenant
      userId: "user-b",
      send: (data: string) => {
        receivedB += data;
      },
    };

    sseManager.addClient(clientA);
    sseManager.addClient(clientB);

    // Broadcast event for Tenant A
    sseManager.broadcast({
      eventId: "evt-tenant-a-only",
      eventType: "queue.ticket_joined.v1",
      tenantId: tenantA,
      payload: { queueId: "queue-a-id", ticketNumber: "TA001" },
    });

    assert.match(receivedA, /evt-tenant-a-only/);
    assert.doesNotMatch(receivedB, /evt-tenant-a-only/);
  });
});
