import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type {
  NotificationDeliveryData,
  NotificationDeliveryRepository,
  NotificationDeliveryStatus,
  NotificationPreferenceData,
  NotificationPreferenceRepository,
  NotificationRecordData,
  NotificationRepository,
  NotificationSeverity,
  NotificationTemplateData,
  NotificationTemplateRepository,
  NotificationTemplateStatus,
  NotificationChannel,
} from "@adminops/notifications";
import type { Database } from "./database.js";
import { tenants, users } from "./schema.js";

const notificationSequences = pgTable("notification_sequences", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  lastSequence: bigint("last_sequence", { mode: "number" }).notNull().default(0),
}, (table) => [primaryKey({ columns: [table.tenantId] })]);

const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sequence: bigint("sequence", { mode: "number" }).notNull(),
  recipientUserId: uuid("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("notifications_tenant_sequence_key").on(table.tenantId, table.sequence),
  index("notifications_user_sequence_idx").on(table.tenantId, table.recipientUserId, table.sequence),
  index("notifications_entity_idx").on(table.tenantId, table.entityType, table.entityId),
]);

const notificationPreferences = pgTable("notification_preferences", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(false),
  smsEnabled: boolean("sms_enabled").notNull().default(false),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  emailAddress: text("email_address"),
  smsNumber: text("sms_number"),
  pushEndpoint: text("push_endpoint"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.userId] })]);

const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  channel: text("channel").notNull(),
  titleTemplate: text("title_template").notNull(),
  bodyTemplate: text("body_template").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("notification_templates_tenant_key_channel_key").on(table.tenantId, table.key, table.channel),
  index("notification_templates_tenant_status_idx").on(table.tenantId, table.status, table.key),
]);

const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  destination: text("destination"),
  status: text("status").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  providerReference: text("provider_reference"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("notification_deliveries_pending_idx").on(table.tenantId, table.status, table.nextAttemptAt, table.createdAt),
  index("notification_deliveries_notification_idx").on(table.tenantId, table.notificationId, table.createdAt),
]);

type NotificationRow = typeof notifications.$inferSelect;
type PreferenceRow = typeof notificationPreferences.$inferSelect;
type TemplateRow = typeof notificationTemplates.$inferSelect;
type DeliveryRow = typeof notificationDeliveries.$inferSelect;

function notification(row: NotificationRow): NotificationRecordData {
  return {
    id: row.id,
    sequence: row.sequence,
    tenantId: row.tenantId,
    recipientUserId: row.recipientUserId,
    kind: row.kind,
    title: row.title,
    message: row.message,
    severity: row.severity as NotificationSeverity,
    entityType: row.entityType,
    entityId: row.entityId,
    data: row.data,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

function preference(row: PreferenceRow): NotificationPreferenceData {
  return {
    tenantId: row.tenantId,
    userId: row.userId,
    emailEnabled: row.emailEnabled,
    smsEnabled: row.smsEnabled,
    pushEnabled: row.pushEnabled,
    emailAddress: row.emailAddress,
    smsNumber: row.smsNumber,
    pushEndpoint: row.pushEndpoint,
    updatedAt: row.updatedAt,
  };
}

function template(row: TemplateRow): NotificationTemplateData {
  return {
    id: row.id,
    tenantId: row.tenantId,
    key: row.key,
    channel: row.channel as NotificationChannel,
    titleTemplate: row.titleTemplate,
    bodyTemplate: row.bodyTemplate,
    status: row.status as NotificationTemplateStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function delivery(row: DeliveryRow): NotificationDeliveryData {
  return {
    id: row.id,
    tenantId: row.tenantId,
    notificationId: row.notificationId,
    channel: row.channel as NotificationChannel,
    destination: row.destination,
    status: row.status as NotificationDeliveryStatus,
    attempts: row.attempts,
    lastError: row.lastError,
    providerReference: row.providerReference,
    nextAttemptAt: row.nextAttemptAt,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Database) {}

  async create(value: Omit<NotificationRecordData, "sequence">): Promise<NotificationRecordData> {
    const allocated = await this.db.execute(sql`
      INSERT INTO notification_sequences (tenant_id, last_sequence)
      VALUES (${value.tenantId}::uuid, 1)
      ON CONFLICT (tenant_id)
      DO UPDATE SET last_sequence = notification_sequences.last_sequence + 1
      RETURNING last_sequence
    `);
    const sequenceRows = (allocated as unknown as { rows?: Array<{ last_sequence: number | string }> }).rows ?? [];
    const sequence = Number(sequenceRows[0]?.last_sequence ?? 0);
    if (!Number.isInteger(sequence) || sequence < 1) throw new Error("Could not allocate notification sequence");
    const [row] = await this.db.insert(notifications).values({
      ...value,
      data: { ...value.data },
      sequence,
    }).returning();
    if (!row) throw new Error("Failed to create notification");
    return notification(row);
  }

  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(notifications).where(and(eq(notifications.tenantId, tenantId), eq(notifications.id, id))).limit(1);
    return row ? notification(row) : null;
  }

  async listForUser(tenantId: string, userId: string, options: { afterSequence?: number; limit?: number; unreadOnly?: boolean } = {}) {
    const conditions = [eq(notifications.tenantId, tenantId), eq(notifications.recipientUserId, userId), gt(notifications.sequence, options.afterSequence ?? 0)];
    if (options.unreadOnly) conditions.push(isNull(notifications.readAt));
    const rows = await this.db.select().from(notifications).where(and(...conditions)).orderBy(asc(notifications.sequence)).limit(Math.min(Math.max(options.limit ?? 100, 1), 500));
    return rows.map(notification);
  }

  async unreadCount(tenantId: string, userId: string) {
    const result = await this.db.execute(sql`
      SELECT count(*)::int AS count
      FROM notifications
      WHERE tenant_id = ${tenantId}::uuid
        AND recipient_user_id = ${userId}::uuid
        AND read_at IS NULL
    `);
    const rows = (result as unknown as { rows?: Array<{ count: number | string }> }).rows ?? [];
    return Number(rows[0]?.count ?? 0);
  }

  async markRead(tenantId: string, userId: string, id: string, readAt: Date) {
    const [row] = await this.db.update(notifications).set({ readAt }).where(and(
      eq(notifications.tenantId, tenantId),
      eq(notifications.recipientUserId, userId),
      eq(notifications.id, id),
    )).returning();
    return row ? notification(row) : null;
  }

  async markAllRead(tenantId: string, userId: string, readAt: Date) {
    const rows = await this.db.update(notifications).set({ readAt }).where(and(
      eq(notifications.tenantId, tenantId),
      eq(notifications.recipientUserId, userId),
      isNull(notifications.readAt),
    )).returning({ id: notifications.id });
    return rows.length;
  }
}

export class PostgresNotificationPreferenceRepository implements NotificationPreferenceRepository {
  constructor(private readonly db: Database) {}
  async find(tenantId: string, userId: string) {
    const [row] = await this.db.select().from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, tenantId), eq(notificationPreferences.userId, userId))).limit(1);
    return row ? preference(row) : null;
  }
  async save(value: NotificationPreferenceData) {
    await this.db.insert(notificationPreferences).values(value).onConflictDoUpdate({
      target: [notificationPreferences.tenantId, notificationPreferences.userId],
      set: {
        emailEnabled: value.emailEnabled,
        smsEnabled: value.smsEnabled,
        pushEnabled: value.pushEnabled,
        emailAddress: value.emailAddress,
        smsNumber: value.smsNumber,
        pushEndpoint: value.pushEndpoint,
        updatedAt: value.updatedAt,
      },
    });
  }
}

