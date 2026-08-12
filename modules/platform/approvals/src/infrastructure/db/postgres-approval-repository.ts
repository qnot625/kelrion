import { and, asc, desc, eq } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  ApprovalPolicy,
  ApprovalRequest,
  type ApprovalDecision,
  type ApprovalPolicyData,
  type ApprovalPolicyMetadata,
  type ApprovalPolicyRepository,
  type ApprovalRequestData,
  type ApprovalRequestRepository,
  type ApprovalRequestStatus,
  type ApprovalSourceType,
  type ApprovalStage,
} from "../../index.js";
import type { Database } from "@adminops/persistence";
import { tenants } from "@adminops/tenancy";

export const approvalPolicies = pgTable("approval_policies", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull(),
  currentVersion: integer("current_version").notNull(),
  stages: jsonb("stages").$type<ApprovalStage[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<ApprovalPolicyMetadata>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [index("approval_policies_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt)]);

export const approvalPolicyVersions = pgTable("approval_policy_versions", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  approvalPolicyId: uuid("approval_policy_id").notNull().references(() => approvalPolicies.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  stages: jsonb("stages").$type<ApprovalStage[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<ApprovalPolicyMetadata>().notNull().default({}),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.approvalPolicyId, table.version] }),
  index("approval_policy_versions_latest_idx").on(table.tenantId, table.approvalPolicyId, table.version),
]);

export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  approvalPolicyId: uuid("approval_policy_id").notNull().references(() => approvalPolicies.id, { onDelete: "cascade" }),
  policyVersion: integer("policy_version").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  requestedByUserId: uuid("requested_by_user_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceReferenceId: text("source_reference_id"),
  workflowTaskId: uuid("workflow_task_id"),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull(),
  currentStageIndex: integer("current_stage_index").notNull().default(0),
  stageStartedAt: timestamp("stage_started_at", { withTimezone: true }).notNull(),
  currentStageDueAt: timestamp("current_stage_due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
}, (table) => [
  index("approval_requests_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
  index("approval_requests_requester_idx").on(table.tenantId, table.requestedByUserId, table.updatedAt),
]);

export const approvalDecisions = pgTable("approval_decisions", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  approvalRequestId: uuid("approval_request_id").notNull().references(() => approvalRequests.id, { onDelete: "cascade" }),
  stageId: text("stage_id").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  decision: text("decision").notNull(),
  comment: text("comment").notNull().default(""),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
}, (table) => [index("approval_decisions_request_idx").on(table.tenantId, table.approvalRequestId, table.decidedAt)]);

type PolicyRow = typeof approvalPolicies.$inferSelect;
type VersionRow = typeof approvalPolicyVersions.$inferSelect;
type RequestRow = typeof approvalRequests.$inferSelect;
type DecisionRow = typeof approvalDecisions.$inferSelect;

function currentPolicy(row: PolicyRow): ApprovalPolicy {
  return new ApprovalPolicy({
    id: row.id, tenantId: row.tenantId, name: row.name, description: row.description,
    version: row.currentVersion, status: row.status as ApprovalPolicyData["status"], stages: row.stages,
    metadata: row.metadata, createdAt: row.createdAt, updatedAt: row.updatedAt,
    publishedAt: row.publishedAt, archivedAt: row.archivedAt,
  });
}

function publishedPolicy(row: VersionRow): ApprovalPolicy {
  return new ApprovalPolicy({
    id: row.approvalPolicyId, tenantId: row.tenantId, name: row.name, description: row.description,
    version: row.version, status: "PUBLISHED", stages: row.stages, metadata: row.metadata,
    createdAt: row.createdAt, updatedAt: row.publishedAt, publishedAt: row.publishedAt, archivedAt: null,
  });
}

function decisionFromRow(row: DecisionRow): ApprovalDecision {
  return { id: row.id, stageId: row.stageId, actorUserId: row.actorUserId, decision: row.decision as ApprovalDecision["decision"], comment: row.comment, decidedAt: row.decidedAt };
}

function requestFromRow(row: RequestRow, decisions: readonly ApprovalDecision[]): ApprovalRequest {
  return new ApprovalRequest({
    id: row.id,
    tenantId: row.tenantId,
    policyId: row.approvalPolicyId,
    policyVersion: row.policyVersion,
    title: row.title,
    description: row.description,
    requestedByUserId: row.requestedByUserId,
    sourceType: row.sourceType as ApprovalSourceType,
    sourceReferenceId: row.sourceReferenceId,
    workflowTaskId: row.workflowTaskId,
    context: row.context,
    status: row.status as ApprovalRequestStatus,
    currentStageIndex: row.currentStageIndex,
    stageStartedAt: row.stageStartedAt,
    currentStageDueAt: row.currentStageDueAt,
    decisions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    decidedAt: row.decidedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
  });
}

export class PostgresApprovalPolicyRepository implements ApprovalPolicyRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(approvalPolicies).where(and(eq(approvalPolicies.tenantId, tenantId), eq(approvalPolicies.id, id))).limit(1);
    return row ? currentPolicy(row) : null;
  }

  async listByTenant(tenantId: string) {
    return (await this.db.select().from(approvalPolicies).where(eq(approvalPolicies.tenantId, tenantId)).orderBy(desc(approvalPolicies.updatedAt))).map(currentPolicy);
  }

  async findPublishedVersion(tenantId: string, id: string, version: number) {
    const [row] = await this.db.select().from(approvalPolicyVersions).where(and(eq(approvalPolicyVersions.tenantId, tenantId), eq(approvalPolicyVersions.approvalPolicyId, id), eq(approvalPolicyVersions.version, version))).limit(1);
    return row ? publishedPolicy(row) : null;
  }

  async findLatestPublishedVersion(tenantId: string, id: string) {
    const [row] = await this.db.select().from(approvalPolicyVersions).where(and(eq(approvalPolicyVersions.tenantId, tenantId), eq(approvalPolicyVersions.approvalPolicyId, id))).orderBy(desc(approvalPolicyVersions.version)).limit(1);
    return row ? publishedPolicy(row) : null;
  }

  async listPublishedVersions(tenantId: string, id: string) {
    return (await this.db.select().from(approvalPolicyVersions).where(and(eq(approvalPolicyVersions.tenantId, tenantId), eq(approvalPolicyVersions.approvalPolicyId, id))).orderBy(desc(approvalPolicyVersions.version))).map(publishedPolicy);
  }

  async save(policy: ApprovalPolicy) {
    const data = policy.toPersistence();
    await this.db.insert(approvalPolicies).values({
      id: data.id, tenantId: data.tenantId, name: data.name, description: data.description,
      status: data.status, currentVersion: data.version, stages: [...data.stages], metadata: data.metadata,
      createdAt: data.createdAt, updatedAt: data.updatedAt, publishedAt: data.publishedAt, archivedAt: data.archivedAt,
    }).onConflictDoUpdate({
      target: approvalPolicies.id,
      set: { name: data.name, description: data.description, status: data.status, currentVersion: data.version, stages: [...data.stages], metadata: data.metadata, updatedAt: data.updatedAt, publishedAt: data.publishedAt, archivedAt: data.archivedAt },
    });
  }

  async savePublishedVersion(policy: ApprovalPolicy) {
    if (policy.status !== "PUBLISHED" || !policy.publishedAt) throw new Error("Published approval policy snapshot required");
    const data = policy.toPersistence();
    await this.db.insert(approvalPolicyVersions).values({
      tenantId: data.tenantId, approvalPolicyId: data.id, version: data.version, name: data.name,
      description: data.description, stages: [...data.stages], metadata: data.metadata,
      publishedAt: policy.publishedAt, createdAt: data.createdAt,
    }).onConflictDoNothing();
  }
}

