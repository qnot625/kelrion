import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModuleKey } from "@adminops/control-plane";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup(name: string, slug: string, enabledModules: ModuleKey[] = ["service-desk", "forms", "workflow", "approvals"]) {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name, slug, enabledModules });
  return buildServer(context);
}

async function signup(app: ReturnType<typeof buildServer>, slug: string, email: string) {
  const response = await app.inject({ method: "POST", url: "/auth/signup", headers: { "x-tenant-slug": slug }, payload: { email, password: "test-password" } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}

function headers(slug: string, token: string) { return { "x-tenant-slug": slug, authorization: `Bearer ${token}` }; }

test("published catalogue request validates a submitted form and starts its fulfilment workflow", async () => {
  const app = await setup("Service Catalogue", "service-catalogue");
  const owner = await signup(app, "service-catalogue", "owner@catalogue.test");
  const member = await signup(app, "service-catalogue", "member@catalogue.test");

  const formCreate = await app.inject({
    method: "POST", url: "/forms", headers: headers("service-catalogue", owner.token),
    payload: { title: "Equipment request", fields: [{ id: "reason", label: "Reason", type: "text", validationRules: [{ type: "required", message: "Reason is required" }] }] },
  });
  assert.equal(formCreate.statusCode, 201, formCreate.body);
  const formId = (formCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/forms/${formId}/publish`, headers: headers("service-catalogue", owner.token) })).statusCode, 200);

  const draft = await app.inject({
    method: "POST", url: `/forms/${formId}/drafts`, headers: headers("service-catalogue", member.token),
    payload: { responses: [{ fieldId: "reason", value: "New starter workstation" }] },
  });
  assert.equal(draft.statusCode, 201, draft.body);
  const submissionId = (draft.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/form-submissions/${submissionId}/submit`, headers: headers("service-catalogue", member.token), payload: {} })).statusCode, 200);

  const workflowCreate = await app.inject({
    method: "POST", url: "/workflow-definitions", headers: headers("service-catalogue", owner.token),
    payload: {
      name: "Equipment fulfilment",
      steps: [
        { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "end" }] },
        { id: "end", name: "End", type: "END", transitions: [] },
      ],
    },
  });
  assert.equal(workflowCreate.statusCode, 201, workflowCreate.body);
  const workflowId = (workflowCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/workflow-definitions/${workflowId}/publish`, headers: headers("service-catalogue", owner.token) })).statusCode, 200);

  const itemCreate = await app.inject({
    method: "POST", url: "/service-desk/catalog", headers: headers("service-catalogue", owner.token),
    payload: {
      key: "equipment-request",
      name: "Equipment request",
      description: "Request standard work equipment",
      intakeMode: "FORM",
      formDefinitionId: formId,
      workflowDefinitionId: workflowId,
      defaultTicketType: "SERVICE_REQUEST",
      defaultPriority: "MEDIUM",
      assignmentGroupId: "it-fulfilment",
      tags: ["employee-service"],
    },
  });
  assert.equal(itemCreate.statusCode, 201, itemCreate.body);
  const itemId = (itemCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/service-desk/catalog/${itemId}/publish`, headers: headers("service-catalogue", owner.token) })).statusCode, 200);

  const request = await app.inject({
    method: "POST", url: `/service-desk/catalog/${itemId}/request`, headers: headers("service-catalogue", member.token),
    payload: { formSubmissionId: submissionId, context: { deviceClass: "laptop" } },
  });
  assert.equal(request.statusCode, 201, request.body);
  const result = request.json() as {
    ticket: { id: string; source: string; workflowInstanceId: string | null; approvalRequestId: string | null; assignmentGroupId: string | null; tags: string[] };
    workflowInstance: { id: string; status: string; variables: Record<string, unknown> } | null;
    approvalRequest: unknown;
  };
  assert.equal(result.ticket.source, "FORM");
  assert.equal(result.ticket.assignmentGroupId, "it-fulfilment");
  assert.ok(result.ticket.tags.includes("catalog:equipment-request"));
  assert.equal(result.ticket.workflowInstanceId, result.workflowInstance?.id);
  assert.equal(result.ticket.approvalRequestId, null);
  assert.equal(result.workflowInstance?.status, "COMPLETED");
  assert.equal(result.workflowInstance?.variables.formSubmissionId, submissionId);
  assert.equal(result.approvalRequest, null);

  const mine = await app.inject({ method: "GET", url: "/service-desk/tickets?scope=mine", headers: headers("service-catalogue", member.token) });
  assert.equal(mine.statusCode, 200, mine.body);
  assert.equal((mine.json() as Array<{ id: string }>)[0]?.id, result.ticket.id);
});

