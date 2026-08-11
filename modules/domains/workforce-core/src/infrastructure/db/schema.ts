import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id"),
    employeeNumber: text("employee_number").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    departmentId: uuid("department_id"),
    branchId: uuid("branch_id"),
    managerId: uuid("manager_id"),
    positionId: uuid("position_id"),
    employmentType: text("employment_type").notNull(),
    employmentStatus: text("employment_status").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("employees_tenant_user_key").on(table.tenantId, table.userId),
    uniqueIndex("employees_tenant_number_key").on(table.tenantId, table.employeeNumber),
    uniqueIndex("employees_tenant_email_key").on(table.tenantId, table.email),
    index("employees_tenant_status_idx").on(table.tenantId, table.employmentStatus),
    index("employees_tenant_department_idx").on(table.tenantId, table.departmentId),
    index("employees_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("employees_tenant_manager_idx").on(table.tenantId, table.managerId),
  ],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    workDate: text("work_date").notNull(),
    status: text("status").notNull(),
    clockInAt: timestamp("clock_in_at", { withTimezone: true }),
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    activeDurationMinutes: text("active_duration_minutes").notNull(),
    totalBreakMinutes: text("total_break_minutes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("attendance_records_tenant_employee_date_key").on(table.tenantId, table.employeeId, table.workDate),
    index("attendance_records_tenant_date_idx").on(table.tenantId, table.workDate),
    index("attendance_records_tenant_employee_idx").on(table.tenantId, table.employeeId, table.workDate),
  ],
);

export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    requestedAction: text("requested_action").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("attendance_corrections_tenant_status_idx").on(table.tenantId, table.status)],
);
