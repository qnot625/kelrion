import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantId, BranchId, QueuePriority } from "@klerion/queue";
import { buildServer } from "../src/server.js";

test("End-to-End Customer Journey: Book Appointment -> Check-in -> Call Next -> Notification -> Complete", async (t) => {
  await t.test("Full customer lifecycle execution with state transitions, notifications, and telemetry audit", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;
    const branchId = BranchId.generate().value;

    // 1. Create Queue for Branch
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
        code: "VIP-CLINIC",
        name: "Specialist Consultation",
        prefix: "SC",
      },
    });

    assert.equal(createQueueRes.statusCode, 201);
    const queue = JSON.parse(createQueueRes.body).queue;
    assert.equal(queue.prefix, "SC");
    assert.equal(queue.tenantId, tenantId);

    // 2. Customer performs appointment check-in (Booked appointment APPT-9901)
    const checkInRes = await server.inject({
      method: "POST",
      url: "/api/check-in/appointment",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_patient",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId: queue.id,
        appointmentId: "APPT-9901",
        customerName: "Dr. Eleanor Vance",
        customerPhone: "+15559988",
      },
    });

    assert.equal(checkInRes.statusCode, 201);
    const checkInBody = JSON.parse(checkInRes.body);
    const ticket = checkInBody.ticket;

    assert.equal(ticket.number, "SC001");
    assert.equal(ticket.priority, QueuePriority.APPOINTMENT);
    assert.equal(ticket.status, "waiting");
    assert.equal(ticket.customerName, "Dr. Eleanor Vance");

    // 3. Verify queue snapshot & estimated wait time calculation
    const snapshotRes = await server.inject({
      method: "GET",
      url: `/api/queues/${queue.id}/snapshot`,
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_patient",
        "x-user-role": "MEMBER",
      },
    });

    assert.equal(snapshotRes.statusCode, 200);
    const snapshotBody = JSON.parse(snapshotRes.body);
    assert.equal(snapshotBody.snapshot.waitingCount, 1);
    assert.equal(typeof snapshotBody.snapshot.estimatedWaitMinutes, "number");

    // 4. Operator calls next customer to Desk 3
    const callNextRes = await server.inject({
      method: "POST",
      url: `/api/queues/${queue.id}/tickets/call-next`,
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_staff_01",
        "x-user-role": "STAFF",
      },
      payload: {
        counterId: "Desk 3",
      },
    });

    assert.equal(callNextRes.statusCode, 200);
    const calledTicket = JSON.parse(callNextRes.body).ticket;
    assert.equal(calledTicket.id, ticket.id);
    assert.equal(calledTicket.status, "called");
    assert.equal(calledTicket.counterId, "Desk 3");

    // 5. Omnichannel notification is generated and delivered
    const notifRes = await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_staff_01",
        "x-user-role": "STAFF",
      },
      payload: {
        recipient: "eleanor.vance@example.com",
        channel: "email",
        variables: {
          ticketNumber: calledTicket.number,
          customerName: calledTicket.customerName,
          counterName: "Desk 3",
        },
      },
    });

    assert.equal(notifRes.statusCode, 200);
    const notifBody = JSON.parse(notifRes.body);
    assert.equal(notifBody.success, true);
    assert.ok(notifBody.status === "delivered" || notifBody.status === "sent");
    assert.ok(notifBody.notificationId);

    // 6. Verify notification audit logs
    const logsRes = await server.inject({
      method: "GET",
      url: "/api/notifications",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_staff_01",
        "x-user-role": "STAFF",
      },
    });

    assert.equal(logsRes.statusCode, 200);
    const logsBody = JSON.parse(logsRes.body);
    assert.equal(logsBody.data.length, 1);
    assert.equal(logsBody.data[0].recipient, "eleanor.vance@example.com");
    assert.ok(logsBody.data[0].status === "delivered" || logsBody.data[0].status === "sent");

    // 7. Complete the service session
    const completeRes = await server.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/complete`,
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_staff_01",
        "x-user-role": "STAFF",
      },
    });

    assert.equal(completeRes.statusCode, 200);
    const completedTicket = JSON.parse(completeRes.body).ticket;
    assert.equal(completedTicket.status, "completed");

    // 8. Verify post-service queue snapshot
    const finalSnapshotRes = await server.inject({
      method: "GET",
      url: `/api/queues/${queue.id}/snapshot`,
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_staff_01",
        "x-user-role": "STAFF",
      },
    });

    assert.equal(finalSnapshotRes.statusCode, 200);
    const finalSnapshot = JSON.parse(finalSnapshotRes.body).snapshot;
    assert.equal(finalSnapshot.waitingCount, 0);

    // 9. Verify ticket non-duplication by performing second check-in
    const checkIn2Res = await server.inject({
      method: "POST",
      url: "/api/check-in/walk-in",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_patient_2",
        "x-user-role": "MEMBER",
      },
      payload: {
        queueId: queue.id,
        customerName: "Secondary Guest",
      },
    });

    assert.equal(checkIn2Res.statusCode, 201);
    const ticket2 = JSON.parse(checkIn2Res.body).ticket;
    assert.equal(ticket2.number, "SC002");
    assert.notEqual(ticket2.id, ticket.id);

    await server.close();
  });
});
