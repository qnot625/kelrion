import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "@adminops/tenancy";

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
