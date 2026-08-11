import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "@adminops/tenancy";

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
