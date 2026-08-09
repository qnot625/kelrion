import type {
  NotificationDeliveryRepository,
  NotificationPreferenceRepository,
  NotificationRepository,
  NotificationTemplateRepository,
} from "./repositories.js";
import type {
  NotificationDeliveryData,
  NotificationPreferenceData,
  NotificationRecordData,
  NotificationTemplateData,
} from "./types.js";

function cloneNotification(value: NotificationRecordData): NotificationRecordData {
  return { ...structuredClone(value), readAt: value.readAt ? new Date(value.readAt) : null, createdAt: new Date(value.createdAt) };
}
function clonePreference(value: NotificationPreferenceData): NotificationPreferenceData {
  return { ...structuredClone(value), updatedAt: new Date(value.updatedAt) };
}
function cloneTemplate(value: NotificationTemplateData): NotificationTemplateData {
  return { ...structuredClone(value), createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) };
}
function cloneDelivery(value: NotificationDeliveryData): NotificationDeliveryData {
  return {
    ...structuredClone(value),
    nextAttemptAt: value.nextAttemptAt ? new Date(value.nextAttemptAt) : null,
    sentAt: value.sentAt ? new Date(value.sentAt) : null,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly items = new Map<string, NotificationRecordData>();
  private readonly sequences = new Map<string, number>();

  async create(notification: Omit<NotificationRecordData, "sequence">): Promise<NotificationRecordData> {
    const sequence = (this.sequences.get(notification.tenantId) ?? 0) + 1;
    this.sequences.set(notification.tenantId, sequence);
    const stored = cloneNotification({ ...notification, sequence });
    this.items.set(`${notification.tenantId}:${notification.id}`, stored);
    return cloneNotification(stored);
  }

  async findById(tenantId: string, id: string) {
    const value = this.items.get(`${tenantId}:${id}`);
    return value ? cloneNotification(value) : null;
  }

  async listForUser(tenantId: string, userId: string, options: { afterSequence?: number; limit?: number; unreadOnly?: boolean } = {}) {
    return [...this.items.values()]
      .filter((item) => item.tenantId === tenantId && item.recipientUserId === userId)
      .filter((item) => item.sequence > (options.afterSequence ?? 0))
      .filter((item) => !options.unreadOnly || item.readAt === null)
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, Math.min(Math.max(options.limit ?? 100, 1), 500))
      .map(cloneNotification);
  }

  async unreadCount(tenantId: string, userId: string) {
    return [...this.items.values()].filter((item) => item.tenantId === tenantId && item.recipientUserId === userId && item.readAt === null).length;
  }

  async markRead(tenantId: string, userId: string, id: string, readAt: Date) {
    const key = `${tenantId}:${id}`;
    const item = this.items.get(key);
    if (!item || item.recipientUserId !== userId) return null;
    const updated = cloneNotification({ ...item, readAt: item.readAt ?? readAt });
    this.items.set(key, updated);
    return cloneNotification(updated);
  }

  async markAllRead(tenantId: string, userId: string, readAt: Date) {
    let updated = 0;
    for (const [key, item] of this.items) {
      if (item.tenantId !== tenantId || item.recipientUserId !== userId || item.readAt) continue;
      this.items.set(key, cloneNotification({ ...item, readAt }));
      updated += 1;
    }
    return updated;
  }
}

export class InMemoryNotificationPreferenceRepository implements NotificationPreferenceRepository {
  private readonly items = new Map<string, NotificationPreferenceData>();
  async find(tenantId: string, userId: string) {
    const value = this.items.get(`${tenantId}:${userId}`);
    return value ? clonePreference(value) : null;
  }
  async save(preference: NotificationPreferenceData) {
    this.items.set(`${preference.tenantId}:${preference.userId}`, clonePreference(preference));
  }
}

export class InMemoryNotificationTemplateRepository implements NotificationTemplateRepository {
  private readonly items = new Map<string, NotificationTemplateData>();
  async findById(tenantId: string, id: string) {
    const value = this.items.get(`${tenantId}:${id}`);
    return value ? cloneTemplate(value) : null;
  }
  async findByKey(tenantId: string, key: string, channel: NotificationTemplateData["channel"]) {
    const value = [...this.items.values()].find((item) => item.tenantId === tenantId && item.key === key && item.channel === channel);
    return value ? cloneTemplate(value) : null;
  }
  async list(tenantId: string) {
    return [...this.items.values()].filter((item) => item.tenantId === tenantId).sort((a, b) => a.key.localeCompare(b.key) || a.channel.localeCompare(b.channel)).map(cloneTemplate);
  }
  async save(template: NotificationTemplateData) {
    this.items.set(`${template.tenantId}:${template.id}`, cloneTemplate(template));
  }
}

export class InMemoryNotificationDeliveryRepository implements NotificationDeliveryRepository {
  private readonly items = new Map<string, NotificationDeliveryData>();
  async findById(tenantId: string, id: string) {
    const value = this.items.get(`${tenantId}:${id}`);
    return value ? cloneDelivery(value) : null;
  }
  async list(tenantId: string, options: { notificationId?: string; status?: NotificationDeliveryData["status"]; limit?: number } = {}) {
    return [...this.items.values()]
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => !options.notificationId || item.notificationId === options.notificationId)
      .filter((item) => !options.status || item.status === options.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, Math.min(Math.max(options.limit ?? 100, 1), 500))
      .map(cloneDelivery);
  }
  async listPending(tenantId: string, now: Date, limit: number) {
    return [...this.items.values()]
      .filter((item) => item.tenantId === tenantId && (item.status === "PENDING" || item.status === "FAILED"))
      .filter((item) => !item.nextAttemptAt || item.nextAttemptAt.getTime() <= now.getTime())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, Math.min(Math.max(limit, 1), 500))
      .map(cloneDelivery);
  }
  async save(delivery: NotificationDeliveryData) {
    this.items.set(`${delivery.tenantId}:${delivery.id}`, cloneDelivery(delivery));
  }
}