export class PostgresNotificationTemplateRepository implements NotificationTemplateRepository {
  constructor(private readonly db: Database) {}
  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(notificationTemplates).where(and(eq(notificationTemplates.tenantId, tenantId), eq(notificationTemplates.id, id))).limit(1);
    return row ? template(row) : null;
  }
  async findByKey(tenantId: string, key: string, channel: NotificationTemplateData["channel"]) {
    const [row] = await this.db.select().from(notificationTemplates).where(and(
      eq(notificationTemplates.tenantId, tenantId), eq(notificationTemplates.key, key), eq(notificationTemplates.channel, channel),
    )).limit(1);
    return row ? template(row) : null;
  }
  async list(tenantId: string) {
    return (await this.db.select().from(notificationTemplates).where(eq(notificationTemplates.tenantId, tenantId)).orderBy(asc(notificationTemplates.key), asc(notificationTemplates.channel))).map(template);
  }
  async save(value: NotificationTemplateData) {
    await this.db.insert(notificationTemplates).values(value).onConflictDoUpdate({
      target: notificationTemplates.id,
      set: {
        titleTemplate: value.titleTemplate,
        bodyTemplate: value.bodyTemplate,
        status: value.status,
        updatedAt: value.updatedAt,
      },
    });
  }
}

export class PostgresNotificationDeliveryRepository implements NotificationDeliveryRepository {
  constructor(private readonly db: Database) {}
  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(notificationDeliveries).where(and(eq(notificationDeliveries.tenantId, tenantId), eq(notificationDeliveries.id, id))).limit(1);
    return row ? delivery(row) : null;
  }
  async list(tenantId: string, options: { notificationId?: string; status?: NotificationDeliveryStatus; limit?: number } = {}) {
    const conditions = [eq(notificationDeliveries.tenantId, tenantId)];
    if (options.notificationId) conditions.push(eq(notificationDeliveries.notificationId, options.notificationId));
    if (options.status) conditions.push(eq(notificationDeliveries.status, options.status));
    const rows = await this.db.select().from(notificationDeliveries).where(and(...conditions)).orderBy(desc(notificationDeliveries.createdAt)).limit(Math.min(Math.max(options.limit ?? 100, 1), 500));
    return rows.map(delivery);
  }
  async listPending(tenantId: string, now: Date, limit: number) {
    const rows = await this.db.select().from(notificationDeliveries).where(and(
      eq(notificationDeliveries.tenantId, tenantId),
      inArray(notificationDeliveries.status, ["PENDING", "FAILED"]),
      or(isNull(notificationDeliveries.nextAttemptAt), lte(notificationDeliveries.nextAttemptAt, now)),
    )).orderBy(asc(notificationDeliveries.createdAt)).limit(Math.min(Math.max(limit, 1), 500));
    return rows.map(delivery);
  }
  async save(value: NotificationDeliveryData) {
    await this.db.insert(notificationDeliveries).values(value).onConflictDoUpdate({
      target: notificationDeliveries.id,
      set: {
        status: value.status,
        attempts: value.attempts,
        lastError: value.lastError,
        providerReference: value.providerReference,
        nextAttemptAt: value.nextAttemptAt,
        sentAt: value.sentAt,
        updatedAt: value.updatedAt,
      },
    });
  }
}

void notificationSequences;