export class PostgresApprovalRequestRepository implements ApprovalRequestRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(approvalRequests).where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.id, id))).limit(1);
    return row ? requestFromRow(row, await this.loadDecisions(tenantId, id)) : null;
  }

  async listByTenant(tenantId: string, status?: ApprovalRequestStatus) {
    const rows = status
      ? await this.db.select().from(approvalRequests).where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.status, status))).orderBy(desc(approvalRequests.updatedAt))
      : await this.db.select().from(approvalRequests).where(eq(approvalRequests.tenantId, tenantId)).orderBy(desc(approvalRequests.updatedAt));
    return Promise.all(rows.map(async (row) => requestFromRow(row, await this.loadDecisions(tenantId, row.id))));
  }

  async listByRequester(tenantId: string, userId: string) {
    const rows = await this.db.select().from(approvalRequests).where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.requestedByUserId, userId))).orderBy(desc(approvalRequests.updatedAt));
    return Promise.all(rows.map(async (row) => requestFromRow(row, await this.loadDecisions(tenantId, row.id))));
  }

  async findBySource(tenantId: string, sourceType: ApprovalSourceType, sourceReferenceId: string) {
    const rows = await this.db.select().from(approvalRequests).where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.sourceType, sourceType), eq(approvalRequests.sourceReferenceId, sourceReferenceId))).orderBy(desc(approvalRequests.updatedAt));
    return Promise.all(rows.map(async (row) => requestFromRow(row, await this.loadDecisions(tenantId, row.id))));
  }

  async save(request: ApprovalRequest) {
    const data = request.toPersistence();
    await this.db.insert(approvalRequests).values(this.values(data)).onConflictDoUpdate({
      target: approvalRequests.id,
      set: {
        title: data.title,
        description: data.description,
        context: { ...data.context },
        status: data.status,
        currentStageIndex: data.currentStageIndex,
        stageStartedAt: data.stageStartedAt,
        currentStageDueAt: data.currentStageDueAt,
        updatedAt: data.updatedAt,
        decidedAt: data.decidedAt,
        cancelledAt: data.cancelledAt,
        cancellationReason: data.cancellationReason,
      },
    });

    const persisted = new Set((await this.db.select({ id: approvalDecisions.id }).from(approvalDecisions).where(and(eq(approvalDecisions.tenantId, data.tenantId), eq(approvalDecisions.approvalRequestId, data.id)))).map((row) => row.id));
    for (const decision of data.decisions) {
      if (persisted.has(decision.id)) continue;
      await this.db.insert(approvalDecisions).values({
        id: decision.id, tenantId: data.tenantId, approvalRequestId: data.id, stageId: decision.stageId,
        actorUserId: decision.actorUserId, decision: decision.decision, comment: decision.comment, decidedAt: decision.decidedAt,
      });
    }
  }

  private values(data: ApprovalRequestData) {
    return {
      id: data.id, tenantId: data.tenantId, approvalPolicyId: data.policyId, policyVersion: data.policyVersion,
      title: data.title, description: data.description, requestedByUserId: data.requestedByUserId,
      sourceType: data.sourceType, sourceReferenceId: data.sourceReferenceId, workflowTaskId: data.workflowTaskId,
      context: { ...data.context }, status: data.status, currentStageIndex: data.currentStageIndex,
      stageStartedAt: data.stageStartedAt, currentStageDueAt: data.currentStageDueAt,
      createdAt: data.createdAt, updatedAt: data.updatedAt, decidedAt: data.decidedAt,
      cancelledAt: data.cancelledAt, cancellationReason: data.cancellationReason,
    };
  }

  private async loadDecisions(tenantId: string, requestId: string) {
    return (await this.db.select().from(approvalDecisions).where(and(eq(approvalDecisions.tenantId, tenantId), eq(approvalDecisions.approvalRequestId, requestId))).orderBy(asc(approvalDecisions.decidedAt))).map(decisionFromRow);
  }
}
