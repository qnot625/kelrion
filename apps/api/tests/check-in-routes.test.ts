import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantId, BranchId, QueuePriority, TicketStatus } from "@klerion/queue";
import { buildServer } from "../src/server.js";

test("Check-in routes: remote, walk-in, and appointment check-in endpoints", async () => {
  const server = buildServer();
  const tenantId = TenantId.generate().value;
  const branchId = BranchId.generate().value;

  // 1. Setup queue
  const queueRes = await server.inject({
    method: "POST",
    url: "/api/queues",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "owner-1",
      "x-user-role": "OWNER",
    },
    payload: {
      branchId,
      code: "CLINIC",
      name: "General Clinic",
      prefix: "GC",
    },
  });

  assert.equal(queueRes.statusCode, 201);
  const queueId = JSON.parse(queueRes.body).queue.id;

  // 2. Remote check-in
  const remoteRes = await server.inject({
    method: "POST",
    url: "/api/check-in/remote",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "member-1",
      "x-user-role": "MEMBER",
    },
    payload: {
      queueId,
      customerName: "Alice Remote",
      customerPhone: "+15550001",
      priority: "VIP",
    },
  });

  assert.equal(remoteRes.statusCode, 201);
  const remoteBody = JSON.parse(remoteRes.body);
  assert.equal(remoteBody.ticket.number, "GC001");
  assert.equal(remoteBody.ticket.priority, QueuePriority.VIP);
  assert.equal(remoteBody.ticket.status, TicketStatus.WAITING);

  // 3. Walk-in check-in
  const walkInRes = await server.inject({
    method: "POST",
    url: "/api/check-in/walk-in",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "member-2",
      "x-user-role": "MEMBER",
    },
    payload: {
      queueId,
      customerName: "Bob Walk-In",
    },
  });

  assert.equal(walkInRes.statusCode, 201);
  const walkInBody = JSON.parse(walkInRes.body);
  assert.equal(walkInBody.ticket.number, "GC002");
  assert.equal(walkInBody.ticket.priority, QueuePriority.STANDARD);

  // 4. Appointment check-in
  const apptRes = await server.inject({
    method: "POST",
    url: "/api/check-in/appointment",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "member-3",
      "x-user-role": "MEMBER",
    },
    payload: {
      queueId,
      appointmentId: "APPT-1001",
      customerName: "Charlie Appointment",
    },
  });

  assert.equal(apptRes.statusCode, 201);
  const apptBody = JSON.parse(apptRes.body);
  assert.equal(apptBody.ticket.number, "GC003");
  assert.equal(apptBody.ticket.priority, QueuePriority.APPOINTMENT);

  // 5. Validation error when queueId missing
  const invalidRes = await server.inject({
    method: "POST",
    url: "/api/check-in/remote",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "member-1",
      "x-user-role": "MEMBER",
    },
    payload: {
      customerName: "No Queue ID",
    },
  });

  assert.equal(invalidRes.statusCode, 400);

  // 6. Cross-tenant check-in rejection
  const crossTenantId = TenantId.generate().value;
  const crossRes = await server.inject({
    method: "POST",
    url: "/api/check-in/remote",
    headers: {
      "x-tenant-id": crossTenantId,
      "x-user-id": "cross-member",
      "x-user-role": "MEMBER",
    },
    payload: {
      queueId,
      customerName: "Cross Tenant User",
    },
  });

  assert.equal(crossRes.statusCode, 404); // Scoped query does not find queue under tenant

  await server.close();
});
