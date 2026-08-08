import { and, desc, eq, notInArray } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  HumanTask,
  WorkflowDefinition,
  WorkflowInstance,
  type HumanTaskData,
  type HumanTaskRepository,
  type HumanTaskStatus,
  type WorkflowDefinitionData,
  type WorkflowDefinitionRepository,
  type WorkflowExecutionEntry,
  type WorkflowInstanceData,
  type WorkflowInstanceRepository,
  type WorkflowInstanceStatus,
  type WorkflowMetadata,
  type WorkflowStep,
  type WorkflowTrigger,
  type WorkflowTriggerType,
} from "@adminops/workflow";
import type { Database } from "./database.js";
import { tenants, users } from "./schema.js";

const workflowDefinitions = pgTable("workflow_definitions", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull(),
  currentVersion: integer("current_version").notNull(),
  startStepId: text("start_step_id").notNull(),
  steps: jsonb("steps").notNull().default([]),
  triggers: jsonb("triggers").notNull().default([]),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [index("workflow_definitions_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt)]);

const workflowDefinitionVersions = pgTable("workflow_definition_versions", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workflowDefinitionId: uuid("workflow_definition_id").notNull().references(() => workflowDefinitions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  startStepId: text("start_step_id").notNull(),
  steps: jsonb("steps").notNull().default([]),
  triggers: jsonb("triggers").notNull().default([]),
  metadata: jsonb("metadata").notNull().default({}),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.workflowDefinitionId, table.version] }),
  index("workflow_definition_versions_latest_idx").on(table.tenantId, table.workflowDefinitionId, table.version),
]);

const workflowInstances = pgTable("workflow_instances", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workflowDefinitionId: uuid("workflow_definition_id").notNull().references(() => workflowDefinitions.id, { onDelete: "cascade" }),
  workflowVersion: integer("workflow_version").notNull(),
  status: text("status").notNull(),
  currentStepId: text("current_step_id"),
  variables: jsonb("variables").notNull().default({}),
  executionHistory: jsonb("execution_history").notNull().default([]),
  startedByUserId: uuid("started_by_user_id").notNull(),
  sourceType: text("source_type").notNull(),
  sourceReferenceId: text("source_reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
}, (table) => [
  index("workflow_instances_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
  index("workflow_instances_definition_idx").on(table.tenantId, table.workflowDefinitionId, table.updatedAt),
  index("workflow_instances_source_idx").on(table.tenantId, table.sourceType, table.sourceReferenceId),
]);

const workflowHumanTasks = pgTable("workflow_human_tasks", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  workflowInstanceId: uuid("workflow_instance_id").notNull().references(() => workflowInstances.id, { onDelete: "cascade" }),
  workflowDefinitionId: uuid("workflow_definition_id").notNull().references(() => workflowDefinitions.id, { onDelete: "cascade" }),
  workflowVersion: integer("workflow_version").notNull(),
  stepId: text("step_id").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull(),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
  candidateUserIds: jsonb("candidate_user_ids").notNull().default([]),
  candidateRoles: jsonb("candidate_roles").notNull().default([]),
  formDefinitionId: uuid("form_definition_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  output: jsonb("output"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("workflow_human_tasks_tenant_status_idx").on(table.tenantId, table.status, table.dueAt),
  index("workflow_human_tasks_instance_step_idx").on(table.tenantId, table.workflowInstanceId, table.stepId, table.status),
  index("workflow_human_tasks_assignee_idx").on(table.tenantId, table.assigneeUserId, table.status),
]);

type DefinitionRow = typeof workflowDefinitions.$inferSelect;
type VersionRow = typeof workflowDefinitionVersions.$inferSelect;
type InstanceRow = typeof workflowInstances.$inferSelect;
type TaskRow = typeof workflowHumanTasks.$inferSelect;

function steps(value: unknown): WorkflowStep[] { return Array.isArray(value) ? value as WorkflowStep[] : []; }
function triggers(value: unknown): WorkflowTrigger[] { return Array.isArray(value) ? value as WorkflowTrigger[] : []; }
function metadata(value: unknown): WorkflowMetadata { return value && typeof value === "object" && !Array.isArray(value) ? value as WorkflowMetadata : {}; }

function currentDefinition(row: DefinitionRow): WorkflowDefinition {
  return new WorkflowDefinition({
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    version: row.currentVersion,
    status: row.status as WorkflowDefinitionData["status"],
    startStepId: row.startStepId,
    steps: steps(row.steps),
    triggers: triggers(row.triggers),
    metadata: metadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    archivedAt: row.archivedAt,
  });
}

function publishedDefinition(row: VersionRow): WorkflowDefinition {
  return new WorkflowDefinition({
    id: row.workflowDefinitionId,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    version: row.version,
    status: "PUBLISHED",
    startStepId: row.startStepId,
    steps: steps(row.steps),
    triggers: triggers(row.triggers),
    metadata: metadata(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.publishedAt,
    publishedAt: row.publishedAt,
    archivedAt: null,
  });
}

function executionHistory(value: unknown): WorkflowExecutionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const item = entry as Record<string, unknown>;
    return {
      stepId: String(item.stepId ?? ""),
      stepName: String(item.stepName ?? ""),
      stepType: item.stepType as WorkflowExecutionEntry["stepType"],
      status: item.status as WorkflowExecutionEntry["status"],
      startedAt: new Date(String(item.startedAt)),
      completedAt: item.completedAt ? new Date(String(item.completedAt)) : null,
      actorUserId: typeof item.actorUserId === "string" ? item.actorUserId : null,
      output: item.output && typeof item.output === "object" && !Array.isArray(item.output) ? item.output as Record<string, unknown> : null,
      error: typeof item.error === "string" ? item.error : null,
    };
  });
}

