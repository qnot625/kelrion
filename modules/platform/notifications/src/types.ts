import { TenantId } from "./value-objects/identifiers.js";
import { NotificationStatus } from "./enums/notification-status.js";
import { NotificationChannel } from "./enums/notification-channel.js";
import { IDomainEvent } from "./events/notification-events.js";

export enum UserRole {
  OWNER = "OWNER",
  STAFF = "STAFF",
  MEMBER = "MEMBER",
}

export interface UserContext {
  userId: string;
  tenantId: TenantId;
  role: UserRole;
}

export interface AuditLogEvent {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface IAuditLogger {
  log(event: AuditLogEvent): Promise<void>;
}

export interface IDomainEventPublisher {
  publish(event: IDomainEvent): Promise<void>;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized operation") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class TenantMismatchError extends Error {
  constructor(message = "Tenant mismatch") {
    super(message);
    this.name = "TenantMismatchError";
  }
}

export interface SendNotificationInput {
  tenantId?: TenantId | string;
  recipient: string;
  channel: NotificationChannel | string;
  templateId: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface NotificationResultDTO {
  notificationId: string;
  tenantId: string;
  recipient: string;
  channel: NotificationChannel;
  templateId: string;
  status: NotificationStatus;
  retryCount: number;
  lastError: string | null;
  sentAt: Date | null;
  createdAt: Date;
  success: boolean;
  providerReference?: string;
  willRetry?: boolean;
}
