import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../server.js";
import { serviceTicketAuditLog } from "../requests.js";

describe("SD-009: Service Desk API Integration & Tenant Isolation Suite", () => {
  const app = createServer();

  test("POST /api/requests - creates employee service request and emits audit event", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/requests",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-employee-1",
        "x-user-role": "employee",
      },
      payload: {
        title: "New Monitor Request",
        description: "Need dual monitors for developer workstation",
        category: "IT_SUPPORT",
        priority: "HIGH",
        requesterName: "Alice Developer",
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.ticket.title, "New Monitor Request");
    assert.equal(body.ticket.tenantId, "tenant-alpha");
    assert.equal(body.ticket.status, "NEW");

    // Check audit log
    const audit = serviceTicketAuditLog.find(
      (a) => a.action === "ticket.created" && (a.payload as any).ticketId === body.ticket.id
    );
    assert.ok(audit, "Audit event ticket.created must be recorded");
  });

  test("POST /api/requests/draft & /:id/submit - draft lifecycle", async () => {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/requests/draft",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-employee-1",
        "x-user-role": "employee",
      },
      payload: {
        title: "Draft Access Request",
        description: "Request access to production database",
        category: "ACCESS_CONTROL",
      },
    });

    assert.equal(draftRes.statusCode, 201);
    const draftBody = JSON.parse(draftRes.payload);
    assert.equal(draftBody.ticket.status, "DRAFT");

    // Submit draft
    const submitRes = await app.inject({
      method: "POST",
      url: `/api/requests/${draftBody.ticket.id}/submit`,
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-employee-1",
        "x-user-role": "employee",
      },
    });

    assert.equal(submitRes.statusCode, 200);
    const submitBody = JSON.parse(submitRes.payload);
    assert.equal(submitBody.ticket.status, "NEW");
  });

  test("GET /api/requests - list employee requests with search and status filters", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/requests?status=NEW&search=Monitor",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-employee-1",
        "x-user-role": "employee",
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.items));
    assert.ok(body.items.length >= 1);
  });

  test("RBAC Security: Employee cannot access Agent Workspace APIs (403 Forbidden)", async () => {
    const dashboardRes = await app.inject({
      method: "GET",
      url: "/api/service-desk/dashboard",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-employee-1",
        "x-user-role": "employee",
      },
    });
    assert.equal(dashboardRes.statusCode, 403);

    const queueRes = await app.inject({
      method: "GET",
      url: "/api/service-desk/tickets",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-employee-1",
        "x-user-role": "employee",
      },
    });
    assert.equal(queueRes.statusCode, 403);
  });

  test("Agent Workspace APIs: Dashboard, Ticket Queue, Assignment, Status & Internal Notes", async () => {
    // 1. Create a ticket first as employee
    const createRes = await app.inject({
      method: "POST",
      url: "/api/requests",
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "user-bob",
        "x-user-role": "employee",
      },
      payload: {
        title: "VPN connection dropping",
        description: "Disconnects every 15 minutes",
        category: "IT_SUPPORT",
        priority: "HIGH",
      },
    });

    const ticketId = JSON.parse(createRes.payload).ticket.id;

    // 2. Fetch Agent Dashboard
    const dashRes = await app.inject({
      method: "GET",
      url: "/api/service-desk/dashboard",
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "agent-smith",
        "x-user-role": "agent",
      },
    });
    assert.equal(dashRes.statusCode, 200);
    const dashBody = JSON.parse(dashRes.payload);
    assert.ok(dashBody.metrics.totalTickets >= 1);

    // 3. Assign Ticket
    const assignRes = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketId}/assign`,
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "agent-smith",
        "x-user-role": "agent",
      },
      payload: {
        assigneeUserId: "agent-smith",
        teamId: "network-team",
      },
    });
    assert.equal(assignRes.statusCode, 200);
    const assignBody = JSON.parse(assignRes.payload);
    assert.equal(assignBody.ticket.assignedUserId, "agent-smith");
    assert.equal(assignBody.ticket.status, "OPEN");

    // 4. Add Internal Note
    const noteRes = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketId}/comments`,
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "agent-smith",
        "x-user-role": "agent",
      },
      payload: {
        content: "Checking VPN gateway logs for user bob",
        isInternal: true,
      },
    });
    assert.equal(noteRes.statusCode, 201);

    // 5. Update Status to RESOLVED
    const statusRes = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketId}/status`,
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "agent-smith",
        "x-user-role": "agent",
      },
      payload: {
        status: "RESOLVED",
        resolutionNotes: "Re-keyed user client certificate",
      },
    });
    assert.equal(statusRes.statusCode, 200);
    const statusBody = JSON.parse(statusRes.payload);
    assert.equal(statusBody.ticket.status, "RESOLVED");
  });

  test("Cross-Tenant Isolation: Tenant A cannot view or modify Tenant B tickets (404/Forbidden)", async () => {
    // Create ticket in Tenant A
    const resA = await app.inject({
      method: "POST",
      url: "/api/requests",
      headers: {
        "x-tenant-id": "tenant-A",
        "x-user-id": "user-A",
        "x-user-role": "employee",
      },
      payload: {
        title: "Confidential Payroll Query",
        description: "Tax withholding detail",
        category: "FINANCE",
      },
    });

    const ticketAId = JSON.parse(resA.payload).ticket.id;

    // Tenant B attempts to fetch Tenant A ticket -> 404
    const crossFetch = await app.inject({
      method: "GET",
      url: `/api/requests/${ticketAId}`,
      headers: {
        "x-tenant-id": "tenant-B",
        "x-user-id": "user-B",
        "x-user-role": "agent",
      },
    });
    assert.equal(crossFetch.statusCode, 404);

    // Tenant B attempts to assign Tenant A ticket -> 400 or 404
    const crossAssign = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketAId}/assign`,
      headers: {
        "x-tenant-id": "tenant-B",
        "x-user-id": "agent-B",
        "x-user-role": "agent",
      },
      payload: { assigneeUserId: "agent-B" },
    });
    assert.equal(crossAssign.statusCode, 400);
  });

  test("SLA Overview & SLA Timer Check API", async () => {
    const slaOverviewRes = await app.inject({
      method: "GET",
      url: "/api/service-desk/sla/overview",
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "agent-smith",
        "x-user-role": "agent",
      },
    });

    assert.equal(slaOverviewRes.statusCode, 200);
    const overview = JSON.parse(slaOverviewRes.payload);
    assert.ok(overview.slaOverview);

    const checkRes = await app.inject({
      method: "POST",
      url: "/api/service-desk/sla/check",
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "agent-smith",
        "x-user-role": "agent",
      },
    });

    assert.equal(checkRes.statusCode, 200);
    const checkBody = JSON.parse(checkRes.payload);
    assert.equal(checkBody.success, true);
  });
});
