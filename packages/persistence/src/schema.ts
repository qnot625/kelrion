import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
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


export const platformAdministrators = pgTable(
  "platform_administrators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("platform_administrators_email_key").on(table.email)],
);

export const organisationSubscriptions = pgTable(
  "organisation_subscriptions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    enabledModules: jsonb("enabled_modules").$type<string[]>().notNull().default([]),
    billingCycle: text("billing_cycle").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    unitAmount: integer("unit_amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("organisation_subscriptions_tenant_key").on(table.tenantId),
    index("organisation_subscriptions_status_idx").on(table.status),
  ],
);

export const billingInvoices = pgTable(
  "billing_invoices",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    currency: text("currency").notNull(),
    billingCycle: text("billing_cycle").notNull(),
    status: text("status").notNull(),
    lineItems: jsonb("line_items").$type<Array<Record<string, unknown>>>().notNull().default([]),
    amountDue: integer("amount_due").notNull(),
    amountPaid: integer("amount_paid").notNull().default(0),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentReference: text("payment_reference"),
  },
  (table) => [
    uniqueIndex("billing_invoices_number_key").on(table.number),
    index("billing_invoices_tenant_issued_idx").on(table.tenantId, table.issuedAt),
    index("billing_invoices_status_due_idx").on(table.status, table.dueAt),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    address: text("address").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("branches_tenant_slug_key").on(table.tenantId, table.slug),
    index("branches_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const branchOperatingWindows = pgTable(
  "branch_operating_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    openMinutes: integer("open_minutes").notNull(),
    closeMinutes: integer("close_minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("branch_operating_windows_branch_id_idx").on(table.branchId)],
);

export const branchHolidays = pgTable(
  "branch_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("branch_holidays_tenant_branch_idx").on(table.tenantId, table.branchId)],
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("departments_branch_slug_key").on(table.branchId, table.slug),
    index("departments_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("services_tenant_code_key").on(table.tenantId, table.code),
    index("services_tenant_idx").on(table.tenantId),
  ],
);

export const serviceRequirements = pgTable(
  "service_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    photoIdRequired: boolean("photo_id_required").notNull().default(false),
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    requiredDocuments: jsonb("required_documents").$type<string[]>().notNull().default([]),
    customNotes: text("custom_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("service_requirements_service_key").on(table.serviceId),
    index("service_requirements_tenant_service_idx").on(table.tenantId, table.serviceId),
  ],
);

export const branchServices = pgTable(
  "branch_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("branch_services_branch_service_key").on(table.branchId, table.serviceId),
    index("branch_services_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("branch_services_tenant_service_idx").on(table.tenantId, table.serviceId),
    index("branch_services_tenant_service_status_idx").on(table.tenantId, table.serviceId, table.status),
  ],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
    serviceId: uuid("service_id").references(() => services.id, { onDelete: "set null" }),
    customerEmail: text("customer_email").notNull(),
    serviceName: text("service_name").notNull(),
    customerMetadata: jsonb("customer_metadata").$type<Record<string, unknown>>().notNull().default({}),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("booked"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointments_tenant_start_idx").on(table.tenantId, table.startAt),
    index("appointments_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("appointments_tenant_service_idx").on(table.tenantId, table.serviceId),
  ],
);

export const appointmentWaitlists = pgTable(
  "appointment_waitlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id").notNull().references(() => branches.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    customerEmail: text("customer_email").notNull(),
    customerMetadata: jsonb("customer_metadata").$type<Record<string, unknown>>().notNull().default({}),
    desiredStartAt: timestamp("desired_start_at", { withTimezone: true }),
    desiredEndAt: timestamp("desired_end_at", { withTimezone: true }),
    queuePosition: integer("queue_position").notNull(),
    status: text("status").notNull().default("waiting"),
    promotedAppointmentId: uuid("promoted_appointment_id").references(() => appointments.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("appointment_waitlists_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("appointment_waitlists_queue_idx").on(
      table.tenantId,
      table.branchId,
      table.serviceId,
      table.status,
      table.queuePosition,
    ),
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
  appointmentWaitlists: many(appointmentWaitlists),
  auditEvents: many(auditEvents),
  subscriptions: many(organisationSubscriptions),
  invoices: many(billingInvoices),
  branches: many(branches),
  services: many(services),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  tenant: one(tenants, { fields: [branches.tenantId], references: [tenants.id] }),
  operatingWindows: many(branchOperatingWindows),
  holidays: many(branchHolidays),
  departments: many(departments),
  branchServices: many(branchServices),
  appointments: many(appointments),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, { fields: [services.tenantId], references: [tenants.id] }),
  requirement: one(serviceRequirements),
  branchServices: many(branchServices),
  appointments: many(appointments),
}));