function instanceFromRow(row: InstanceRow): WorkflowInstance {
  return new WorkflowInstance({
    id: row.id,
    tenantId: row.tenantId,
    workflowDefinitionId: row.workflowDefinitionId,
    workflowVersion: row.workflowVersion,
    status: row.status as WorkflowInstanceData["status"],
    currentStepId: row.currentStepId,
    variables: row.variables && typeof row.variables === "object" && !Array.isArray(row.variables) ? row.variables as Record<string, unknown> : {},
    executionHistory: executionHistory(row.executionHistory),
    startedByUserId: row.startedByUserId,
    sourceType: row.sourceType as WorkflowTriggerType,
    sourceReferenceId: row.sourceReferenceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    failedAt: row.failedAt,
    failureReason: row.failureReason,
  });
}

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function taskFromRow(row: TaskRow): HumanTask {
  return new HumanTask({
    id: row.id,
    tenantId: row.tenantId,
    workflowInstanceId: row.workflowInstanceId,
    workflowDefinitionId: row.workflowDefinitionId,
    workflowVersion: row.workflowVersion,
    stepId: row.stepId,
    kind: row.kind as HumanTaskData["kind"],
    name: row.name,
    description: row.description,
    status: row.status as HumanTaskStatus,
    assigneeUserId: row.assigneeUserId,
    candidateUserIds: strings(row.candidateUserIds),
    candidateRoles: strings(row.candidateRoles),
    formDefinitionId: row.formDefinitionId,
    dueAt: row.dueAt,
    output: row.output && typeof row.output === "object" && !Array.isArray(row.output) ? row.output as Record<string, unknown> : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  });
}

