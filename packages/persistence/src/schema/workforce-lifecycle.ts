import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenancy.js";
import { users } from "./identity.js";

export interface StoredLifecycleStep {
  readonly id: string;
  readonly title: string;
  readonly ownerRole: string;
  readonly status: "pending" | "completed";
  readonly completedAt: string | null;
}

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requesterUserId: uuid("requester_user_id").references(() => users.id, { onDelete: "set null" }),
    requesterEmployeeId: uuid("requester_employee_id"),
    type: text("type").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    workingDays: integer("working_days").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    decidedByUserId: uuid("decided_by_user_id"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("leave_requests_tenant_requester_idx").on(table.tenantId, table.requesterUserId),
    index("leave_requests_tenant_employee_idx").on(table.tenantId, table.requesterEmployeeId),
    index("leave_requests_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const lifecyclePlans = pgTable(
  "lifecycle_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    subjectEmployeeId: uuid("subject_employee_id"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull(),
    steps: jsonb("steps").$type<StoredLifecycleStep[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("lifecycle_plans_tenant_subject_idx").on(table.tenantId, table.subjectUserId),
    index("lifecycle_plans_tenant_employee_idx").on(table.tenantId, table.subjectEmployeeId),
    index("lifecycle_plans_tenant_status_idx").on(table.tenantId, table.status),
  ],
);
