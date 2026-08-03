import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("tenants_slug_key").on(table.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_tenant_email_key").on(table.tenantId, table.email)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerEmail: text("customer_email").notNull(),
    serviceName: text("service_name").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("booked"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("appointments_tenant_start_idx").on(table.tenantId, table.startAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    previousHash: text("previous_hash"),
    hash: text("hash").notNull(),
  },
  (table) => [index("audit_events_tenant_occurred_idx").on(table.tenantId, table.occurredAt)],
);

export const queues = pgTable(
  "queues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id"),
    name: text("name").notNull(),
    code: text("code").notNull(),
    prefix: text("prefix").notNull(),
    strategy: text("strategy").notNull().default("fifo"),
    isActive: boolean("is_active").notNull().default(true),
    currentSequence: integer("current_sequence").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("queues_tenant_code_key").on(table.tenantId, table.code),
    index("queues_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const queueTickets = pgTable(
  "queue_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    queueId: uuid("queue_id")
      .notNull()
      .references(() => queues.id, { onDelete: "cascade" }),
    ticketNumber: integer("ticket_number").notNull(),
    displayNumber: text("display_number").notNull(),
    priorityLevel: text("priority_level").notNull().default("standard"),
    status: text("status").notNull().default("waiting"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerEmail: text("customer_email"),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    serviceId: uuid("service_id"),
    counterNumber: text("counter_number"),
    idempotencyKey: text("idempotency_key"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    calledAt: timestamp("called_at", { withTimezone: true }),
    servedAt: timestamp("served_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("queue_tickets_queue_number_key").on(table.queueId, table.ticketNumber),
    uniqueIndex("queue_tickets_tenant_idempotency_key").on(table.tenantId, table.idempotencyKey),
    index("queue_tickets_tenant_queue_status_idx").on(table.tenantId, table.queueId, table.status),
    index("queue_tickets_tenant_status_joined_idx").on(table.tenantId, table.status, table.joinedAt),
  ],
);

export const queueSnapshots = pgTable(
  "queue_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    queueId: uuid("queue_id")
      .notNull()
      .references(() => queues.id, { onDelete: "cascade" }),
    activeTicketsCount: integer("active_tickets_count").notNull().default(0),
    averageWaitSeconds: integer("average_wait_seconds").notNull().default(0),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("queue_snapshots_tenant_queue_snapshot_idx").on(
      table.tenantId,
      table.queueId,
      table.snapshotAt,
    ),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    recipient: text("recipient").notNull(),
    channel: text("channel").notNull(),
    templateId: text("template_id").notNull(),
    status: text("status").notNull().default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    retryCount: integer("retry_count").notNull().default(0),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_tenant_status_created_idx").on(table.tenantId, table.status, table.createdAt),
    index("notifications_tenant_recipient_idx").on(table.tenantId, table.recipient),
  ],
);

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  appointments: many(appointments),
  auditEvents: many(auditEvents),
  queues: many(queues),
  notifications: many(notifications),
}));

export const queuesRelations = relations(queues, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [queues.tenantId],
    references: [tenants.id],
  }),
  tickets: many(queueTickets),
  snapshots: many(queueSnapshots),
}));

export const queueTicketsRelations = relations(queueTickets, ({ one }) => ({
  tenant: one(tenants, {
    fields: [queueTickets.tenantId],
    references: [tenants.id],
  }),
  queue: one(queues, {
    fields: [queueTickets.queueId],
    references: [queues.id],
  }),
  appointment: one(appointments, {
    fields: [queueTickets.appointmentId],
    references: [appointments.id],
  }),
}));

export const queueSnapshotsRelations = relations(queueSnapshots, ({ one }) => ({
  tenant: one(tenants, {
    fields: [queueSnapshots.tenantId],
    references: [tenants.id],
  }),
  queue: one(queues, {
    fields: [queueSnapshots.queueId],
    references: [queues.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notifications.tenantId],
    references: [tenants.id],
  }),
}));
