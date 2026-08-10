import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModuleKey } from "@adminops/control-plane";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

async function setup(name: string, slug: string, enabledModules: ModuleKey[] = ["approvals"]) {
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

test("approval API resolves a waiting workflow and generic task completion cannot bypass the policy", async () => {
  const app = await setup("Approval Co", "approval-co");
  const owner = await signup(app, "approval-co", "owner@approval.co");
  const member = await signup(app, "approval-co", "member@approval.co");

  const policyCreate = await app.inject({
    method: "POST", url: "/approval-policies", headers: headers("approval-co", owner.token),
    payload: { name: "Owner approval", stages: [{ id: "owner", name: "Owner review", mode: "ANY", approverUserIds: [], approverRoles: ["owner"], allowSelfApproval: false }] },
  });
  assert.equal(policyCreate.statusCode, 201, policyCreate.body);
  const policyId = (policyCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/approval-policies/${policyId}/publish`, headers: headers("approval-co", owner.token) })).statusCode, 200);

  const workflowCreate = await app.inject({
    method: "POST", url: "/workflow-definitions", headers: headers("approval-co", owner.token),
    payload: {
      name: "Governed request",
      steps: [
        { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "approval" }] },
        {
          id: "approval", name: "Owner approval", type: "APPROVAL_TASK",
          taskConfig: { candidateRoles: ["owner"], dueInMinutes: 60 },
          metadata: { approvalPolicyId: policyId },
          transitions: [
            { targetStepId: "approved", condition: { field: "approvalDecision", operator: "EQUALS", value: "APPROVED" } },
            { targetStepId: "rejected", isDefault: true },
          ],
        },
        { id: "approved", name: "Approved end", type: "END", transitions: [] },
        { id: "rejected", name: "Rejected end", type: "END", transitions: [] },
      ],
    },
  });
  assert.equal(workflowCreate.statusCode, 201, workflowCreate.body);
  const workflowId = (workflowCreate.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/workflow-definitions/${workflowId}/publish`, headers: headers("approval-co", owner.token) })).statusCode, 200);

  const start = await app.inject({ method: "POST", url: `/workflow-definitions/${workflowId}/start`, headers: headers("approval-co", member.token), payload: { variables: { amount: 5000 } } });
  assert.equal(start.statusCode, 201, start.body);
  const instance = start.json() as { id: string; status: string };
  assert.equal(instance.status, "WAITING");

  const tasks = await app.inject({ method: "GET", url: "/workflow-tasks?scope=all", headers: headers("approval-co", owner.token) });
  assert.equal(tasks.statusCode, 200, tasks.body);
  const task = (tasks.json() as Array<{ id: string; kind: string }>).find((item) => item.kind === "APPROVAL");
  assert.ok(task);

  const bypass = await app.inject({ method: "POST", url: `/workflow-tasks/${task.id}/complete`, headers: headers("approval-co", owner.token), payload: { output: { approvalDecision: "APPROVED" } } });
  assert.equal(bypass.statusCode, 400, bypass.body);

  const actionable = await app.inject({ method: "GET", url: "/approval-requests?scope=actionable", headers: headers("approval-co", owner.token) });
  assert.equal(actionable.statusCode, 200, actionable.body);
  const approval = (actionable.json() as Array<{ id: string; workflowTaskId: string; status: string }>)[0];
  assert.ok(approval);
  assert.equal(approval.workflowTaskId, task.id);
  assert.equal(approval.status, "PENDING");

  const approve = await app.inject({ method: "POST", url: `/approval-requests/${approval.id}/approve`, headers: headers("approval-co", owner.token), payload: { comment: "Approved" } });
  assert.equal(approve.statusCode, 200, approve.body);
  assert.equal((approve.json() as { status: string }).status, "APPROVED");

  const resolved = await app.inject({ method: "GET", url: `/workflow-instances/${instance.id}`, headers: headers("approval-co", member.token) });
  assert.equal(resolved.statusCode, 200, resolved.body);
  const resolvedBody = resolved.json() as { status: string; variables: Record<string, unknown> };
  assert.equal(resolvedBody.status, "COMPLETED");
  assert.equal(resolvedBody.variables.approvalDecision, "APPROVED");
});

test("approval API prevents self approval, preserves named-member decisions and isolates tenants", async () => {
  const context = createAppContext();
  await context.controlPlaneService.provisionTenant({ name: "Alpha", slug: "alpha-approval", enabledModules: ["approvals"] });
  await context.controlPlaneService.provisionTenant({ name: "Beta", slug: "beta-approval", enabledModules: ["approvals"] });
  await context.controlPlaneService.provisionTenant({ name: "Disabled", slug: "disabled-approval", enabledModules: ["forms"] });
  const app = buildServer(context);
  const alpha = await signup(app, "alpha-approval", "owner@alpha.approval");
  const alphaMember = await signup(app, "alpha-approval", "member@alpha.approval");
  const beta = await signup(app, "beta-approval", "owner@beta.approval");
  const disabled = await signup(app, "disabled-approval", "owner@disabled.approval");

  const policyCreate = await app.inject({
    method: "POST", url: "/approval-policies", headers: headers("alpha-approval", alpha.token),
    payload: { name: "Named member", stages: [{ id: "member", name: "Member", mode: "ANY", approverUserIds: [alphaMember.userId], approverRoles: [], allowSelfApproval: false }] },
  });
  assert.equal(policyCreate.statusCode, 201, policyCreate.body);
  const policyId = (policyCreate.json() as { id: string }).id;
  await app.inject({ method: "POST", url: `/approval-policies/${policyId}/publish`, headers: headers("alpha-approval", alpha.token) });

  const created = await app.inject({ method: "POST", url: "/approval-requests", headers: headers("alpha-approval", alpha.token), payload: { policyId, title: "Member approval" } });
  assert.equal(created.statusCode, 201, created.body);
  const requestId = (created.json() as { id: string }).id;
  assert.equal((await app.inject({ method: "POST", url: `/approval-requests/${requestId}/approve`, headers: headers("alpha-approval", alpha.token), payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: `/approval-requests/${requestId}/approve`, headers: headers("alpha-approval", alphaMember.token), payload: {} })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: `/approval-policies/${policyId}`, headers: headers("beta-approval", beta.token) })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/approval-policies", headers: headers("disabled-approval", disabled.token) })).statusCode, 403);
});
