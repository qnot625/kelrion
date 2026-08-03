import { NotificationChannel } from "../enums/notification-channel.js";

export interface NotificationPayload {
  to: string;
  subject?: string;
  body: string;
  channel: NotificationChannel;
  metadata?: Record<string, unknown>;
}

export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
  sentAt?: Date;
}

export interface INotificationProvider {
  readonly channel: NotificationChannel;
  readonly providerName: string;
  send(payload: NotificationPayload): Promise<ProviderSendResult>;
}
