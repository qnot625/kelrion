import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
} from "drizzle-orm/pg-core";
import { branches, branchHolidays, departments, services } from "./schema/branch-flow.js";

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
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    customerEmail: text("customer_email").notNull(),
    customerMetadata: jsonb("customer_metadata").$type<Record<string, unknown>>().notNull().default({}),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("booked"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointments_tenant_start_idx").on(table.tenantId, table.startAt),
    index("appointments_tenant_status_idx").on(table.tenantId, table.status),
    index("appointments_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("appointments_tenant_service_idx").on(table.tenantId, table.serviceId),
  ],
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

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  appointments: many(appointments),
  auditEvents: many(auditEvents),
  branches: many(branches),
  branchHolidays: many(branchHolidays),
  departments: many(departments),
  waitlists: many(waitlists),
}));


export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [appointments.tenantId],
    references: [tenants.id],
  }),
  branch: one(branches, {
    fields: [appointments.branchId],
    references: [branches.id],
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
  waitlists: many(waitlists),
}));

export const waitlists = pgTable(
  "waitlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id")
      .references(() => appointments.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    customerEmail: text("customer_email").notNull(),
    customerMetadata: jsonb("customer_metadata").$type<Record<string, unknown>>().notNull().default({}),
    queuePosition: integer("queue_position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("waitlists_tenant_idx").on(table.tenantId),
    index("waitlists_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("waitlists_tenant_service_idx").on(table.tenantId, table.serviceId),
    index("waitlists_tenant_queue_position_idx").on(table.tenantId, table.queuePosition),
  ],
);

export const waitlistsRelations = relations(waitlists, ({ one }) => ({
  tenant: one(tenants, {
    fields: [waitlists.tenantId],
    references: [tenants.id],
  }),
  appointment: one(appointments, {
    fields: [waitlists.appointmentId],
    references: [appointments.id],
  }),
  branch: one(branches, {
    fields: [waitlists.branchId],
    references: [branches.id],
  }),
  service: one(services, {
    fields: [waitlists.serviceId],
    references: [services.id],
  }),
}));

export * from "./schema/branch-flow.js";
