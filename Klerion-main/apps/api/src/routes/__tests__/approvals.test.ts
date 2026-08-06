import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../server.js";
import { approvalRepository, approvalAuditLog } from "../approvals.js";

describe("APR-008: Fastify Approvals API Integration Tests", () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    approvalRepository.clear();
    approvalAuditLog.length = 0;
    app = createServer();
  });

  it("POST /api/approvals - validates input and creates approval request", async () => {
    // Missing title -> 400
    const invalidTitle = await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: { steps: [{ name: "Manager Step" }] },
    });
    assert.equal(invalidTitle.statusCode, 400);

    // Missing steps -> 400
    const invalidSteps = await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: { title: "Software License" },
    });
    assert.equal(invalidSteps.statusCode, 400);

    // Valid creation -> 201
    const res = await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-101",
        title: "Software Purchase Request",
        description: "IDE license renewal",
        steps: [
          { id: "s1", name: "Manager Approval", assignedUserIds: ["bob"] },
          { id: "s2", name: "Finance Approval", assignedUserIds: ["charlie"] },
        ],
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.equal(body.approval.id, "apr-101");
    assert.equal(body.approval.tenantId, "tenant-alpha");
    assert.equal(body.approval.requesterUserId, "alice");
    assert.equal(body.approval.status, "IN_PROGRESS");
    assert.equal(body.approval.steps.length, 2);
  });

  it("GET /api/approvals - lists, searches, filters, and paginates with tenant isolation", async () => {
    // Seed Tenant Alpha approvals
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-alpha-1",
        title: "Alpha Hardware Upgrade",
        steps: [{ id: "s1", name: "IT Signoff", assignedUserIds: ["bob"] }],
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-alpha-2",
        title: "Alpha Conference Budget",
        steps: [{ id: "s1", name: "Finance Signoff", assignedUserIds: ["david"] }],
      },
    });

    // Seed Tenant Beta approval
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-beta", "x-user-id": "user-beta" },
      payload: {
        id: "apr-beta-1",
        title: "Beta Procurement",
        steps: [{ id: "s1", name: "Signoff", assignedUserIds: ["bob"] }],
      },
    });

    // 1. Tenant Alpha list
    const alphaList = await app.inject({
      method: "GET",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha" },
    });
    assert.equal(alphaList.statusCode, 200);
    const alphaBody = JSON.parse(alphaList.body);
    assert.equal(alphaBody.total, 2);
    assert.equal(alphaBody.approvals.length, 2);

    // 2. Tenant Beta list (isolation check)
    const betaList = await app.inject({
      method: "GET",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-beta" },
    });
    assert.equal(betaList.statusCode, 200);
    const betaBody = JSON.parse(betaList.body);
    assert.equal(betaBody.total, 1);
    assert.equal(betaBody.approvals[0].id, "apr-beta-1");

    // 3. User Inbox filter (inbox=true for bob in tenant-alpha)
    const bobInbox = await app.inject({
      method: "GET",
      url: "/api/approvals?inbox=true",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "bob" },
    });
    const bobBody = JSON.parse(bobInbox.body);
    assert.equal(bobBody.total, 1);
    assert.equal(bobBody.approvals[0].id, "apr-alpha-1");

    // 4. Text search filter
    const searchRes = await app.inject({
      method: "GET",
      url: "/api/approvals?search=Hardware",
      headers: { "x-tenant-id": "tenant-alpha" },
    });
    const searchBody = JSON.parse(searchRes.body);
    assert.equal(searchBody.total, 1);
    assert.equal(searchBody.approvals[0].id, "apr-alpha-1");

    // 5. Pagination test
    const pageRes = await app.inject({
      method: "GET",
      url: "/api/approvals?page=1&limit=1",
      headers: { "x-tenant-id": "tenant-alpha" },
    });
    const pageBody = JSON.parse(pageRes.body);
    assert.equal(pageBody.total, 2);
    assert.equal(pageBody.limit, 1);
    assert.equal(pageBody.totalPages, 2);
    assert.equal(pageBody.approvals.length, 1);
  });

  it("GET /api/approvals/:id - retrieves individual approval or returns 404", async () => {
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-200",
        title: "Single Item Test",
        steps: [{ name: "Step 1", assignedUserIds: ["bob"] }],
      },
    });

    const getOk = await app.inject({
      method: "GET",
      url: "/api/approvals/apr-200",
      headers: { "x-tenant-id": "tenant-alpha" },
    });
    assert.equal(getOk.statusCode, 200);
    assert.equal(JSON.parse(getOk.body).approval.title, "Single Item Test");

    const getNotFound = await app.inject({
      method: "GET",
      url: "/api/approvals/non-existent",
      headers: { "x-tenant-id": "tenant-alpha" },
    });
    assert.equal(getNotFound.statusCode, 404);
  });

  it("POST /api/approvals/:id/approve - advances steps and updates aggregate status", async () => {
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-multi",
        title: "Multi Step Approval",
        steps: [
          { id: "s1", name: "Step 1", assignedUserIds: ["bob"] },
          { id: "s2", name: "Step 2", assignedUserIds: ["charlie"] },
        ],
      },
    });

    // Step 1 approve
    const step1Res = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-multi/approve",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "bob" },
      payload: { comment: "Step 1 approved" },
    });
    assert.equal(step1Res.statusCode, 200);
    const step1Body = JSON.parse(step1Res.body);
    assert.equal(step1Body.approval.currentStepIndex, 1);
    assert.equal(step1Body.approval.status, "IN_PROGRESS");

    // Step 2 approve -> completes aggregate
    const step2Res = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-multi/approve",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "charlie" },
      payload: { comment: "Final approval" },
    });
    assert.equal(step2Res.statusCode, 200);
    const step2Body = JSON.parse(step2Res.body);
    assert.equal(step2Body.approval.status, "APPROVED");
  });

  it("POST /api/approvals/:id/reject - rejects request immediately", async () => {
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-rej",
        title: "Travel Request",
        steps: [{ id: "s1", name: "Manager Step", assignedUserIds: ["bob"] }],
      },
    });

    const rejRes = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-rej/reject",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "bob" },
      payload: { reason: "Travel budget exceeded" },
    });
    assert.equal(rejRes.statusCode, 200);
    const rejBody = JSON.parse(rejRes.body);
    assert.equal(rejBody.approval.status, "REJECTED");
  });

  it("POST /api/approvals/:id/delegate - delegates active step to another user", async () => {
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-del",
        title: "Access Request",
        steps: [{ id: "s1", name: "Security Gate", assignedUserIds: ["bob"] }],
      },
    });

    // Delegate without targetUserId -> 400
    const invalidDel = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-del/delegate",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "bob" },
      payload: {},
    });
    assert.equal(invalidDel.statusCode, 400);

    // Valid delegate -> 200
    const delRes = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-del/delegate",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "bob" },
      payload: { targetUserId: "david", comment: "Delegating to team lead" },
    });
    assert.equal(delRes.statusCode, 200);
    const delBody = JSON.parse(delRes.body);
    assert.equal(delBody.approval.status, "DELEGATED");
    assert.ok(delBody.approval.steps[0].assignedUserIds.includes("david"));
  });

  it("handles request-info, resume, and cancel lifecycle flows", async () => {
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-flow",
        title: "Equipment Request",
        steps: [{ id: "s1", name: "Review", assignedUserIds: ["bob"] }],
      },
    });

    // 1. Request Info
    const infoRes = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-flow/request-info",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "bob" },
      payload: { question: "Which laptop model?" },
    });
    assert.equal(infoRes.statusCode, 200);
    assert.equal(JSON.parse(infoRes.body).approval.status, "MORE_INFO_REQUESTED");

    // 2. Resume
    const resumeRes = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-flow/resume",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: { comment: "Model X1 Carbon", responseData: { model: "X1 Carbon" } },
    });
    assert.equal(resumeRes.statusCode, 200);
    assert.equal(JSON.parse(resumeRes.body).approval.status, "IN_PROGRESS");

    // 3. Cancel
    const cancelRes = await app.inject({
      method: "POST",
      url: "/api/approvals/apr-flow/cancel",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: { reason: "No longer needed" },
    });
    assert.equal(cancelRes.statusCode, 200);
    assert.equal(JSON.parse(cancelRes.body).approval.status, "CANCELLED");
  });

  it("GET /api/approvals/:id/history and /audit-logs - verifies timeline and audit logs", async () => {
    await app.inject({
      method: "POST",
      url: "/api/approvals",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "alice" },
      payload: {
        id: "apr-hist",
        title: "History Audit Test",
        steps: [{ id: "s1", name: "Review", assignedUserIds: ["bob"] }],
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/approvals/apr-hist/approve",
      headers: { "x-tenant-id": "tenant-alpha", "x-user-id": "bob" },
      payload: { comment: "Approved" },
    });

    const histRes = await app.inject({
      method: "GET",
      url: "/api/approvals/apr-hist/history",
      headers: { "x-tenant-id": "tenant-alpha" },
    });
    assert.equal(histRes.statusCode, 200);
    const histBody = JSON.parse(histRes.body);
    assert.equal(histBody.approvalRequestId, "apr-hist");
    assert.equal(histBody.currentStatus, "APPROVED");
    assert.equal(histBody.decisions.length, 1);
    assert.equal(histBody.decisions[0].action, "APPROVE");

    const auditRes = await app.inject({
      method: "GET",
      url: "/api/approvals/audit-logs",
      headers: { "x-tenant-id": "tenant-alpha" },
    });
    assert.equal(auditRes.statusCode, 200);
    const auditBody = JSON.parse(auditRes.body);
    assert.ok(auditBody.logs.length >= 2);
  });
});
