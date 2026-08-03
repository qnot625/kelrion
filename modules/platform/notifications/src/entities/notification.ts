import { NotificationId, TenantId } from "../value-objects/identifiers.js";
import { NotificationStatus } from "../enums/notification-status.js";
import { NotificationChannel } from "../enums/notification-channel.js";
import {
  InvalidNotificationDataError,
  InvalidNotificationStateError,
} from "../errors/notification-errors.js";

export interface CreateNotificationInput {
  tenantId: TenantId | string;
  recipient: string;
  channel: NotificationChannel | string;
  templateId: string;
  metadata?: Record<string, unknown>;
}

export interface ReconstituteNotificationInput {
  id: NotificationId | string;
  tenantId: TenantId | string;
  recipient: string;
  channel: NotificationChannel | string;
  templateId: string;
  status: NotificationStatus | string;
  metadata?: Record<string, unknown>;
  retryCount?: number;
  lastError?: string | null;
  sentAt?: Date | string | null;
  createdAt?: Date | string;
}

export class Notification {
  private readonly _id: NotificationId;
  private readonly _tenantId: TenantId;
  private readonly _recipient: string;
  private readonly _channel: NotificationChannel;
  private readonly _templateId: string;
  private _status: NotificationStatus;
  private _metadata: Record<string, unknown>;
  private _retryCount: number;
  private _lastError: string | null;
  private _sentAt: Date | null;
  private readonly _createdAt: Date;

  private constructor(
    id: NotificationId,
    tenantId: TenantId,
    recipient: string,
    channel: NotificationChannel,
    templateId: string,
    status: NotificationStatus,
    metadata: Record<string, unknown>,
    retryCount: number,
    lastError: string | null,
    sentAt: Date | null,
    createdAt: Date
  ) {
    this._id = id;
    this._tenantId = tenantId;
    this._recipient = recipient;
    this._channel = channel;
    this._templateId = templateId;
    this._status = status;
    this._metadata = { ...metadata };
    this._retryCount = retryCount;
    this._lastError = lastError;
    this._sentAt = sentAt;
    this._createdAt = createdAt;

    this.validateInvariants();
  }

  private validateInvariants(): void {
    if (!this._recipient || typeof this._recipient !== "string" || this._recipient.trim().length === 0) {
      throw new InvalidNotificationDataError("Recipient is required and cannot be empty");
    }

    if (!this._templateId || typeof this._templateId !== "string" || this._templateId.trim().length === 0) {
      throw new InvalidNotificationDataError("Template ID is required and cannot be empty");
    }

    if (this._channel === NotificationChannel.EMAIL) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this._recipient.trim())) {
        throw new InvalidNotificationDataError(`Invalid email recipient format: '${this._recipient}'`);
      }
    } else if (this._channel === NotificationChannel.SMS) {
      const phoneDigits = this._recipient.replace(/\D/g, "");
      if (phoneDigits.length < 7) {
        throw new InvalidNotificationDataError(`Invalid SMS phone number format: '${this._recipient}'`);
      }
    } else {
      throw new InvalidNotificationDataError(`Unsupported notification channel: '${this._channel}'`);
    }
  }

  public static create(input: CreateNotificationInput): Notification {
    const tenantId =
      typeof input.tenantId === "string"
        ? TenantId.fromString(input.tenantId)
        : input.tenantId;

    const channel =
      typeof input.channel === "string"
        ? (input.channel as NotificationChannel)
        : input.channel;

    return new Notification(
      NotificationId.generate(),
      tenantId,
      input.recipient,
      channel,
      input.templateId,
      NotificationStatus.PENDING,
      input.metadata ?? {},
      0,
      null,
      null,
      new Date()
    );
  }

  public static reconstitute(input: ReconstituteNotificationInput): Notification {
    const id =
      typeof input.id === "string" ? NotificationId.fromString(input.id) : input.id;
    const tenantId =
      typeof input.tenantId === "string"
        ? TenantId.fromString(input.tenantId)
        : input.tenantId;
    const channel =
      typeof input.channel === "string"
        ? (input.channel as NotificationChannel)
        : input.channel;
    const status =
      typeof input.status === "string"
        ? (input.status as NotificationStatus)
        : input.status;

    const sentAt = input.sentAt ? new Date(input.sentAt) : null;
    const createdAt = input.createdAt ? new Date(input.createdAt) : new Date();

    return new Notification(
      id,
      tenantId,
      input.recipient,
      channel,
      input.templateId,
      status,
      input.metadata ?? {},
      input.retryCount ?? 0,
      input.lastError ?? null,
      sentAt,
      createdAt
    );
  }

  // Getters
  public get id(): NotificationId {
    return this._id;
  }

  public get tenantId(): TenantId {
    return this._tenantId;
  }

  public get recipient(): string {
    return this._recipient;
  }

  public get channel(): NotificationChannel {
    return this._channel;
  }

  public get templateId(): string {
    return this._templateId;
  }

  public get status(): NotificationStatus {
    return this._status;
  }

  public get metadata(): Record<string, unknown> {
    return { ...this._metadata };
  }

  public get retryCount(): number {
    return this._retryCount;
  }

  public get lastError(): string | null {
    return this._lastError;
  }

  public get sentAt(): Date | null {
    return this._sentAt;
  }

  public get createdAt(): Date {
    return new Date(this._createdAt);
  }

  // Business logic transitions
  public markAsProcessing(): void {
    if (
      this._status === NotificationStatus.SENT ||
      this._status === NotificationStatus.CANCELLED
    ) {
      throw new InvalidNotificationStateError(
        `Cannot process notification in '${this._status}' state`
      );
    }
    this._status = NotificationStatus.PROCESSING;
  }

  public markAsSent(providerReference?: string): void {
    if (this._status === NotificationStatus.CANCELLED) {
      throw new InvalidNotificationStateError(
        "Cannot mark a cancelled notification as sent"
      );
    }
    this._status = NotificationStatus.SENT;
    this._sentAt = new Date();
    if (providerReference) {
      this._metadata = { ...this._metadata, providerReference };
    }
  }

  public markAsFailed(errorMessage: string): void {
    if (this._status === NotificationStatus.SENT) {
      throw new InvalidNotificationStateError(
        "Cannot mark an already delivered notification as failed"
      );
    }
    this._status = NotificationStatus.FAILED;
    this._retryCount += 1;
    this._lastError = errorMessage;
  }

  public cancel(reason?: string): void {
    if (this._status === NotificationStatus.SENT) {
      throw new InvalidNotificationStateError(
        "Cannot cancel a notification that has already been sent"
      );
    }
    this._status = NotificationStatus.CANCELLED;
    if (reason) {
      this._metadata = { ...this._metadata, cancelReason: reason };
    }
  }
}
