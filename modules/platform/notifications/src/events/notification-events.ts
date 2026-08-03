import { Notification } from "../entities/notification.js";

export const NOTIFICATION_DELIVERED_EVENT_TYPE = "notification.delivered.v1";
export const NOTIFICATION_FAILED_EVENT_TYPE = "notification.failed.v1";

export interface NotificationDeliveredPayload {
  notificationId: string;
  tenantId: string;
  recipient: string;
  channel: string;
  templateId: string;
  sentAt: string;
  providerReference?: string;
}

export interface NotificationFailedPayload {
  notificationId: string;
  tenantId: string;
  recipient: string;
  channel: string;
  templateId: string;
  errorMessage: string;
  retryCount: number;
  willRetry: boolean;
}

export interface IDomainEvent<T = unknown> {
  eventId: string;
  eventType: string;
  tenantId: string;
  aggregateId: string;
  occurredAt: Date;
  payload: T;
}

export function createNotificationDeliveredEvent(
  notification: Notification,
  providerReference?: string
): IDomainEvent<NotificationDeliveredPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventType: NOTIFICATION_DELIVERED_EVENT_TYPE,
    tenantId: notification.tenantId.value,
    aggregateId: notification.id.value,
    occurredAt: notification.sentAt ?? new Date(),
    payload: {
      notificationId: notification.id.value,
      tenantId: notification.tenantId.value,
      recipient: notification.recipient,
      channel: notification.channel,
      templateId: notification.templateId,
      sentAt: (notification.sentAt ?? new Date()).toISOString(),
      providerReference,
    },
  };
}

export function createNotificationFailedEvent(
  notification: Notification,
  errorMessage: string,
  willRetry: boolean
): IDomainEvent<NotificationFailedPayload> {
  return {
    eventId: crypto.randomUUID(),
    eventType: NOTIFICATION_FAILED_EVENT_TYPE,
    tenantId: notification.tenantId.value,
    aggregateId: notification.id.value,
    occurredAt: new Date(),
    payload: {
      notificationId: notification.id.value,
      tenantId: notification.tenantId.value,
      recipient: notification.recipient,
      channel: notification.channel,
      templateId: notification.templateId,
      errorMessage,
      retryCount: notification.retryCount,
      willRetry,
    },
  };
}