test("catalogue publication requires published bindings and direct approvals are linked to tickets", async () => {
  const app = await setup("Governed Services", "governed-services");
  const owner = await signup(app, "governed-services", "owner@governed.test");
  const member = await signup(app, "governed-services", "member@governed.test");

  const draftForm = await app.inject({ method: "POST", url: "/forms", headers: headers("governed-services", owner.token), payload: { title: "Unpublished form", fields: [{ id: "note", label: "Note", type: "text" }] } });
  const draftFormId = (draftForm.json() as { id: string }).id;
  const invalidItem = await app.inject({ method: "POST", url: "/service-desk/catalog", headers: headers("governed-services", owner.token), payload: { key: "invalid-binding", name: "Invalid", intakeMode: "FORM", formDefinitionId: draftFormId } });
  const invalidItemId = (invalidItem.json() as { id: string }).id;
  const invalidPublish = await app.inject({ method: "POST", url: `/service-desk/catalog/${invalidItemId}/publish`, headers: headers("governed-services", owner.token) });
  assert.equal(invalidPublish.statusCode, 400, invalidPublish.body);

  const policyCreate = await app.inject({
    method: "POST", url: "/approval-policies", headers: headers("governed-services", owner.token),
    payload: { name: "HR approval", stages: [{ id: "owner", name: "Owner", mode: "ANY", approverUserIds: [], approverRoles: ["owner"], allowSelfApproval: false }] },
  });
  assert.equal(policyCreate.statusCode, 201, policyCreate.body);
  const policyId = (policyCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/approval-policies/${policyId}/publish`, headers: headers("governed-services", owner.token) })).statusCode, 200);

  const itemCreate = await app.inject({
    method: "POST", url: "/service-desk/catalog", headers: headers("governed-services", owner.token),
    payload: { key: "employment-letter", name: "Employment letter", approvalPolicyId: policyId, defaultTicketType: "SERVICE_REQUEST", defaultPriority: "LOW", categoryKey: "hr" },
  });
  const itemId = (itemCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/service-desk/catalog/${itemId}/publish`, headers: headers("governed-services", owner.token) })).statusCode, 200);

  const serviceRequest = await app.inject({ method: "POST", url: `/service-desk/catalog/${itemId}/request`, headers: headers("governed-services", member.token), payload: { description: "Please issue an employment confirmation letter" } });
  assert.equal(serviceRequest.statusCode, 201, serviceRequest.body);
  const result = serviceRequest.json() as { ticket: { id: string; approvalRequestId: string | null; workflowInstanceId: string | null }; approvalRequest: { id: string; status: string; sourceReferenceId: string } | null };
  assert.equal(result.ticket.workflowInstanceId, null);
  assert.equal(result.ticket.approvalRequestId, result.approvalRequest?.id);
  assert.equal(result.approvalRequest?.status, "PENDING");
  assert.equal(result.approvalRequest?.sourceReferenceId, result.ticket.id);

  const actionable = await app.inject({ method: "GET", url: "/approval-requests?scope=actionable", headers: headers("governed-services", owner.token) });
  assert.equal(actionable.statusCode, 200, actionable.body);
  assert.ok((actionable.json() as Array<{ id: string }>).some((approval) => approval.id === result.approvalRequest?.id));
});
