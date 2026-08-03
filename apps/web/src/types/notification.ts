export type NotificationChannel = "email" | "sms" | "EMAIL" | "SMS";
export type NotificationStatus = "pending" | "delivered" | "failed" | "retrying";

export interface NotificationLog {
  notificationId: string;
  tenantId: string;
  recipient: string;
  channel: NotificationChannel;
  templateId: string;
  status: NotificationStatus;
  retryCount: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  success: boolean;
  providerReference?: string;
  willRetry?: boolean;
  variables?: Record<string, unknown>;
}

export interface NotificationTemplateItem {
  id: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  requiredVariables?: string[];
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NotificationListResponse {
  data: NotificationLog[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
