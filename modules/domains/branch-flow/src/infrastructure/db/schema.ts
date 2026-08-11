import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "@adminops/tenancy";

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
