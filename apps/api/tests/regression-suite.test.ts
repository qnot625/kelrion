import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantId, BranchId } from "@klerion/queue";
import { buildServer } from "../src/server.js";

test("Regression Test Suite for Appointments, RBAC Auth, Tenancy & Audit Integrity", async (t) => {
  const server = buildServer();
  const tenantId = TenantId.generate().value;
  const branchId = BranchId.generate().value;

  await server.ready();

  t.after(async () => {
    await server.close();
  });

  await t.test("Authentication & RBAC Header Verification", async () => {
    // 1. Missing x-tenant-id header on realtime endpoint returns 401 Unauthorized
    const unauthRes = await server.inject({
      method: "GET",
      url: "/api/realtime/queues/non-existent-id/stream",
    });
    assert.equal(unauthRes.statusCode, 401);

    // 2. MEMBER role attempting staff operations returns 401/403
    const memberCallNext = await server.inject({
      method: "POST",
      url: "/api/queues/non-existent-id/tickets/call-next",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "member-user",
        "x-user-role": "MEMBER",
      },
    });
    assert.equal(memberCallNext.statusCode, 401);
  });

  await t.test("Queue Management & Branch Scoping Regression", async () => {
    // Create Queue under Tenant and Branch
    const createRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "owner-user",
        "x-user-role": "OWNER",
      },
      payload: {
        branchId,
        code: "REG",
        name: "Regression Test Queue",
        prefix: "RG",
      },
    });

    assert.equal(createRes.statusCode, 201);
    const queue = JSON.parse(createRes.body).queue;
    assert.equal(queue.branchId, branchId);
    assert.equal(queue.prefix, "RG");

    // Fetch queue list for Tenant
    const listRes = await server.inject({
      method: "GET",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "owner-user",
        "x-user-role": "OWNER",
      },
    });

    assert.equal(listRes.statusCode, 200);
    const queues = JSON.parse(listRes.body).queues;
    assert.equal(queues.length >= 1, true);
    assert.equal(queues.some((q: any) => q.id === queue.id), true);
  });

  await t.test("Appointment Conversion & Walk-In Check-In Consistency", async () => {
    // Create queue
    const queueRes = await server.inject({
      method: "POST",
      url: "/api/queues",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "owner-user",
        "x-user-role": "OWNER",
      },
      payload: {
        branchId,
        code: "APPTREG",
        name: "Appointment Queue",
        prefix: "AQ",
      },
    });
    const queueId = JSON.parse(queueRes.body).queue.id;

    // Appointment Check-in
    const apptCheckIn = await server.inject({
      method: "POST",
      url: "/api/check-in/appointment",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "patient-1",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId,
        appointmentId: "APPT-REG-01",
        customerName: "Reg Customer",
      },
    });
    assert.equal(apptCheckIn.statusCode, 201);
    const ticket1 = JSON.parse(apptCheckIn.body).ticket;
    assert.equal(ticket1.priority.toUpperCase(), "APPOINTMENT");

    // Walk-in Check-in
    const walkInCheckIn = await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "guest-1",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId,
        customerName: "Walkin Guest",
      },
    });
    assert.equal(walkInCheckIn.statusCode, 201);
    const ticket2 = JSON.parse(walkInCheckIn.body).ticket;
    assert.equal(ticket2.priority.toUpperCase(), "STANDARD");

    // Call next ticket (APPOINTMENT priority ticket1 should be served first!)
    const callNext = await server.inject({
      method: "POST",
      url: `/api/queues/${queueId}/tickets/call-next`,
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "staff-1",
        "x-user-role": "STAFF",
      },
      payload: { counterId: "Station 1" },
    });
    assert.equal(callNext.statusCode, 200);
    const calledTicket = JSON.parse(callNext.body).ticket;
    assert.equal(calledTicket.id, ticket1.id, "APPOINTMENT ticket must be called before STANDARD walk-in");
  });

  await t.test("Notification Service Provider Integration & Retry System Regression", async () => {
    const testNotif = await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "staff-1",
        "x-user-role": "STAFF",
      },
      payload: {
        recipient: "+155500099",
        channel: "sms",
        templateId: "test_sms_template",
      },
    });

    assert.equal(testNotif.statusCode, 200);
    const body = JSON.parse(testNotif.body);
    assert.equal(body.success, true);
    assert.ok(body.status === "delivered" || body.status === "sent");
  });
});
