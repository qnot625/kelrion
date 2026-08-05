import { relations } from "drizzle-orm";
import {
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

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code").notNull(),
    description: text("description"),
    managerEmployeeId: uuid("manager_employee_id"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("departments_tenant_code_key").on(table.tenantId, table.code),
    index("departments_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    code: text("code").notNull(),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    description: text("description"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("positions_tenant_code_key").on(table.tenantId, table.code),
    index("positions_tenant_dept_idx").on(table.tenantId, table.departmentId),
  ],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    employeeNumber: text("employee_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
    positionId: uuid("position_id").references(() => positions.id, { onDelete: "set null" }),
    managerId: uuid("manager_id"),
    branchId: text("branch_id"),
    employmentType: text("employment_type").notNull().default("full_time"),
    employmentStatus: text("employment_status").notNull().default("active"),
    hireDate: text("hire_date").notNull(),
    terminationDate: text("termination_date"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("employees_tenant_number_key").on(table.tenantId, table.employeeNumber),
    uniqueIndex("employees_tenant_email_key").on(table.tenantId, table.email),
    index("employees_tenant_status_idx").on(table.tenantId, table.employmentStatus),
    index("employees_tenant_dept_idx").on(table.tenantId, table.departmentId),
    index("employees_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    source: text("source").notNull().default("web"),
    location: jsonb("location").$type<Record<string, unknown>>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_events_tenant_idempotency_key").on(table.tenantId, table.idempotencyKey),
    index("attendance_events_tenant_employee_ts_idx").on(table.tenantId, table.employeeId, table.timestamp),
  ],
);

export const attendanceSummaries = pgTable(
  "attendance_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    workDate: text("work_date").notNull(),
    firstClockIn: timestamp("first_clock_in", { withTimezone: true }),
    lastClockOut: timestamp("last_clock_out", { withTimezone: true }),
    totalWorkMinutes: integer("total_work_minutes").notNull().default(0),
    totalBreakMinutes: integer("total_break_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    status: text("status").notNull().default("present"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_summaries_tenant_emp_date_key").on(
      table.tenantId,
      table.employeeId,
      table.workDate,
    ),
    index("attendance_summaries_tenant_date_idx").on(table.tenantId, table.workDate),
  ],
);

export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    targetEventId: uuid("target_event_id").references(() => attendanceEvents.id, { onDelete: "set null" }),
    requestedEventType: text("requested_event_type").notNull(),
    requestedTimestamp: timestamp("requested_timestamp", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attendance_corrections_tenant_status_idx").on(table.tenantId, table.status),
    index("attendance_corrections_tenant_emp_idx").on(table.tenantId, table.employeeId),
  ],
);

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  appointments: many(appointments),
  auditEvents: many(auditEvents),
  departments: many(departments),
  positions: many(positions),
  employees: many(employees),
  attendanceEvents: many(attendanceEvents),
  attendanceSummaries: many(attendanceSummaries),
  attendanceCorrections: many(attendanceCorrections),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  employees: many(employees),
  positions: many(positions),
}));

export const positionsRelations = relations(positions, ({ one, many }) => ({
  department: one(departments, {
    fields: [positions.departmentId],
    references: [departments.id],
  }),
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  department: one(departments, {
    fields: [employees.departmentId],
    references: [departments.id],
  }),
  position: one(positions, {
    fields: [employees.positionId],
    references: [positions.id],
  }),
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  attendanceEvents: many(attendanceEvents),
  attendanceSummaries: many(attendanceSummaries),
  attendanceCorrections: many(attendanceCorrections),
}));

export const attendanceEventsRelations = relations(attendanceEvents, ({ one }) => ({
  employee: one(employees, {
    fields: [attendanceEvents.employeeId],
    references: [employees.id],
  }),
}));

export const attendanceSummariesRelations = relations(attendanceSummaries, ({ one }) => ({
  employee: one(employees, {
    fields: [attendanceSummaries.employeeId],
    references: [employees.id],
  }),
}));

export const attendanceCorrectionsRelations = relations(attendanceCorrections, ({ one }) => ({
  employee: one(employees, {
    fields: [attendanceCorrections.employeeId],
    references: [employees.id],
  }),
}));
