import type {
  NotificationDeliveryData,
  NotificationPreferenceData,
  NotificationRecordData,
  NotificationTemplateData,
} from "./types.js";

export interface NotificationRepository {
  create(notification: Omit<NotificationRecordData, "sequence">): Promise<NotificationRecordData>;
  findById(tenantId: string, id: string): Promise<NotificationRecordData | null>;
  listForUser(tenantId: string, userId: string, options?: { afterSequence?: number; limit?: number; unreadOnly?: boolean }): Promise<NotificationRecordData[]>;
  unreadCount(tenantId: string, userId: string): Promise<number>;
  markRead(tenantId: string, userId: string, id: string, readAt: Date): Promise<NotificationRecordData | null>;
  markAllRead(tenantId: string, userId: string, readAt: Date): Promise<number>;
}

export interface NotificationPreferenceRepository {
  find(tenantId: string, userId: string): Promise<NotificationPreferenceData | null>;
  save(preference: NotificationPreferenceData): Promise<void>;
}

export interface NotificationTemplateRepository {
  findById(tenantId: string, id: string): Promise<NotificationTemplateData | null>;
  findByKey(tenantId: string, key: string, channel: NotificationTemplateData["channel"]): Promise<NotificationTemplateData | null>;
  list(tenantId: string): Promise<NotificationTemplateData[]>;
  save(template: NotificationTemplateData): Promise<void>;
}

export interface NotificationDeliveryRepository {
  findById(tenantId: string, id: string): Promise<NotificationDeliveryData | null>;
  list(tenantId: string, options?: { notificationId?: string; status?: NotificationDeliveryData["status"]; limit?: number }): Promise<NotificationDeliveryData[]>;
  listPending(tenantId: string, now: Date, limit: number): Promise<NotificationDeliveryData[]>;
  save(delivery: NotificationDeliveryData): Promise<void>;
}
