import { pgTable, text, jsonb, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "@adminops/tenancy";

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
