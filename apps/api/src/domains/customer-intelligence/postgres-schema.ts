import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { schema } from "@adminops/persistence";

export const customerCases = pgTable(
  "customer_cases",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => schema.tenants.id, { onDelete: "cascade" }),
    reference: text("reference").notNull(),
    customerEmail: text("customer_email").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priority: text("priority").notNull(),
    status: text("status").notNull(),
    ownerUserId: uuid("owner_user_id"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: text("resolution"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("customer_cases_tenant_reference_key").on(table.tenantId, table.reference),
    index("customer_cases_tenant_status_idx").on(table.tenantId, table.status),
    index("customer_cases_tenant_sla_idx").on(table.tenantId, table.slaDueAt),
    index("customer_cases_tenant_customer_idx").on(table.tenantId, table.customerEmail),
  ],
);

export const caseComments = pgTable(
  "case_comments",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => schema.tenants.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull().references(() => customerCases.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull(),
    body: text("body").notNull(),
    visibility: text("visibility").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("case_comments_tenant_case_idx").on(table.tenantId, table.caseId, table.createdAt)],
);
