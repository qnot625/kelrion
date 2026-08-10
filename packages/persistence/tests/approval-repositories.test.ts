import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ApprovalEngineService } from "@adminops/approvals";
import type { Database } from "../src/database.js";
import * as schema from "../src/schema.js";
import { runMigrations } from "../src/connect.js";
import { PostgresApprovalPolicyRepository, PostgresApprovalRequestRepository } from "../src/postgres-approval-repository.js";
import { PostgresTenantRepository } from "../src/postgres-tenant-repository.js";

async function freshDatabase(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  await runMigrations(db);
  return db;
}

test("persists immutable approval policy versions and staged decisions", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const tenant = await tenants.create({ name: "Approvals Co", slug: "approvals-co" });
  const policies = new PostgresApprovalPolicyRepository(db);
  const requests = new PostgresApprovalRequestRepository(db);
  const service = new ApprovalEngineService(policies, requests);
  const requester = crypto.randomUUID();
  const manager = crypto.randomUUID();
  const financeA = crypto.randomUUID();
  const financeB = crypto.randomUUID();

  const policy = await service.createPolicy({
    tenantId: tenant.id,
    name: "Spend approval",
    actorUserId: crypto.randomUUID(),
    stages: [
      { id: "manager", name: "Manager", mode: "ANY", approverUserIds: [manager], approverRoles: [] },
      { id: "finance", name: "Finance", mode: "QUORUM", approverUserIds: [financeA, financeB], approverRoles: [], requiredApprovals: 2 },
    ],
  });
  await service.publishPolicy(tenant.id, policy.id, crypto.randomUUID());
  const request = await service.createRequest({ tenantId: tenant.id, policyId: policy.id, title: "Laptop", requestedByUserId: requester });

  await service.decide({ tenantId: tenant.id, id: request.id, actorUserId: manager, actorRoles: [], decision: "APPROVE" });
  await service.decide({ tenantId: tenant.id, id: request.id, actorUserId: financeA, actorRoles: [], decision: "APPROVE" });
  const approved = await service.decide({ tenantId: tenant.id, id: request.id, actorUserId: financeB, actorRoles: [], decision: "APPROVE" });
  assert.equal(approved.status, "APPROVED");
  assert.equal((await requests.findById(tenant.id, request.id))?.decisions.length, 3);

  const revised = await service.updatePolicy({
    tenantId: tenant.id,
    id: policy.id,
    actorUserId: crypto.randomUUID(),
    stages: [{ id: "owner", name: "Owner", mode: "ANY", approverUserIds: [], approverRoles: ["owner"] }],
  });
  assert.equal(revised.version, 2);
  assert.equal((await policies.findPublishedVersion(tenant.id, policy.id, 1))?.stages[0]?.id, "manager");
});

test("approval repositories enforce tenant isolation and source idempotency", async () => {
  const db = await freshDatabase();
  const tenants = new PostgresTenantRepository(db);
  const alpha = await tenants.create({ name: "Alpha", slug: "approval-alpha" });
  const beta = await tenants.create({ name: "Beta", slug: "approval-beta" });
  const policies = new PostgresApprovalPolicyRepository(db);
  const requests = new PostgresApprovalRequestRepository(db);
  const service = new ApprovalEngineService(policies, requests);
  const policy = await service.createPolicy({ tenantId: alpha.id, name: "Workflow", actorUserId: crypto.randomUUID(), stages: [{ id: "review", name: "Review", mode: "ANY", approverUserIds: [], approverRoles: ["owner"] }] });
  await service.publishPolicy(alpha.id, policy.id, crypto.randomUUID());
  const input = { tenantId: alpha.id, policyId: policy.id, title: "Workflow approval", requestedByUserId: crypto.randomUUID(), sourceType: "WORKFLOW_TASK" as const, sourceReferenceId: "task-1", workflowTaskId: crypto.randomUUID() };
  const first = await service.createRequest(input);
  const second = await service.createRequest(input);
  assert.equal(first.id, second.id);
  assert.equal(await requests.findById(beta.id, first.id), null);
});
