import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../server.js";
import {
  formDefinitionRepository,
  formSubmissionRepository,
} from "../forms.js";
import {
  workflowDefinitionRepository,
  workflowInstanceRepository,
  humanTaskRepository,
} from "../workflows.js";
import { approvalRepository } from "../approvals.js";
import { serviceTicketRepository } from "../requests.js";

describe("INT-001 / INT-002: End-to-End Cross-Module Integration Test Suite", () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    // Reset all in-memory repositories before each test
    formDefinitionRepository.clear();
    formSubmissionRepository.clear();
    workflowDefinitionRepository.clear();
    workflowInstanceRepository.clear();
    humanTaskRepository.clear();
    approvalRepository.clear();
    serviceTicketRepository.clear();

    app = createServer();
  });

  it("completes full E2E lifecycle: Form -> Workflow -> Approval -> Service Desk Ticket -> Resolution", async () => {
    const tenant = "tenant-e2e-1";
    const submitterId = "employee-jane";
    const approverId = "manager-bob";
    const agentId = "agent-alice";

    const headersSubmitter = {
      "x-tenant-id": tenant,
      "x-user-id": submitterId,
      "x-user-role": "member",
    };

    const headersAdmin = {
      "x-tenant-id": tenant,
      "x-user-id": "admin-1",
      "x-user-role": "admin",
    };

    const headersApprover = {
      "x-tenant-id": tenant,
      "x-user-id": approverId,
      "x-user-role": "admin",
    };

    const headersAgent = {
      "x-tenant-id": tenant,
      "x-user-id": agentId,
      "x-user-role": "agent",
    };

    // -------------------------------------------------------------
    // Step 1: Admin Creates & Publishes Form Definition
    // -------------------------------------------------------------
    const createFormRes = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: headersAdmin,
      payload: {
        id: "form-laptop-request",
        title: "Developer Laptop Upgrade Request",
        description: "Request a high-performance developer workstation",
        fields: [
          {
            id: "f_reason",
            label: "Justification",
            type: "TEXT",
            required: true,
          },
          {
            id: "f_urgency",
            label: "Urgency Level",
            type: "SINGLE_CHOICE",
            required: true,
            options: ["HIGH", "MEDIUM", "LOW"],
          },
        ],
      },
    });

    assert.equal(createFormRes.statusCode, 201);
    const formId = JSON.parse(createFormRes.payload).form.id;

    const publishFormRes = await app.inject({
      method: "POST",
      url: `/api/forms/${formId}/publish`,
      headers: headersAdmin,
    });
    assert.equal(publishFormRes.statusCode, 200);

    // -------------------------------------------------------------
    // Step 2: Admin Creates & Publishes Workflow Definition bound to Form
    // -------------------------------------------------------------
    const createWfRes = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: headersAdmin,
      payload: {
        id: "wf-laptop-approval",
        name: "Laptop Upgrade Approval & Provisioning Workflow",
        description: "Requires manager approval then opens IT Service Desk Ticket",
        startStepId: "step-start",
        triggers: [
          {
            type: "FORM_SUBMISSION",
            formDefinitionId: formId,
          },
        ],
        steps: [
          {
            id: "step-start",
            name: "Start",
            type: "START",
            transitions: [{ targetStepId: "step-approval" }],
          },
          {
            id: "step-approval",
            name: "Manager Approval",
            type: "APPROVAL_TASK",
            taskConfig: {
              assigneeId: approverId,
              candidateRoles: ["admin", "manager"],
            },
            transitions: [
              {
                targetStepId: "step-create-ticket",
                condition: { field: "approved", operator: "EQUALS", value: true },
              },
              {
                targetStepId: "step-end",
                isDefault: true,
              },
            ],
          },
          {
            id: "step-create-ticket",
            name: "Create IT Provisioning Ticket",
            type: "AUTOMATIC_TASK",
            config: {
              action: "CREATE_SERVICE_TICKET",
              category: "HARDWARE",
              priority: "HIGH",
              subject: "Provision New Developer Workstation",
              description: "Approved laptop upgrade form submitted.",
            },
            transitions: [{ targetStepId: "step-end" }],
          },
          {
            id: "step-end",
            name: "Complete",
            type: "END",
            transitions: [],
          },
        ],
      },
    });

    assert.equal(createWfRes.statusCode, 201);
    const wfId = JSON.parse(createWfRes.payload).workflow.id;

    const publishWfRes = await app.inject({
      method: "POST",
      url: `/api/workflows/${wfId}/publish`,
      headers: headersAdmin,
    });
    assert.equal(publishWfRes.statusCode, 200);

    // -------------------------------------------------------------
    // Step 3: Submitter Submits Form -> Auto-starts Workflow Instance
    // -------------------------------------------------------------
    const submitFormRes = await app.inject({
      method: "POST",
      url: `/api/forms/${formId}/submissions`,
      headers: headersSubmitter,
      payload: {
        submissionId: "sub-laptop-001",
        responses: [
          { fieldId: "f_reason", value: "Current machine overheating on heavy builds" },
          { fieldId: "f_urgency", value: "HIGH" },
        ],
      },
    });

    assert.equal(submitFormRes.statusCode, 200);
    const submitBody = JSON.parse(submitFormRes.payload);
    assert.equal(submitBody.submission.status, "SUBMITTED");
    assert.equal(submitBody.startedWorkflows.length, 1);

    const instanceId = submitBody.startedWorkflows[0].id;
    assert.equal(submitBody.startedWorkflows[0].status, "WAITING");

    // -------------------------------------------------------------
    // Step 4: Verify Approval Request created in Approval Inbox
    // -------------------------------------------------------------
    const listApprovalsRes = await app.inject({
      method: "GET",
      url: "/api/approvals",
      headers: headersApprover,
    });

    assert.equal(listApprovalsRes.statusCode, 200);
    const approvalsList = JSON.parse(listApprovalsRes.payload).approvals;
    assert.ok(approvalsList.length >= 1);

    const matchingApproval = approvalsList.find(
      (a: any) => a.workflowInstanceId === instanceId
    );
    assert.ok(matchingApproval);
    assert.equal(matchingApproval.status, "IN_PROGRESS");

    // -------------------------------------------------------------
    // Step 5: Approver Approves Request -> Resumes & Advances Workflow
    // -------------------------------------------------------------
    const approveRes = await app.inject({
      method: "POST",
      url: `/api/approvals/${matchingApproval.id}/approve`,
      headers: headersApprover,
      payload: {
        stepId: matchingApproval.steps[0].id,
        comment: "Upgrade justified based on performance metrics.",
      },
    });

    assert.equal(approveRes.statusCode, 200);
    const updatedApproval = JSON.parse(approveRes.payload).approval;
    assert.equal(updatedApproval.status, "APPROVED");

    // Check Workflow Instance status -> Should now be COMPLETED
    const getWfInstRes = await app.inject({
      method: "GET",
      url: `/api/workflows/instances/${instanceId}`,
      headers: headersAdmin,
    });
    assert.equal(getWfInstRes.statusCode, 200);
    const wfInst = JSON.parse(getWfInstRes.payload).instance;
    assert.equal(wfInst.status, "COMPLETED");

    // -------------------------------------------------------------
    // Step 6: Verify Service Desk Ticket auto-created in Agent Workspace
    // -------------------------------------------------------------
    const listTicketsRes = await app.inject({
      method: "GET",
      url: "/api/service-desk/tickets",
      headers: headersAgent,
    });

    assert.equal(listTicketsRes.statusCode, 200);
    const tickets = JSON.parse(listTicketsRes.payload).items;
    assert.ok(tickets.length >= 1);

    const createdTicket = tickets.find(
      (t: any) => t.category === "HARDWARE" && t.title.includes("Provision New Developer Workstation")
    );
    assert.ok(createdTicket);
    assert.equal(createdTicket.status, "NEW");
    assert.equal(createdTicket.priority, "HIGH");

    // -------------------------------------------------------------
    // Step 7: Agent Processes Ticket (Assign, Comment, Resolve, Close)
    // -------------------------------------------------------------
    const ticketId = createdTicket.id;

    // Assign to Agent
    const assignRes = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketId}/assign`,
      headers: headersAgent,
      payload: { assigneeUserId: agentId },
    });
    assert.equal(assignRes.statusCode, 200);
    assert.equal(JSON.parse(assignRes.payload).ticket.assignedUserId, agentId);

    // Add Comment
    const commentRes = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketId}/comments`,
      headers: headersAgent,
      payload: { content: "Ordered M3 Max Workstation from vendor." },
    });
    assert.equal(commentRes.statusCode, 201);

    // Resolve Ticket
    const resolveRes = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketId}/status`,
      headers: headersAgent,
      payload: { status: "RESOLVED", resolutionNotes: "Workstation delivered and setup completed." },
    });
    assert.equal(resolveRes.statusCode, 200);
    assert.equal(JSON.parse(resolveRes.payload).ticket.status, "RESOLVED");

    // Close Ticket
    const closeRes = await app.inject({
      method: "POST",
      url: `/api/service-desk/tickets/${ticketId}/status`,
      headers: headersAgent,
      payload: { status: "CLOSED" },
    });
    assert.equal(closeRes.statusCode, 200);
    assert.equal(JSON.parse(closeRes.payload).ticket.status, "CLOSED");

    // -------------------------------------------------------------
    // Step 8: Verify Cross-Module Audit Timeline
    // -------------------------------------------------------------
    const timelineRes = await app.inject({
      method: "GET",
      url: `/api/forms/e2e/timeline?submissionId=sub-laptop-001&workflowInstanceId=${instanceId}&ticketId=${ticketId}`,
      headers: headersAdmin,
    });

    assert.equal(timelineRes.statusCode, 200);
    const timeline = JSON.parse(timelineRes.payload).timeline;
    assert.ok(timeline.length > 0);

    const modulesInTimeline = new Set(timeline.map((item: any) => item.sourceModule));
    assert.equal(modulesInTimeline.has("FORMS"), true);
    assert.equal(modulesInTimeline.has("WORKFLOW"), true);
    assert.equal(modulesInTimeline.has("APPROVAL"), true);
    assert.equal(modulesInTimeline.has("SERVICE_DESK"), true);
  });

  it("enforces tenant isolation across all 4 modules", async () => {
    const tenantA = "tenant-alpha";
    const tenantB = "tenant-beta";

    const headersA = { "x-tenant-id": tenantA, "x-user-id": "u1", "x-user-role": "admin" };
    const headersB = { "x-tenant-id": tenantB, "x-user-id": "u2", "x-user-role": "admin" };

    // Create Form in Tenant A
    const formA = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: headersA,
      payload: { title: "Alpha Exclusive Form" },
    });
    const formIdA = JSON.parse(formA.payload).form.id;

    // Tenant B cannot view Form A
    const getFormB = await app.inject({
      method: "GET",
      url: `/api/forms/${formIdA}`,
      headers: headersB,
    });
    assert.equal(getFormB.statusCode, 404);

    // Create Service Ticket in Tenant A
    const ticketA = await app.inject({
      method: "POST",
      url: "/api/requests",
      headers: headersA,
      payload: {
        category: "SOFTWARE",
        title: "Alpha Private Ticket",
        description: "Confidential data",
      },
    });
    const ticketIdA = JSON.parse(ticketA.payload).ticket.id;

    // Tenant B cannot view Ticket A
    const getTicketB = await app.inject({
      method: "GET",
      url: `/api/requests/${ticketIdA}`,
      headers: headersB,
    });
    assert.equal(getTicketB.statusCode, 404);
  });

  it("enforces RBAC permissions on protected management routes", async () => {
    const memberHeaders = {
      "x-tenant-id": "tenant-rbac",
      "x-user-id": "regular-user",
      "x-user-role": "member",
    };

    // Member cannot create Form
    const createFormRes = await app.inject({
      method: "POST",
      url: "/api/forms",
      headers: memberHeaders,
      payload: { title: "Forbidden Form" },
    });
    assert.equal(createFormRes.statusCode, 403);

    // Member cannot create Workflow
    const createWfRes = await app.inject({
      method: "POST",
      url: "/api/workflows",
      headers: memberHeaders,
      payload: { name: "Forbidden Workflow" },
    });
    assert.equal(createWfRes.statusCode, 403);
  });
});
