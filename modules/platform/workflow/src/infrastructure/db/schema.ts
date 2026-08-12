import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { WorkflowStep, WorkflowTrigger, WorkflowMetadata, WorkflowExecutionEntry } from "../../index.js";

export const workflowDefinitions = pgTable("workflow_definitions", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull(),
  currentVersion: integer("current_version").notNull(),
  startStepId: text("start_step_id").notNull(),
  steps: jsonb("steps").$type<WorkflowStep[]>().notNull().default([]),
  triggers: jsonb("triggers").$type<WorkflowTrigger[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<WorkflowMetadata>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (table) => [index("workflow_definitions_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt)]);

export const workflowDefinitionVersions = pgTable("workflow_definition_versions", {
  tenantId: uuid("tenant_id").notNull(),
  workflowDefinitionId: uuid("workflow_definition_id").notNull().references(() => workflowDefinitions.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  startStepId: text("start_step_id").notNull(),
  steps: jsonb("steps").$type<WorkflowStep[]>().notNull().default([]),
  triggers: jsonb("triggers").$type<WorkflowTrigger[]>().notNull().default([]),
  metadata: jsonb("metadata").$type<WorkflowMetadata>().notNull().default({}),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.tenantId, table.workflowDefinitionId, table.version] }),
  index("workflow_definition_versions_latest_idx").on(table.tenantId, table.workflowDefinitionId, table.version),
]);

export const workflowInstances = pgTable("workflow_instances", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  workflowDefinitionId: uuid("workflow_definition_id").notNull().references(() => workflowDefinitions.id, { onDelete: "cascade" }),
  workflowVersion: integer("workflow_version").notNull(),
  status: text("status").notNull(),
  currentStepId: text("current_step_id"),
  variables: jsonb("variables").$type<Record<string, unknown>>().notNull().default({}),
  executionHistory: jsonb("execution_history").$type<WorkflowExecutionEntry[]>().notNull().default([]),
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

export const workflowHumanTasks = pgTable("workflow_human_tasks", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  workflowInstanceId: uuid("workflow_instance_id").notNull().references(() => workflowInstances.id, { onDelete: "cascade" }),
  workflowDefinitionId: uuid("workflow_definition_id").notNull().references(() => workflowDefinitions.id, { onDelete: "cascade" }),
  workflowVersion: integer("workflow_version").notNull(),
  stepId: text("step_id").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull(),
  assigneeUserId: uuid("assignee_user_id"),
  candidateUserIds: jsonb("candidate_user_ids").$type<string[]>().notNull().default([]),
  candidateRoles: jsonb("candidate_roles").$type<string[]>().notNull().default([]),
  formDefinitionId: uuid("form_definition_id"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  output: jsonb("output").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("workflow_human_tasks_tenant_status_idx").on(table.tenantId, table.status, table.dueAt),
  index("workflow_human_tasks_instance_step_idx").on(table.tenantId, table.workflowInstanceId, table.stepId, table.status),
  index("workflow_human_tasks_assignee_idx").on(table.tenantId, table.assigneeUserId, table.status),
]);