export class PostgresWorkflowDefinitionRepository implements WorkflowDefinitionRepository {
  constructor(private readonly db: Database) {}
  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(workflowDefinitions).where(and(eq(workflowDefinitions.tenantId, tenantId), eq(workflowDefinitions.id, id))).limit(1);
    return row ? currentDefinition(row) : null;
  }
  async listByTenant(tenantId: string) { return (await this.db.select().from(workflowDefinitions).where(eq(workflowDefinitions.tenantId, tenantId)).orderBy(desc(workflowDefinitions.updatedAt))).map(currentDefinition); }
  async findPublishedVersion(tenantId: string, id: string, version: number) {
    const [row] = await this.db.select().from(workflowDefinitionVersions).where(and(eq(workflowDefinitionVersions.tenantId, tenantId), eq(workflowDefinitionVersions.workflowDefinitionId, id), eq(workflowDefinitionVersions.version, version))).limit(1);
    return row ? publishedDefinition(row) : null;
  }
  async findLatestPublishedVersion(tenantId: string, id: string) {
    const [row] = await this.db.select().from(workflowDefinitionVersions).where(and(eq(workflowDefinitionVersions.tenantId, tenantId), eq(workflowDefinitionVersions.workflowDefinitionId, id))).orderBy(desc(workflowDefinitionVersions.version)).limit(1);
    return row ? publishedDefinition(row) : null;
  }
  async listPublishedVersions(tenantId: string, id: string) { return (await this.db.select().from(workflowDefinitionVersions).where(and(eq(workflowDefinitionVersions.tenantId, tenantId), eq(workflowDefinitionVersions.workflowDefinitionId, id))).orderBy(desc(workflowDefinitionVersions.version))).map(publishedDefinition); }
  async findPublishedByTrigger(tenantId: string, triggerType: WorkflowTriggerType, reference?: string | null) {
    const current = await this.listByTenant(tenantId);
    const results: WorkflowDefinition[] = [];
    for (const item of current) {
      if (item.status === "ARCHIVED") continue;
      const published = await this.findLatestPublishedVersion(tenantId, item.id);
      if (!published) continue;
      if (published.triggers.some((trigger) => trigger.type === triggerType && (triggerType === "FORM_SUBMISSION" ? trigger.formDefinitionId === reference : triggerType === "EVENT" ? trigger.eventName === reference : true))) results.push(published);
    }
    return results;
  }
  async save(definition: WorkflowDefinition) {
    const data = definition.toPersistence();
    await this.db.insert(workflowDefinitions).values({ id: data.id, tenantId: data.tenantId, name: data.name, description: data.description, status: data.status, currentVersion: data.version, startStepId: data.startStepId, steps: data.steps as WorkflowStep[], triggers: data.triggers as WorkflowTrigger[], metadata: data.metadata as WorkflowMetadata, createdAt: data.createdAt, updatedAt: data.updatedAt, publishedAt: data.publishedAt, archivedAt: data.archivedAt }).onConflictDoUpdate({ target: workflowDefinitions.id, set: { name: data.name, description: data.description, status: data.status, currentVersion: data.version, startStepId: data.startStepId, steps: data.steps as WorkflowStep[], triggers: data.triggers as WorkflowTrigger[], metadata: data.metadata as WorkflowMetadata, updatedAt: data.updatedAt, publishedAt: data.publishedAt, archivedAt: data.archivedAt } });
  }
  async savePublishedVersion(definition: WorkflowDefinition) {
    if (definition.status !== "PUBLISHED" || !definition.publishedAt) throw new Error("Published workflow snapshot required");
    const data = definition.toPersistence();
    await this.db.insert(workflowDefinitionVersions).values({ tenantId: data.tenantId, workflowDefinitionId: data.id, version: data.version, name: data.name, description: data.description, startStepId: data.startStepId, steps: data.steps as WorkflowStep[], triggers: data.triggers as WorkflowTrigger[], metadata: data.metadata as WorkflowMetadata, publishedAt: definition.publishedAt, createdAt: data.createdAt }).onConflictDoUpdate({ target: [workflowDefinitionVersions.tenantId, workflowDefinitionVersions.workflowDefinitionId, workflowDefinitionVersions.version], set: { name: data.name, description: data.description, startStepId: data.startStepId, steps: data.steps as WorkflowStep[], triggers: data.triggers as WorkflowTrigger[], metadata: data.metadata as WorkflowMetadata, publishedAt: definition.publishedAt } });
  }
}

