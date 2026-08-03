import { Notification } from "../entities/notification.js";
import { NotificationId, TenantId } from "../value-objects/identifiers.js";
import {
  INotificationRepository,
  NotificationFilterOptions,
} from "./notification-repository.interface.js";

export class InMemoryNotificationRepository implements INotificationRepository {
  private readonly notificationsMap = new Map<string, Notification>();

  async save(notification: Notification): Promise<void> {
    this.notificationsMap.set(notification.id.value, notification);
  }

  async findById(tenantId: TenantId, id: NotificationId): Promise<Notification | null> {
    const notification = this.notificationsMap.get(id.value);
    if (!notification) return null;
    if (!notification.tenantId.equals(tenantId)) return null;
    return notification;
  }

  async findByTenant(
    tenantId: TenantId,
    options: NotificationFilterOptions = {}
  ): Promise<{ notifications: Notification[]; total: number }> {
    const all = Array.from(this.notificationsMap.values()).filter((n) =>
      n.tenantId.equals(tenantId)
    );

    let filtered = all;
    if (options.status) {
      filtered = filtered.filter((n) => n.status === options.status);
    }

    if (options.recipient) {
      const recLower = options.recipient.toLowerCase();
      filtered = filtered.filter((n) =>
        n.recipient.toLowerCase().includes(recLower)
      );
    }

    // Sort by createdAt descending
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = filtered.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 20;

    const paginated = filtered.slice(offset, offset + limit);

    return { notifications: paginated, total };
  }

  public clear(): void {
    this.notificationsMap.clear();
  }
}
