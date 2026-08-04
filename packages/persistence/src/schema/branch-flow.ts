import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { tenants } from "../schema.js";

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
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
  ]
);

export const branchOperatingWindows = pgTable(
  "branch_operating_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    openMinutes: integer("open_minutes").notNull(),
    closeMinutes: integer("close_minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("branch_operating_windows_branch_id_idx").on(table.branchId),
  ]
);

export const branchHolidays = pgTable(
  "branch_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("branch_holidays_tenant_branch_idx").on(table.tenantId, table.branchId),
  ]
);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    capacity: integer("capacity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("departments_branch_slug_key").on(table.branchId, table.slug),
    index("departments_tenant_branch_idx").on(table.tenantId, table.branchId),
  ]
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
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
  ]
);

export const serviceRequirements = pgTable(
  "service_requirements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
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
  ]
);

export const branchServices = pgTable(
  "branch_services",
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
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("branch_services_branch_service_key").on(table.branchId, table.serviceId),
    index("branch_services_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("branch_services_tenant_service_idx").on(table.tenantId, table.serviceId),
    index("branch_services_tenant_service_status_idx").on(table.tenantId, table.serviceId, table.status),
  ]
);

export const branchesRelations = relations(branches, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [branches.tenantId],
    references: [tenants.id],
  }),
  operatingWindows: many(branchOperatingWindows),
  holidays: many(branchHolidays),
  departments: many(departments),
  branchServices: many(branchServices),
}));

export const branchOperatingWindowsRelations = relations(branchOperatingWindows, ({ one }) => ({
  branch: one(branches, {
    fields: [branchOperatingWindows.branchId],
    references: [branches.id],
  }),
}));

export const branchHolidaysRelations = relations(branchHolidays, ({ one }) => ({
  tenant: one(tenants, {
    fields: [branchHolidays.tenantId],
    references: [tenants.id],
  }),
  branch: one(branches, {
    fields: [branchHolidays.branchId],
    references: [branches.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one }) => ({
  tenant: one(tenants, {
    fields: [departments.tenantId],
    references: [tenants.id],
  }),
  branch: one(branches, {
    fields: [departments.branchId],
    references: [branches.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [services.tenantId],
    references: [tenants.id],
  }),
  requirements: one(serviceRequirements),
  branchServices: many(branchServices),
}));

export const serviceRequirementsRelations = relations(serviceRequirements, ({ one }) => ({
  tenant: one(tenants, {
    fields: [serviceRequirements.tenantId],
    references: [tenants.id],
  }),
  service: one(services, {
    fields: [serviceRequirements.serviceId],
    references: [services.id],
  }),
}));

export const branchServicesRelations = relations(branchServices, ({ one }) => ({
  tenant: one(tenants, {
    fields: [branchServices.tenantId],
    references: [tenants.id],
  }),
  branch: one(branches, {
    fields: [branchServices.branchId],
    references: [branches.id],
  }),
  service: one(services, {
    fields: [branchServices.serviceId],
    references: [services.id],
  }),
}));


