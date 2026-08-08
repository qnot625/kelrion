import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup(name: string, slug: string, enabledModules: string[] = ["workflow"]) {
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

const reviewSteps = [
  { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "route" }] },
  {
    id: "route",
    name: "Route request",
    type: "AUTOMATIC_TASK",
    automaticConfig: { operation: "SET_VARIABLES", values: { routed: true } },
    transitions: [
      { targetStepId: "review", condition: { field: "amount", operator: "GREATER_THAN", value: 1000 } },
      { targetStepId: "end", isDefault: true },
    ],
  },
  { id: "review", name: "Owner review", type: "MANUAL_TASK", taskConfig: { candidateRoles: ["owner"] }, transitions: [{ targetStepId: "end" }] },
  { id: "end", name: "End", type: "END", transitions: [] },
];

async function createPublishedWorkflow(app: ReturnType<typeof buildServer>, slug: string, token: string, body: Record<string, unknown>) {
  const create = await app.inject({ method: "POST", url: "/workflow-definitions", headers: headers(slug, token), payload: body });
  assert.equal(create.statusCode, 201, create.body);
  const definition = create.json() as { id: string };
  const publish = await app.inject({ method: "POST", url: `/workflow-definitions/${definition.id}/publish`, headers: headers(slug, token) });
  assert.equal(publish.statusCode, 200, publish.body);
  return definition.id;
}

test("workflow API enforces design RBAC and human-task eligibility", async () => {
  const app = await setup("Workflow Co", "workflow-co");
  const owner = await signup(app, "workflow-co", "owner@workflow.co");
  const member = await signup(app, "workflow-co", "member@workflow.co");

  const forbidden = await app.inject({ method: "POST", url: "/workflow-definitions", headers: headers("workflow-co", member.token), payload: { name: "Nope" } });
  assert.equal(forbidden.statusCode, 403, forbidden.body);

  const definitionId = await createPublishedWorkflow(app, "workflow-co", owner.token, { name: "Expense route", steps: reviewSteps });
  const start = await app.inject({ method: "POST", url: `/workflow-definitions/${definitionId}/start`, headers: headers("workflow-co", member.token), payload: { variables: { amount: 2500 } } });
  assert.equal(start.statusCode, 201, start.body);
  const instance = start.json() as { id: string; status: string; currentStepId: string; variables: Record<string, unknown> };
  assert.equal(instance.status, "WAITING");
  assert.equal(instance.currentStepId, "review");
  assert.equal(instance.variables.routed, true);

  const memberTasks = await app.inject({ method: "GET", url: "/workflow-tasks", headers: headers("workflow-co", member.token) });
  assert.equal(memberTasks.statusCode, 200, memberTasks.body);
  assert.equal((memberTasks.json() as unknown[]).length, 0);

  const ownerTasks = await app.inject({ method: "GET", url: "/workflow-tasks", headers: headers("workflow-co", owner.token) });
  assert.equal(ownerTasks.statusCode, 200, ownerTasks.body);
  const task = (ownerTasks.json() as Array<{ id: string }>)[0];
  assert.ok(task);
  const complete = await app.inject({ method: "POST", url: `/workflow-tasks/${task.id}/complete`, headers: headers("workflow-co", owner.token), payload: { output: { reviewed: true } } });
  assert.equal(complete.statusCode, 200, complete.body);
  assert.equal((complete.json() as { instance: { status: string } }).instance.status, "COMPLETED");
});

test("submitted forms start matching published workflows exactly once", async () => {
  const app = await setup("Automation Co", "automation-co");
  const owner = await signup(app, "automation-co", "owner@automation.co");
  const member = await signup(app, "automation-co", "member@automation.co");

  const formCreate = await app.inject({ method: "POST", url: "/forms", headers: headers("automation-co", owner.token), payload: { title: "Purchase request", fields: [{ id: "amount", label: "Amount", type: "number", validationRules: [{ type: "required", message: "Amount required" }] }] } });
  assert.equal(formCreate.statusCode, 201, formCreate.body);
  const formId = (formCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/forms/${formId}/publish`, headers: headers("automation-co", owner.token) })).statusCode, 200);

  const definitionId = await createPublishedWorkflow(app, "automation-co", owner.token, {
    name: "Purchase intake",
    triggers: [{ type: "FORM_SUBMISSION", formDefinitionId: formId }],
    steps: [
      { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "end" }] },
      { id: "end", name: "End", type: "END", transitions: [] },
    ],
  });
  assert.ok(definitionId);

  const draft = await app.inject({ method: "POST", url: `/forms/${formId}/drafts`, headers: headers("automation-co", member.token), payload: { responses: [{ fieldId: "amount", value: 500 }] } });
  assert.equal(draft.statusCode, 201, draft.body);
  const submissionId = (draft.json() as { id: string }).id;
  const submit = await app.inject({ method: "POST", url: `/form-submissions/${submissionId}/submit`, headers: headers("automation-co", member.token), payload: {} });
  assert.equal(submit.statusCode, 200, submit.body);

  const instances = await app.inject({ method: "GET", url: "/workflow-instances", headers: headers("automation-co", owner.token) });
  assert.equal(instances.statusCode, 200, instances.body);
  const matching = (instances.json() as Array<{ workflowDefinitionId: string; sourceType: string; sourceReferenceId: string; status: string }>).filter((item) => item.workflowDefinitionId === definitionId);
  assert.equal(matching.length, 1);
  assert.equal(matching[0]?.sourceType, "FORM_SUBMISSION");
  assert.equal(matching[0]?.sourceReferenceId, submissionId);
  assert.equal(matching[0]?.status, "COMPLETED");
});

test("workflow API is tenant isolated and entitlement guarded", async () => {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name: "Alpha", slug: "alpha-workflow", enabledModules: ["workflow"] });
  await context.controlPlaneService.provisionTenant({ name: "Beta", slug: "beta-workflow", enabledModules: ["workflow"] });
  await context.controlPlaneService.provisionTenant({ name: "Disabled", slug: "disabled-workflow", enabledModules: ["forms"] });
  const app = buildServer(context);
  const alpha = await signup(app, "alpha-workflow", "owner@alpha.workflow");
  const beta = await signup(app, "beta-workflow", "owner@beta.workflow");
  const disabled = await signup(app, "disabled-workflow", "owner@disabled.workflow");
  const definitionId = await createPublishedWorkflow(app, "alpha-workflow", alpha.token, { name: "Alpha only", steps: reviewSteps });

  const crossTenant = await app.inject({ method: "GET", url: `/workflow-definitions/${definitionId}`, headers: headers("beta-workflow", beta.token) });
  assert.equal(crossTenant.statusCode, 404, crossTenant.body);
  const blocked = await app.inject({ method: "GET", url: "/workflow-definitions", headers: headers("disabled-workflow", disabled.token) });
  assert.equal(blocked.statusCode, 403, blocked.body);
});