export class PostgresWorkflowInstanceRepository implements WorkflowInstanceRepository {
  constructor(private readonly db: Database) {}
  async findById(tenantId: string, id: string) { const [row] = await this.db.select().from(workflowInstances).where(and(eq(workflowInstances.tenantId, tenantId), eq(workflowInstances.id, id))).limit(1); return row ? instanceFromRow(row) : null; }
  async listByTenant(tenantId: string, status?: WorkflowInstanceStatus) { const rows = status ? await this.db.select().from(workflowInstances).where(and(eq(workflowInstances.tenantId, tenantId), eq(workflowInstances.status, status))).orderBy(desc(workflowInstances.updatedAt)) : await this.db.select().from(workflowInstances).where(eq(workflowInstances.tenantId, tenantId)).orderBy(desc(workflowInstances.updatedAt)); return rows.map(instanceFromRow); }
  async listByDefinition(tenantId: string, definitionId: string) { return (await this.db.select().from(workflowInstances).where(and(eq(workflowInstances.tenantId, tenantId), eq(workflowInstances.workflowDefinitionId, definitionId))).orderBy(desc(workflowInstances.updatedAt))).map(instanceFromRow); }
  async findBySource(tenantId: string, sourceType: WorkflowTriggerType, sourceReferenceId: string) { return (await this.db.select().from(workflowInstances).where(and(eq(workflowInstances.tenantId, tenantId), eq(workflowInstances.sourceType, sourceType), eq(workflowInstances.sourceReferenceId, sourceReferenceId))).orderBy(desc(workflowInstances.updatedAt))).map(instanceFromRow); }
  async save(instance: WorkflowInstance) {
    const data = instance.toPersistence();
    await this.db.insert(workflowInstances).values({ id: data.id, tenantId: data.tenantId, workflowDefinitionId: data.workflowDefinitionId, workflowVersion: data.workflowVersion, status: data.status, currentStepId: data.currentStepId, variables: data.variables as Record<string, unknown>, executionHistory: data.executionHistory as WorkflowExecutionEntry[], startedByUserId: data.startedByUserId, sourceType: data.sourceType, sourceReferenceId: data.sourceReferenceId, createdAt: data.createdAt, updatedAt: data.updatedAt, completedAt: data.completedAt, cancelledAt: data.cancelledAt, failedAt: data.failedAt, failureReason: data.failureReason }).onConflictDoUpdate({ target: workflowInstances.id, set: { status: data.status, currentStepId: data.currentStepId, variables: data.variables as Record<string, unknown>, executionHistory: data.executionHistory as WorkflowExecutionEntry[], updatedAt: data.updatedAt, completedAt: data.completedAt, cancelledAt: data.cancelledAt, failedAt: data.failedAt, failureReason: data.failureReason } });
  }
}

export class PostgresHumanTaskRepository implements HumanTaskRepository {
  constructor(private readonly db: Database) {}
  async findById(tenantId: string, id: string) { const [row] = await this.db.select().from(workflowHumanTasks).where(and(eq(workflowHumanTasks.tenantId, tenantId), eq(workflowHumanTasks.id, id))).limit(1); return row ? taskFromRow(row) : null; }
  async findOpenByInstanceStep(tenantId: string, workflowInstanceId: string, stepId: string) { const [row] = await this.db.select().from(workflowHumanTasks).where(and(eq(workflowHumanTasks.tenantId, tenantId), eq(workflowHumanTasks.workflowInstanceId, workflowInstanceId), eq(workflowHumanTasks.stepId, stepId), notInArray(workflowHumanTasks.status, ["COMPLETED", "CANCELLED"]))).orderBy(desc(workflowHumanTasks.updatedAt)).limit(1); return row ? taskFromRow(row) : null; }
  async listByTenant(tenantId: string, status?: HumanTaskStatus) { const rows = status ? await this.db.select().from(workflowHumanTasks).where(and(eq(workflowHumanTasks.tenantId, tenantId), eq(workflowHumanTasks.status, status))).orderBy(desc(workflowHumanTasks.updatedAt)) : await this.db.select().from(workflowHumanTasks).where(eq(workflowHumanTasks.tenantId, tenantId)).orderBy(desc(workflowHumanTasks.updatedAt)); return rows.map(taskFromRow); }
  async listForUser(tenantId: string, userId: string, roles: readonly string[]) { return (await this.listByTenant(tenantId)).filter((task) => !["COMPLETED", "CANCELLED"].includes(task.status) && task.isEligible(userId, roles)); }
  async save(task: HumanTask) {
    const data = task.toPersistence();
    await this.db.insert(workflowHumanTasks).values({ id: data.id, tenantId: data.tenantId, workflowInstanceId: data.workflowInstanceId, workflowDefinitionId: data.workflowDefinitionId, workflowVersion: data.workflowVersion, stepId: data.stepId, kind: data.kind, name: data.name, description: data.description, status: data.status, assigneeUserId: data.assigneeUserId, candidateUserIds: [...data.candidateUserIds], candidateRoles: [...data.candidateRoles], formDefinitionId: data.formDefinitionId, dueAt: data.dueAt, output: data.output as Record<string, unknown> | null, createdAt: data.createdAt, updatedAt: data.updatedAt, completedAt: data.completedAt }).onConflictDoUpdate({ target: workflowHumanTasks.id, set: { status: data.status, assigneeUserId: data.assigneeUserId, candidateUserIds: [...data.candidateUserIds], candidateRoles: [...data.candidateRoles], dueAt: data.dueAt, output: data.output as Record<string, unknown> | null, updatedAt: data.updatedAt, completedAt: data.completedAt } });
  }
}
