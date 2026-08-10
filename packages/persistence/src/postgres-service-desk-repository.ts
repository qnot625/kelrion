import { and, asc, desc, eq } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  ServiceDeskSlaPolicy,
  ServiceDeskTicket,
  type ServiceDeskAttachmentReference,
  type ServiceDeskComment,
  type ServiceDeskCommentVisibility,
  type ServiceDeskPriority,
  type ServiceDeskRequester,
  type ServiceDeskSlaPolicyRepository,
  type ServiceDeskSource,
  type ServiceDeskStatusEvent,
  type ServiceDeskTicketRepository,
  type ServiceDeskTicketStatus,
  type ServiceDeskTicketType,
} from "@adminops/service-desk";
import type { Database } from "./database.js";
import { tenants } from "./schema.js";

const serviceDeskSlaPolicies = pgTable("service_desk_sla_policies", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  ticketTypes: jsonb("ticket_types").notNull().default([]),
  priorities: jsonb("priorities").notNull().default([]),
  categoryKeys: jsonb("category_keys").notNull().default([]),
  firstResponseMinutes: integer("first_response_minutes").notNull(),
  resolutionMinutes: integer("resolution_minutes").notNull(),
  pauseStatuses: jsonb("pause_statuses").notNull().default([]),
  escalationThresholds: jsonb("escalation_thresholds").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [index("service_desk_sla_policies_tenant_idx").on(table.tenantId, table.enabled, table.updatedAt)]);

const serviceDeskTickets = pgTable("service_desk_tickets", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  reference: text("reference").notNull(),
  type: text("type").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull().default(""),
  categoryKey: text("category_key"),
  requester: jsonb("requester").notNull().default({}),
  source: text("source").notNull(),
  assignmentGroupId: text("assignment_group_id"),
  assigneeUserId: uuid("assignee_user_id"),
  watcherUserIds: jsonb("watcher_user_ids").notNull().default([]),
  tags: jsonb("tags").notNull().default([]),
  workflowInstanceId: uuid("workflow_instance_id"),
  approvalRequestId: uuid("approval_request_id"),
  slaPolicyId: uuid("sla_policy_id").references(() => serviceDeskSlaPolicies.id, { onDelete: "set null" }),
  firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }),
  resolutionDueAt: timestamp("resolution_due_at", { withTimezone: true }),
  firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  accumulatedPausedMs: bigint("accumulated_paused_ms", { mode: "number" }).notNull().default(0),
  escalationLevel: integer("escalation_level").notNull().default(0),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("service_desk_tickets_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
  index("service_desk_tickets_assignee_idx").on(table.tenantId, table.assigneeUserId, table.status, table.updatedAt),
]);

