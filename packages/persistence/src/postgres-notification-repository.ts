import { and, eq, desc, count, like } from "drizzle-orm";
import {
  Notification,
  NotificationId,
  TenantId,
  INotificationRepository,
  NotificationFilterOptions,
} from "@klerion/notifications";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PostgresNotificationRepository implements INotificationRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, id: NotificationId): Promise<Notification | null> {
    const rows = await this.db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.tenantId, tenantId.value),
          eq(schema.notifications.id, id.value)
        )
      );

    const row = rows[0];
    if (!row) return null;

    return Notification.reconstitute({
      id: row.id,
      tenantId: row.tenantId,
      recipient: row.recipient,
      channel: row.channel,
      templateId: row.templateId,
      status: row.status,
      metadata: row.metadata,
      retryCount: row.retryCount,
      lastError: row.lastError,
      sentAt: row.sentAt,
      createdAt: row.createdAt,
    });
  }

  async findByTenant(
    tenantId: TenantId,
    options: NotificationFilterOptions = {}
  ): Promise<{ notifications: Notification[]; total: number }> {
    const conditions = [eq(schema.notifications.tenantId, tenantId.value)];

    if (options.status) {
      conditions.push(eq(schema.notifications.status, options.status));
    }

    if (options.recipient) {
      conditions.push(like(schema.notifications.recipient, `%${options.recipient}%`));
    }

    const whereClause = and(...conditions);

    const countResult = await this.db
      .select({ total: count() })
      .from(schema.notifications)
      .where(whereClause);

    const total = Number(countResult[0]?.total ?? 0);

    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;

    const rows = await this.db
      .select()
      .from(schema.notifications)
      .where(whereClause)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const notifications = rows.map((row) =>
      Notification.reconstitute({
        id: row.id,
        tenantId: row.tenantId,
        recipient: row.recipient,
        channel: row.channel,
        templateId: row.templateId,
        status: row.status,
        metadata: row.metadata,
        retryCount: row.retryCount,
        lastError: row.lastError,
        sentAt: row.sentAt,
        createdAt: row.createdAt,
      })
    );

    return { notifications, total };
  }

  async save(notification: Notification): Promise<void> {
    await this.db
      .insert(schema.notifications)
      .values({
        id: notification.id.value,
        tenantId: notification.tenantId.value,
        recipient: notification.recipient,
        channel: notification.channel,
        templateId: notification.templateId,
        status: notification.status,
        metadata: notification.metadata,
        retryCount: notification.retryCount,
        lastError: notification.lastError,
        sentAt: notification.sentAt,
        createdAt: notification.createdAt,
      })
      .onConflictDoUpdate({
        target: schema.notifications.id,
        set: {
          status: notification.status,
          metadata: notification.metadata,
          retryCount: notification.retryCount,
          lastError: notification.lastError,
          sentAt: notification.sentAt,
        },
      });
  }
}
