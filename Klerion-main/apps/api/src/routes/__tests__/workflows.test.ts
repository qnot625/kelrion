import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../server.js";
import {
  workflowDefinitionRepository,
  workflowInstanceRepository,
  humanTaskRepository,
  workflowExecutionHistoryRepository,
} from "../workflows.js";

describe("WF-012: Fastify Workflows API Integration Tests", () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    workflowDefinitionRepository.clear();
    workflowInstanceRepository.clear();
    humanTaskRepository.clear();
    workflowExecutionHistoryRepository.clear();
    app = createServer();
  });

  it("POST /api/workflows - creates a workflow definition (admin/owner only)", async () => {
    // Non-admin attempt -> 403
    const forbiddenRes = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: {
        "x-tenant-id": "tenant-test",
        "x-user-role": "member",
      },
      payload: { name: "Forbidden Workflow" },
    });
    assert.equal(forbiddenRes.statusCode, 403);

    // Admin attempt without name -> 400
    const invalidRes = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: {
        "x-tenant-id": "tenant-test",
        "x-user-role": "admin",
      },
      payload: {},
    });
    assert.equal(invalidRes.statusCode, 400);

    // Admin attempt -> 201 Created
    const res = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: {
        "x-tenant-id": "tenant-test",
        "x-user-role": "admin",
      },
      payload: {
        id: "wf-101",
        name: "Expense Approval Workflow",
        description: "Approve corporate expense claims",
        startStepId: "step-start",
        steps: [
          {
            id: "step-start",
            name: "Start Step",
            type: "START",
            transitions: [{ targetStepId: "step-approval" }],
          },
          {
            id: "step-approval",
            name: "Manager Approval",
            type: "APPROVAL_TASK",
            transitions: [{ targetStepId: "step-end" }],
          },
          {
            id: "step-end",
            name: "End Step",
            type: "END",
            transitions: [],
          },
        ],
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.workflow.id, "wf-101");
    assert.equal(body.workflow.status, "DRAFT");
    assert.equal(body.workflow.steps.length, 3);
  });

  it("PUT /api/workflows/:id & POST /api/workflows/:id/publish - updates draft and publishes workflow", async () => {
    // 1. Create initial workflow
    await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { "x-tenant-id": "tenant-test", "x-user-role": "admin" },
      payload: {
        id: "wf-pub-1",
        name: "Initial Workflow Name",
        steps: [
          { id: "s1", name: "Start", type: "START", transitions: [{ targetStepId: "s2" }] },
          { id: "s2", name: "End", type: "END", transitions: [] },
        ],
      },
    });

    // 2. Update draft
    const updateRes = await app.inject({
      method: "PUT",
      url: "/api/workflows/wf-pub-1",
      headers: { "x-tenant-id": "tenant-test", "x-user-role": "admin" },
      payload: { name: "Updated Workflow Name" },
    });
    assert.equal(updateRes.statusCode, 200);
    const updateBody = JSON.parse(updateRes.payload);
    assert.equal(updateBody.workflow.name, "Updated Workflow Name");

    // 3. Publish workflow
    const pubRes = await app.inject({
      method: "POST",
      url: "/api/workflows/wf-pub-1/publish",
      headers: { "x-tenant-id": "tenant-test", "x-user-role": "admin" },
    });
    assert.equal(pubRes.statusCode, 200);
    const pubBody = JSON.parse(pubRes.payload);
    assert.equal(pubBody.workflow.status, "PUBLISHED");
    assert.equal(pubBody.workflow.version, 1);
  });

  it("GET /api/workflows - lists workflows and enforces tenant isolation", async () => {
    // Tenant A workflow
    await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { "x-tenant-id": "tenant-a", "x-user-role": "admin" },
      payload: {
        id: "wf-a",
        name: "Tenant A Workflow",
        steps: [{ id: "s1", name: "Start", type: "START", transitions: [] }],
      },
    });

    // Tenant B workflow
    await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { "x-tenant-id": "tenant-b", "x-user-role": "admin" },
      payload: {
        id: "wf-b",
        name: "Tenant B Workflow",
        steps: [{ id: "s1", name: "Start", type: "START", transitions: [] }],
      },
    });

    // Tenant A list
    const listResA = await app.inject({
      method: "GET",
      url: "/api/workflows",
      headers: { "x-tenant-id": "tenant-a" },
    });
    assert.equal(listResA.statusCode, 200);
    const bodyA = JSON.parse(listResA.payload);
    assert.equal(bodyA.workflows.length, 1);
    assert.equal(bodyA.workflows[0].id, "wf-a");

    // Tenant A cannot view Tenant B's workflow directly
    const getBByA = await app.inject({
      method: "GET",
      url: "/api/workflows/wf-b",
      headers: { "x-tenant-id": "tenant-a" },
    });
    assert.equal(getBByA.statusCode, 404);
  });

  it("Manages complete Workflow Instance lifecycle: create, start, human task completion, and execution history", async () => {
    // 1. Create and publish definition
    await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { "x-tenant-id": "tenant-exec", "x-user-role": "admin" },
      payload: {
        id: "wf-purchase",
        name: "Purchase Request Workflow",
        startStepId: "step-start",
        steps: [
          {
            id: "step-start",
            name: "Start Request",
            type: "START",
            transitions: [{ targetStepId: "step-review" }],
          },
          {
            id: "step-review",
            name: "Manager Approval Task",
            type: "APPROVAL_TASK",
            taskConfig: {
              candidateRoles: ["manager"],
            },
            transitions: [{ targetStepId: "step-finish" }],
          },
          {
            id: "step-finish",
            name: "Completed Request",
            type: "END",
            transitions: [],
          },
        ],
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/workflows/wf-purchase/publish",
      headers: { "x-tenant-id": "tenant-exec", "x-user-role": "admin" },
    });

    // 2. Create Instance
    const instRes = await app.inject({
      method: "POST",
      url: "/api/workflows/instances",
      headers: { "x-tenant-id": "tenant-exec", "x-user-id": "requester-1" },
      payload: {
        workflowDefinitionId: "wf-purchase",
        initialContext: { amount: 500, item: "Laptop" },
      },
    });

    assert.equal(instRes.statusCode, 201);
    const instBody = JSON.parse(instRes.payload);
    const instanceId = instBody.instance.id;
    assert.equal(instBody.instance.status, "NOT_STARTED");

    // 3. Start Instance
    const startRes = await app.inject({
      method: "POST",
      url: `/api/workflows/instances/${instanceId}/start`,
      headers: { "x-tenant-id": "tenant-exec", "x-user-id": "requester-1" },
    });

    assert.equal(startRes.statusCode, 200);
    const startBody = JSON.parse(startRes.payload);
    assert.equal(startBody.instance.status, "WAITING");
    assert.equal(startBody.instance.currentStepId, "step-review");

    // 4. Query created human task
    const tasksRes = await app.inject({
      method: "GET",
      url: `/api/workflows/tasks?candidateRole=manager`,
      headers: { "x-tenant-id": "tenant-exec" },
    });

    assert.equal(tasksRes.statusCode, 200);
    const tasksBody = JSON.parse(tasksRes.payload);
    assert.equal(tasksBody.tasks.length, 1);
    const taskId = tasksBody.tasks[0].id;

    // 5. Complete Human Task
    const completeTaskRes = await app.inject({
      method: "POST",
      url: `/api/workflows/tasks/${taskId}/complete`,
      headers: { "x-tenant-id": "tenant-exec", "x-user-id": "manager-1" },
      payload: {
        outcome: "APPROVED",
        outputData: { approvedBy: "manager-1", comments: "Looks good" },
      },
    });

    assert.equal(completeTaskRes.statusCode, 200);
    const completeBody = JSON.parse(completeTaskRes.payload);
    assert.equal(completeBody.task.status, "COMPLETED");
    assert.equal(completeBody.instance.status, "COMPLETED");
    assert.equal(completeBody.instance.currentStepId, null);

    // 6. Verify Execution History
    const historyRes = await app.inject({
      method: "GET",
      url: `/api/workflows/instances/${instanceId}/history`,
      headers: { "x-tenant-id": "tenant-exec" },
    });

    assert.equal(historyRes.statusCode, 200);
    const historyBody = JSON.parse(historyRes.payload);
    assert.ok(historyBody.history.length >= 3);
  });

  it("POST /api/workflows/instances/:id/cancel - cancels a running workflow instance", async () => {
    // Setup workflow and instance
    await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: { "x-tenant-id": "tenant-cancel", "x-user-role": "admin" },
      payload: {
        id: "wf-cancel-demo",
        name: "Cancel Demo",
        steps: [
          { id: "s1", name: "Start", type: "START", transitions: [{ targetStepId: "s2" }] },
          { id: "s2", name: "Manual Step", type: "MANUAL_TASK", transitions: [{ targetStepId: "s3" }] },
          { id: "s3", name: "End", type: "END", transitions: [] },
        ],
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/workflows/wf-cancel-demo/publish",
      headers: { "x-tenant-id": "tenant-cancel", "x-user-role": "admin" },
    });

    const instRes = await app.inject({
      method: "POST",
      url: "/api/workflows/instances",
      headers: { "x-tenant-id": "tenant-cancel" },
      payload: { workflowDefinitionId: "wf-cancel-demo" },
    });
    const instanceId = JSON.parse(instRes.payload).instance.id;

    await app.inject({
      method: "POST",
      url: `/api/workflows/instances/${instanceId}/start`,
      headers: { "x-tenant-id": "tenant-cancel" },
    });

    // Cancel workflow instance
    const cancelRes = await app.inject({
      method: "POST",
      url: `/api/workflows/instances/${instanceId}/cancel`,
      headers: { "x-tenant-id": "tenant-cancel" },
      payload: { reason: "User withdrew request" },
    });

    assert.equal(cancelRes.statusCode, 200);
    const cancelBody = JSON.parse(cancelRes.payload);
    assert.equal(cancelBody.instance.status, "CANCELLED");
  });
});
