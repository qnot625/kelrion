import { Notification } from "../entities/notification.js";
import { NotificationId, TenantId } from "../value-objects/identifiers.js";
import { NotificationStatus } from "../enums/notification-status.js";

export interface NotificationFilterOptions {
  status?: NotificationStatus;
  recipient?: string;
  limit?: number;
  offset?: number;
}

export interface INotificationRepository {
  save(notification: Notification): Promise<void>;
  findById(tenantId: TenantId, id: NotificationId): Promise<Notification | null>;
  findByTenant(
    tenantId: TenantId,
    options?: NotificationFilterOptions
  ): Promise<{ notifications: Notification[]; total: number }>;
}
