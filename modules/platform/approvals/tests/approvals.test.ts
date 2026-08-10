import assert from "node:assert/strict";
import { test } from "node:test";
import { ApprovalEngineService, ApprovalValidationError, InMemoryApprovalPolicyRepository, InMemoryApprovalRequestRepository, type ApprovalStage } from "../src/index.js";

function engine() {
  const policies = new InMemoryApprovalPolicyRepository();
  const requests = new InMemoryApprovalRequestRepository();
  return { policies, requests, service: new ApprovalEngineService(policies, requests) };
}

const twoStage: ApprovalStage[] = [
  { id: "manager", name: "Manager", mode: "ANY", approverUserIds: [], approverRoles: ["staff"], allowSelfApproval: false },
  { id: "finance", name: "Finance quorum", mode: "QUORUM", approverUserIds: ["finance-a", "finance-b", "finance-c"], approverRoles: [], requiredApprovals: 2, allowSelfApproval: false },
];

test("approval request advances through staged ANY and QUORUM decisions", async () => {
  const { service } = engine();
  const policy = await service.createPolicy({ tenantId: "tenant-a", name: "Purchase approval", stages: twoStage, actorUserId: "owner-a" });
  await service.publishPolicy("tenant-a", policy.id, "owner-a");
  const request = await service.createRequest({ tenantId: "tenant-a", policyId: policy.id, title: "Laptop purchase", requestedByUserId: "member-a" });
  assert.equal(request.status, "PENDING");
  assert.equal(request.currentStageIndex, 0);

  const managerDecision = await service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "staff-a", actorRoles: ["staff"], decision: "APPROVE" });
  assert.equal(managerDecision.status, "PENDING");
  assert.equal(managerDecision.currentStageIndex, 1);

  const firstFinance = await service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "finance-a", actorRoles: ["member"], decision: "APPROVE" });
  assert.equal(firstFinance.status, "PENDING");
  const final = await service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "finance-b", actorRoles: ["member"], decision: "APPROVE" });
  assert.equal(final.status, "APPROVED");
  assert.equal(final.decisions.length, 3);
});

test("a rejection is terminal and duplicate decisions are rejected", async () => {
  const { service } = engine();
  const policy = await service.createPolicy({ tenantId: "tenant-a", name: "Single", stages: [{ id: "review", name: "Review", mode: "QUORUM", approverUserIds: ["a", "b"], approverRoles: [], requiredApprovals: 2 }], actorUserId: "owner-a" });
  await service.publishPolicy("tenant-a", policy.id, "owner-a");
  const request = await service.createRequest({ tenantId: "tenant-a", policyId: policy.id, title: "Request", requestedByUserId: "requester" });
  await service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "a", actorRoles: [], decision: "APPROVE" });
  await assert.rejects(() => service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "a", actorRoles: [], decision: "APPROVE" }), /already decided/);
  const rejected = await service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "b", actorRoles: [], decision: "REJECT", comment: "Budget unavailable" });
  assert.equal(rejected.status, "REJECTED");
  await assert.rejects(() => service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "a", actorRoles: [], decision: "APPROVE" }), /REJECTED/);
});

test("self approval is denied unless the stage explicitly allows it", async () => {
  const { service } = engine();
  const policy = await service.createPolicy({ tenantId: "tenant-a", name: "Self guard", stages: [{ id: "owner", name: "Owner", mode: "ANY", approverUserIds: [], approverRoles: ["owner"], allowSelfApproval: false }], actorUserId: "owner-a" });
  await service.publishPolicy("tenant-a", policy.id, "owner-a");
  const request = await service.createRequest({ tenantId: "tenant-a", policyId: policy.id, title: "Own request", requestedByUserId: "owner-a" });
  await assert.rejects(() => service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "owner-a", actorRoles: ["owner"], decision: "APPROVE" }), /not eligible/);
});

test("published policy versions remain immutable for in-flight requests", async () => {
  const { service } = engine();
  const policy = await service.createPolicy({ tenantId: "tenant-a", name: "Versioned", stages: [{ id: "v1", name: "V1", mode: "ANY", approverUserIds: ["approver-a"], approverRoles: [] }], actorUserId: "owner-a" });
  await service.publishPolicy("tenant-a", policy.id, "owner-a");
  const request = await service.createRequest({ tenantId: "tenant-a", policyId: policy.id, title: "Version one request", requestedByUserId: "member-a" });
  const revision = await service.updatePolicy({ tenantId: "tenant-a", id: policy.id, stages: [{ id: "v2", name: "V2", mode: "ANY", approverUserIds: ["approver-b"], approverRoles: [] }], actorUserId: "owner-a" });
  assert.equal(revision.version, 2);
  await service.publishPolicy("tenant-a", policy.id, "owner-a");
  const final = await service.decide({ tenantId: "tenant-a", id: request.id, actorUserId: "approver-a", actorRoles: [], decision: "APPROVE" });
  assert.equal(final.policyVersion, 1);
  assert.equal(final.status, "APPROVED");
});

test("source references make request creation idempotent per policy version", async () => {
  const { service } = engine();
  const policy = await service.createPolicy({ tenantId: "tenant-a", name: "Workflow approvals", stages: [{ id: "owner", name: "Owner", mode: "ANY", approverUserIds: [], approverRoles: ["owner"] }], actorUserId: "owner-a" });
  await service.publishPolicy("tenant-a", policy.id, "owner-a");
  const input = { tenantId: "tenant-a", policyId: policy.id, title: "Workflow approval", requestedByUserId: "member-a", sourceType: "WORKFLOW_TASK" as const, sourceReferenceId: "task-a", workflowTaskId: "task-a" };
  const first = await service.createRequest(input);
  const second = await service.createRequest(input);
  assert.equal(first.id, second.id);
});

test("due dates identify overdue pending approvals", async () => {
  const { service } = engine();
  const policy = await service.createPolicy({ tenantId: "tenant-a", name: "Timed", stages: [{ id: "fast", name: "Fast", mode: "ANY", approverUserIds: ["approver"], approverRoles: [], dueInMinutes: 1 }], actorUserId: "owner-a" });
  await service.publishPolicy("tenant-a", policy.id, "owner-a");
  const request = await service.createRequest({ tenantId: "tenant-a", policyId: policy.id, title: "Timed request", requestedByUserId: "member-a" });
  assert.equal(request.isOverdue, false);
  assert.ok(request.currentStageDueAt);
});

test("invalid approval policies are rejected at publication", async () => {
  const { service } = engine();
  const policy = await service.createPolicy({ tenantId: "tenant-a", name: "Invalid", stages: [{ id: "bad", name: "Bad", mode: "ALL_NAMED", approverUserIds: [], approverRoles: ["owner"] }], actorUserId: "owner-a" });
  await assert.rejects(() => service.publishPolicy("tenant-a", policy.id, "owner-a"), ApprovalValidationError);
});
