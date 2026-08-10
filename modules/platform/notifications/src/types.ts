export type NotificationSeverity = "INFO" | "SUCCESS" | "WARNING" | "ERROR";
export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "PUSH";
export type NotificationDeliveryStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "EXHAUSTED";
export type NotificationTemplateStatus = "ACTIVE" | "INACTIVE";

export interface NotificationRecordData {
  readonly id: string;
  readonly sequence: number;
  readonly tenantId: string;
  readonly recipientUserId: string | null;
  readonly kind: string;
  readonly title: string;
  readonly message: string;
  readonly severity: NotificationSeverity;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NotificationPreferenceData {
  readonly tenantId: string;
  readonly userId: string;
  readonly emailEnabled: boolean;
  readonly smsEnabled: boolean;
  readonly pushEnabled: boolean;
  readonly emailAddress: string | null;
  readonly smsNumber: string | null;
  readonly pushEndpoint: string | null;
  readonly updatedAt: Date;
}

export interface NotificationTemplateData {
  readonly id: string;
  readonly tenantId: string;
  readonly key: string;
  readonly channel: Exclude<NotificationChannel, "IN_APP"> | "IN_APP";
  readonly titleTemplate: string;
  readonly bodyTemplate: string;
  readonly status: NotificationTemplateStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NotificationDeliveryData {
  readonly id: string;
  readonly tenantId: string;
  readonly notificationId: string;
  readonly channel: NotificationChannel;
  readonly destination: string | null;
  readonly status: NotificationDeliveryStatus;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly providerReference: string | null;
  readonly nextAttemptAt: Date | null;
  readonly sentAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NotificationProviderResult {
  readonly providerReference?: string | null;
}

export interface NotificationProvider {
  readonly channel: Exclude<NotificationChannel, "IN_APP">;
  send(input: {
    notification: NotificationRecordData;
    delivery: NotificationDeliveryData;
  }): Promise<NotificationProviderResult>;
}

export type NotificationProviderMap = Partial<Record<Exclude<NotificationChannel, "IN_APP">, NotificationProvider>>;

export interface QueueNotificationSubject {
  readonly id: string;
  readonly publicToken: string;
  readonly ticketNumber: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly customer: Readonly<{
    userId?: string | null;
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  }>;
}
