import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantId, BranchId, QueuePriority } from "@klerion/queue";
import { buildServer } from "../src/server.js";

test("Ticket API Routes Integration", async (t) => {
  await t.test("POST /api/queues/:queueId/tickets/call-next calls next waiting ticket", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;
    const branchId = BranchId.generate().value;

    // 1. Create Queue
    const createQueueRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_owner",
        "x-user-role": "OWNER",
      },
      payload: {
        branchId,
        code: "Q1",
        name: "General Services",
        prefix: "A",
      },
    });
    assert.equal(createQueueRes.statusCode, 201);
    const queue = JSON.parse(createQueueRes.body).queue;

    // 2. Join Queue
    const joinRes = await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_customer",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId: queue.id,
        customerName: "Alice Smith",
      },
    });
    assert.equal(joinRes.statusCode, 201);
    const ticket = JSON.parse(joinRes.body).ticket;
    assert.equal(ticket.status, "waiting");

    // 3. Call Next Ticket
    const callNextRes = await server.inject({
      method: "POST",
      url: `/api/queues/${queue.id}/tickets/call-next`,
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_staff",
        "x-user-role": "STAFF",
      },
      payload: {
        counterId: "Counter 1",
      },
    });
    assert.equal(callNextRes.statusCode, 200);
    const calledTicket = JSON.parse(callNextRes.body).ticket;
    assert.equal(calledTicket.id, ticket.id);
    assert.equal(calledTicket.status, "called");
    assert.equal(calledTicket.counterId, "Counter 1");
  });

  await t.test("POST /api/tickets/:ticketId/recall recalls called ticket", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;
    const branchId = BranchId.generate().value;

    const createQueueRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: { "x-tenant-id": tenantId, "x-user-role": "OWNER" },
      payload: { branchId, code: "Q2", name: "Billing", prefix: "B" },
    });
    const queue = JSON.parse(createQueueRes.body).queue;

    const joinRes = await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: { "x-tenant-id": tenantId },
      payload: { queueId: queue.id, customerName: "Bob" },
    });
    const ticket = JSON.parse(joinRes.body).ticket;

    await server.inject({
      method: "POST",
      url: `/api/queues/${queue.id}/tickets/call-next`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
      payload: { counterId: "Counter 2" },
    });

    const recallRes = await server.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/recall`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
    });
    assert.equal(recallRes.statusCode, 200);
    const recalledTicket = JSON.parse(recallRes.body).ticket;
    assert.equal(recalledTicket.status, "called");
  });

  await t.test("POST /api/tickets/:ticketId/skip skips called ticket", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;
    const branchId = BranchId.generate().value;

    const createQueueRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: { "x-tenant-id": tenantId, "x-user-role": "OWNER" },
      payload: { branchId, code: "Q3", name: "Tech Support", prefix: "C" },
    });
    const queue = JSON.parse(createQueueRes.body).queue;

    const joinRes = await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: { "x-tenant-id": tenantId },
      payload: { queueId: queue.id },
    });
    const ticket = JSON.parse(joinRes.body).ticket;

    await server.inject({
      method: "POST",
      url: `/api/queues/${queue.id}/tickets/call-next`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
    });

    const skipRes = await server.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/skip`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
    });
    assert.equal(skipRes.statusCode, 200);
    assert.equal(JSON.parse(skipRes.body).ticket.status, "no_show");
  });

  await t.test("POST /api/tickets/:ticketId/complete completes called ticket", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;
    const branchId = BranchId.generate().value;

    const createQueueRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: { "x-tenant-id": tenantId, "x-user-role": "OWNER" },
      payload: { branchId, code: "Q4", name: "Inquiries", prefix: "D" },
    });
    const queue = JSON.parse(createQueueRes.body).queue;

    const joinRes = await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: { "x-tenant-id": tenantId },
      payload: { queueId: queue.id },
    });
    const ticket = JSON.parse(joinRes.body).ticket;

    await server.inject({
      method: "POST",
      url: `/api/queues/${queue.id}/tickets/call-next`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
    });

    const completeRes = await server.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/complete`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
    });
    assert.equal(completeRes.statusCode, 200);
    assert.equal(JSON.parse(completeRes.body).ticket.status, "completed");
  });

  await t.test("POST /api/tickets/:ticketId/transfer transfers ticket to target queue", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;
    const branchId = BranchId.generate().value;

    // Create Queue A and Queue B
    const qA = JSON.parse(
      (
        await server.inject({
          method: "POST",
          url: "/api/queues",
          headers: { "x-tenant-id": tenantId, "x-user-role": "OWNER" },
          payload: { branchId, code: "QA", name: "Queue A", prefix: "A" },
        })
      ).body
    ).queue;

    const qB = JSON.parse(
      (
        await server.inject({
          method: "POST",
          url: "/api/queues",
          headers: { "x-tenant-id": tenantId, "x-user-role": "OWNER" },
          payload: { branchId, code: "QB", name: "Queue B", prefix: "B" },
        })
      ).body
    ).queue;

    const ticket = JSON.parse(
      (
        await server.inject({
          method: "POST",
          url: "/api/check-in/walk-in",
          headers: { "x-tenant-id": tenantId },
          payload: { queueId: qA.id },
        })
      ).body
    ).ticket;

    await server.inject({
      method: "POST",
      url: `/api/queues/${qA.id}/tickets/call-next`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
    });

    const transferRes = await server.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transfer`,
      headers: { "x-tenant-id": tenantId, "x-user-role": "STAFF" },
      payload: { targetQueueId: qB.id },
    });
    assert.equal(transferRes.statusCode, 200);
    const transferred = JSON.parse(transferRes.body).ticket;
    assert.equal(transferred.queueId, qB.id);
    assert.equal(transferred.status, "transferred");
  });

  await t.test("Rejects staff actions from MEMBER role (RBAC Enforcement)", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;

    const res = await server.inject({
      method: "POST",
      url: "/api/queues/non-existent/tickets/call-next",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-role": "MEMBER",
      },
    });
    assert.equal(res.statusCode, 401);
  });
});