const serviceDeskComments = pgTable("service_desk_comments", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ticketId: uuid("ticket_id").notNull().references(() => serviceDeskTickets.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull(),
  visibility: text("visibility").notNull(),
  body: text("body").notNull().default(""),
  attachments: jsonb("attachments").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [index("service_desk_comments_ticket_idx").on(table.tenantId, table.ticketId, table.createdAt)]);

const serviceDeskStatusEvents = pgTable("service_desk_status_events", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  ticketId: uuid("ticket_id").notNull().references(() => serviceDeskTickets.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorUserId: uuid("actor_user_id").notNull(),
  reason: text("reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [index("service_desk_status_events_ticket_idx").on(table.tenantId, table.ticketId, table.createdAt)]);

type SlaRow = typeof serviceDeskSlaPolicies.$inferSelect;
type TicketRow = typeof serviceDeskTickets.$inferSelect;
type CommentRow = typeof serviceDeskComments.$inferSelect;
type StatusRow = typeof serviceDeskStatusEvents.$inferSelect;

function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function numbers(value: unknown): number[] { return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : []; }
function requester(value: unknown): ServiceDeskRequester { return value && typeof value === "object" && !Array.isArray(value) ? value as ServiceDeskRequester : {}; }
function attachments(value: unknown): ServiceDeskAttachmentReference[] { return Array.isArray(value) ? value as ServiceDeskAttachmentReference[] : []; }

function slaFromRow(row: SlaRow): ServiceDeskSlaPolicy {
  return new ServiceDeskSlaPolicy({
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    ticketTypes: strings(row.ticketTypes) as ServiceDeskTicketType[],
    priorities: strings(row.priorities) as ServiceDeskPriority[],
    categoryKeys: strings(row.categoryKeys),
    firstResponseMinutes: row.firstResponseMinutes,
    resolutionMinutes: row.resolutionMinutes,
    pauseStatuses: strings(row.pauseStatuses) as ServiceDeskTicketStatus[],
    escalationThresholds: numbers(row.escalationThresholds),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function commentFromRow(row: CommentRow): ServiceDeskComment {
  return { id: row.id, authorUserId: row.authorUserId, visibility: row.visibility as ServiceDeskCommentVisibility, body: row.body, attachments: attachments(row.attachments), createdAt: row.createdAt };
}

function statusFromRow(row: StatusRow): ServiceDeskStatusEvent {
  return { id: row.id, fromStatus: row.fromStatus as ServiceDeskTicketStatus | null, toStatus: row.toStatus as ServiceDeskTicketStatus, actorUserId: row.actorUserId, reason: row.reason, createdAt: row.createdAt };
}

function ticketFromRow(row: TicketRow, comments: readonly ServiceDeskComment[], history: readonly ServiceDeskStatusEvent[]): ServiceDeskTicket {
  return new ServiceDeskTicket({
    id: row.id,
    tenantId: row.tenantId,
    reference: row.reference,
    type: row.type as ServiceDeskTicketType,
    priority: row.priority as ServiceDeskPriority,
    status: row.status as ServiceDeskTicketStatus,
    subject: row.subject,
    description: row.description,
    categoryKey: row.categoryKey,
    requester: requester(row.requester),
    source: row.source as ServiceDeskSource,
    assignmentGroupId: row.assignmentGroupId,
    assigneeUserId: row.assigneeUserId,
    watcherUserIds: strings(row.watcherUserIds),
    tags: strings(row.tags),
    workflowInstanceId: row.workflowInstanceId,
    approvalRequestId: row.approvalRequestId,
    slaPolicyId: row.slaPolicyId,
    firstResponseDueAt: row.firstResponseDueAt,
    resolutionDueAt: row.resolutionDueAt,
    firstRespondedAt: row.firstRespondedAt,
    resolvedAt: row.resolvedAt,
    closedAt: row.closedAt,
    cancelledAt: row.cancelledAt,
    pausedAt: row.pausedAt,
    accumulatedPausedMs: row.accumulatedPausedMs,
    escalationLevel: row.escalationLevel,
    comments,
    statusHistory: history,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PostgresServiceDeskSlaPolicyRepository implements ServiceDeskSlaPolicyRepository {
  constructor(private readonly db: Database) {}
  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(serviceDeskSlaPolicies).where(and(eq(serviceDeskSlaPolicies.tenantId, tenantId), eq(serviceDeskSlaPolicies.id, id))).limit(1);
    return row ? slaFromRow(row) : null;
  }
  async listByTenant(tenantId: string) { return (await this.db.select().from(serviceDeskSlaPolicies).where(eq(serviceDeskSlaPolicies.tenantId, tenantId)).orderBy(desc(serviceDeskSlaPolicies.updatedAt))).map(slaFromRow); }
  async save(policy: ServiceDeskSlaPolicy) {
    const data = policy.toPersistence();
    await this.db.insert(serviceDeskSlaPolicies).values({ id: data.id, tenantId: data.tenantId, name: data.name, description: data.description, enabled: data.enabled, ticketTypes: [...data.ticketTypes], priorities: [...data.priorities], categoryKeys: [...data.categoryKeys], firstResponseMinutes: data.firstResponseMinutes, resolutionMinutes: data.resolutionMinutes, pauseStatuses: [...data.pauseStatuses], escalationThresholds: [...data.escalationThresholds], createdAt: data.createdAt, updatedAt: data.updatedAt }).onConflictDoUpdate({ target: serviceDeskSlaPolicies.id, set: { name: data.name, description: data.description, enabled: data.enabled, ticketTypes: [...data.ticketTypes], priorities: [...data.priorities], categoryKeys: [...data.categoryKeys], firstResponseMinutes: data.firstResponseMinutes, resolutionMinutes: data.resolutionMinutes, pauseStatuses: [...data.pauseStatuses], escalationThresholds: [...data.escalationThresholds], updatedAt: data.updatedAt } });
  }
  async delete(tenantId: string, id: string) { await this.db.delete(serviceDeskSlaPolicies).where(and(eq(serviceDeskSlaPolicies.tenantId, tenantId), eq(serviceDeskSlaPolicies.id, id))); }
}

export class PostgresServiceDeskTicketRepository implements ServiceDeskTicketRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(serviceDeskTickets).where(and(eq(serviceDeskTickets.tenantId, tenantId), eq(serviceDeskTickets.id, id))).limit(1);
    return row ? this.hydrate(row) : null;
  }

  async findByReference(tenantId: string, reference: string) {
    const [row] = await this.db.select().from(serviceDeskTickets).where(and(eq(serviceDeskTickets.tenantId, tenantId), eq(serviceDeskTickets.reference, reference.trim().toUpperCase()))).limit(1);
    return row ? this.hydrate(row) : null;
  }

  async listByTenant(tenantId: string, status?: ServiceDeskTicketStatus) {
    const rows = status
      ? await this.db.select().from(serviceDeskTickets).where(and(eq(serviceDeskTickets.tenantId, tenantId), eq(serviceDeskTickets.status, status))).orderBy(desc(serviceDeskTickets.updatedAt))
      : await this.db.select().from(serviceDeskTickets).where(eq(serviceDeskTickets.tenantId, tenantId)).orderBy(desc(serviceDeskTickets.updatedAt));
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async listByRequester(tenantId: string, userId: string) {
    const all = await this.listByTenant(tenantId);
    return all.filter((ticket) => ticket.isRequester(userId));
  }

  async listByAssignee(tenantId: string, userId: string) {
    const rows = await this.db.select().from(serviceDeskTickets).where(and(eq(serviceDeskTickets.tenantId, tenantId), eq(serviceDeskTickets.assigneeUserId, userId))).orderBy(desc(serviceDeskTickets.updatedAt));
    return Promise.all(rows.map((row) => this.hydrate(row)));
  }

  async save(ticket: ServiceDeskTicket) {
    const data = ticket.toPersistence();
    const [existing] = await this.db.select({ id: serviceDeskTickets.id }).from(serviceDeskTickets).where(and(eq(serviceDeskTickets.tenantId, data.tenantId), eq(serviceDeskTickets.id, data.id))).limit(1);
    if (!existing) {
      await this.db.insert(serviceDeskTickets).values(this.values(data));
    } else {
      await this.db.update(serviceDeskTickets).set({ type: data.type, priority: data.priority, status: data.status, subject: data.subject, description: data.description, categoryKey: data.categoryKey, requester: data.requester as ServiceDeskRequester, source: data.source, assignmentGroupId: data.assignmentGroupId, assigneeUserId: data.assigneeUserId, watcherUserIds: [...data.watcherUserIds], tags: [...data.tags], workflowInstanceId: data.workflowInstanceId, approvalRequestId: data.approvalRequestId, slaPolicyId: data.slaPolicyId, firstResponseDueAt: data.firstResponseDueAt, resolutionDueAt: data.resolutionDueAt, firstRespondedAt: data.firstRespondedAt, resolvedAt: data.resolvedAt, closedAt: data.closedAt, cancelledAt: data.cancelledAt, pausedAt: data.pausedAt, accumulatedPausedMs: data.accumulatedPausedMs, escalationLevel: data.escalationLevel, updatedAt: data.updatedAt }).where(and(eq(serviceDeskTickets.tenantId, data.tenantId), eq(serviceDeskTickets.id, data.id)));
    }

    const persistedComments = new Set((await this.db.select({ id: serviceDeskComments.id }).from(serviceDeskComments).where(and(eq(serviceDeskComments.tenantId, data.tenantId), eq(serviceDeskComments.ticketId, data.id)))).map((row) => row.id));
    for (const comment of data.comments) {
      if (persistedComments.has(comment.id)) continue;
      await this.db.insert(serviceDeskComments).values({ id: comment.id, tenantId: data.tenantId, ticketId: data.id, authorUserId: comment.authorUserId, visibility: comment.visibility, body: comment.body, attachments: [...comment.attachments], createdAt: comment.createdAt });
    }

    const persistedEvents = new Set((await this.db.select({ id: serviceDeskStatusEvents.id }).from(serviceDeskStatusEvents).where(and(eq(serviceDeskStatusEvents.tenantId, data.tenantId), eq(serviceDeskStatusEvents.ticketId, data.id)))).map((row) => row.id));
    for (const event of data.statusHistory) {
      if (persistedEvents.has(event.id)) continue;
      await this.db.insert(serviceDeskStatusEvents).values({ id: event.id, tenantId: data.tenantId, ticketId: data.id, fromStatus: event.fromStatus, toStatus: event.toStatus, actorUserId: event.actorUserId, reason: event.reason, createdAt: event.createdAt });
    }
  }

  private values(data: ReturnType<ServiceDeskTicket["toPersistence"]>) {
    return { id: data.id, tenantId: data.tenantId, reference: data.reference, type: data.type, priority: data.priority, status: data.status, subject: data.subject, description: data.description, categoryKey: data.categoryKey, requester: data.requester as ServiceDeskRequester, source: data.source, assignmentGroupId: data.assignmentGroupId, assigneeUserId: data.assigneeUserId, watcherUserIds: [...data.watcherUserIds], tags: [...data.tags], workflowInstanceId: data.workflowInstanceId, approvalRequestId: data.approvalRequestId, slaPolicyId: data.slaPolicyId, firstResponseDueAt: data.firstResponseDueAt, resolutionDueAt: data.resolutionDueAt, firstRespondedAt: data.firstRespondedAt, resolvedAt: data.resolvedAt, closedAt: data.closedAt, cancelledAt: data.cancelledAt, pausedAt: data.pausedAt, accumulatedPausedMs: data.accumulatedPausedMs, escalationLevel: data.escalationLevel, createdByUserId: data.createdByUserId, createdAt: data.createdAt, updatedAt: data.updatedAt };
  }

  private async hydrate(row: TicketRow) {
    const [comments, history] = await Promise.all([
      this.db.select().from(serviceDeskComments).where(and(eq(serviceDeskComments.tenantId, row.tenantId), eq(serviceDeskComments.ticketId, row.id))).orderBy(asc(serviceDeskComments.createdAt)),
      this.db.select().from(serviceDeskStatusEvents).where(and(eq(serviceDeskStatusEvents.tenantId, row.tenantId), eq(serviceDeskStatusEvents.ticketId, row.id))).orderBy(asc(serviceDeskStatusEvents.createdAt)),
    ]);
    return ticketFromRow(row, comments.map(commentFromRow), history.map(statusFromRow));
  }
}
