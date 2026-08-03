import { Notification } from "../entities/notification.js";
import { NotificationId, TenantId } from "../value-objects/identifiers.js";
import { NotificationStatus } from "../enums/notification-status.js";
import { NotificationChannel } from "../enums/notification-channel.js";
import { INotificationRepository, NotificationFilterOptions } from "../repositories/notification-repository.interface.js";
import { INotificationProvider } from "../providers/notification-provider.interface.js";
import { NotificationTemplateEngine, RenderResult } from "../template-engine/notification-template-engine.js";
import {
  UserContext,
  SendNotificationInput,
  NotificationResultDTO,
  IAuditLogger,
  IDomainEventPublisher,
  UnauthorizedError,
  TenantMismatchError,
} from "../types.js";
import {
  UnsupportedChannelError,
  NotificationNotFoundError,
  InvalidNotificationStateError,
} from "../errors/notification-errors.js";
import {
  createNotificationDeliveredEvent,
  createNotificationFailedEvent,
} from "../events/notification-events.js";
import {
  isRecoverableError,
  calculateExponentialBackoff,
  DEFAULT_RETRY_OPTIONS,
} from "./retry-policy.js";

export interface NotificationServiceConfig {
  repository: INotificationRepository;
  providers: INotificationProvider[];
  templateEngine?: NotificationTemplateEngine;
  auditLogger?: IAuditLogger;
  eventPublisher?: IDomainEventPublisher;
  maxRetries?: number;
}

export class NotificationService {
  private readonly repository: INotificationRepository;
  private readonly providers: Map<NotificationChannel, INotificationProvider>;
  private readonly templateEngine: NotificationTemplateEngine;
  private readonly auditLogger?: IAuditLogger;
  private readonly eventPublisher?: IDomainEventPublisher;
  private readonly maxRetries: number;

  constructor(config: NotificationServiceConfig) {
    this.repository = config.repository;
    this.templateEngine = config.templateEngine ?? new NotificationTemplateEngine();
    this.auditLogger = config.auditLogger;
    this.eventPublisher = config.eventPublisher;
    this.maxRetries = config.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries;

    this.providers = new Map();
    for (const provider of config.providers) {
      if (provider.channel) {
        this.providers.set(provider.channel, provider);
      }
    }
  }

  public getTemplateEngine(): NotificationTemplateEngine {
    return this.templateEngine;
  }

  private validateContext(context: UserContext, targetTenantId?: TenantId | string): void {
    if (!context || !context.userId || !context.tenantId) {
      throw new UnauthorizedError("Valid user context with tenant ID is required");
    }

    if (targetTenantId) {
      const targetStr =
        typeof targetTenantId === "string" ? targetTenantId : targetTenantId.value;
      if (context.tenantId.value !== targetStr) {
        throw new TenantMismatchError(`Access denied for tenant '${targetStr}'`);
      }
    }
  }

  private mapToResultDTO(
    notification: Notification,
    success: boolean,
    providerReference?: string,
    willRetry?: boolean
  ): NotificationResultDTO {
    return {
      notificationId: notification.id.value,
      tenantId: notification.tenantId.value,
      recipient: notification.recipient,
      channel: notification.channel,
      templateId: notification.templateId,
      status: notification.status,
      retryCount: notification.retryCount,
      lastError: notification.lastError,
      sentAt: notification.sentAt,
      createdAt: notification.createdAt,
      success,
      providerReference,
      willRetry,
    };
  }

  public async sendNotification(
    input: SendNotificationInput,
    context: UserContext
  ): Promise<NotificationResultDTO> {
    this.validateContext(context, input.tenantId);

    const channel =
      typeof input.channel === "string"
        ? (input.channel.toLowerCase() as NotificationChannel)
        : input.channel;

    // Create Notification domain entity
    const notification = Notification.create({
      tenantId: context.tenantId,
      recipient: input.recipient,
      channel,
      templateId: input.templateId,
      metadata: {
        ...(input.metadata ?? {}),
        variables: input.variables ?? {},
      },
    });

    await this.repository.save(notification);

    await this.auditLogger?.log({
      tenantId: context.tenantId.value,
      userId: context.userId,
      action: "NOTIFICATION_CREATED",
      resourceType: "NOTIFICATION",
      resourceId: notification.id.value,
      details: {
        recipient: notification.recipient,
        channel: notification.channel,
        templateId: notification.templateId,
      },
      timestamp: new Date(),
    });

    // Execute delivery attempt
    return this.executeDelivery(notification, input.variables ?? {}, context);
  }

  public async retryNotification(
    notificationId: string,
    context: UserContext
  ): Promise<NotificationResultDTO> {
    this.validateContext(context);

    const notifId = NotificationId.fromString(notificationId);
    const notification = await this.repository.findById(context.tenantId, notifId);

    if (!notification) {
      throw new NotificationNotFoundError(notificationId);
    }

    if (
      notification.status === NotificationStatus.SENT ||
      notification.status === NotificationStatus.CANCELLED
    ) {
      throw new InvalidNotificationStateError(
        `Cannot retry notification '${notificationId}' in '${notification.status}' state`
      );
    }

    if (notification.retryCount >= this.maxRetries) {
      const dto = this.mapToResultDTO(
        notification,
        false,
        undefined,
        false
      );
      dto.lastError = `Max retry limit (${this.maxRetries}) reached`;
      return dto;
    }

    const variables = (notification.metadata?.variables as Record<string, unknown>) ?? {};
    return this.executeDelivery(notification, variables, context);
  }

  private async executeDelivery(
    notification: Notification,
    variables: Record<string, unknown>,
    context: UserContext
  ): Promise<NotificationResultDTO> {
    const provider = this.providers.get(notification.channel);
    if (!provider) {
      const err = new UnsupportedChannelError(notification.channel);
      notification.markAsFailed(err.message);
      await this.repository.save(notification);

      await this.eventPublisher?.publish(
        createNotificationFailedEvent(notification, err.message, false)
      );

      return this.mapToResultDTO(notification, false, undefined, false);
    }

    // Render template
    let rendered: RenderResult;
    try {
      rendered = this.templateEngine.renderTemplate(notification.templateId, variables);
    } catch (err: any) {
      const errorMessage = err?.message ?? "Template rendering failed";
      notification.markAsFailed(errorMessage);
      await this.repository.save(notification);

      await this.auditLogger?.log({
        tenantId: context.tenantId.value,
        userId: context.userId,
        action: "NOTIFICATION_FAILED",
        resourceType: "NOTIFICATION",
        resourceId: notification.id.value,
        details: { error: errorMessage, templateId: notification.templateId },
        timestamp: new Date(),
      });

      await this.eventPublisher?.publish(
        createNotificationFailedEvent(notification, errorMessage, false)
      );

      return this.mapToResultDTO(notification, false, undefined, false);
    }

    // Mark status as PROCESSING
    try {
      notification.markAsProcessing();
      await this.repository.save(notification);
    } catch (err: any) {
      // If state transition fails, return current status
      return this.mapToResultDTO(notification, false, undefined, false);
    }

    // Send via provider
    try {
      const result = await provider.send({
        to: notification.recipient,
        subject: rendered.subject,
        body: rendered.body,
        channel: notification.channel,
        metadata: notification.metadata,
      });

      if (result.success) {
        notification.markAsSent(result.providerMessageId);
        await this.repository.save(notification);

        await this.auditLogger?.log({
          tenantId: context.tenantId.value,
          userId: context.userId,
          action: "NOTIFICATION_DELIVERED",
          resourceType: "NOTIFICATION",
          resourceId: notification.id.value,
          details: {
            providerName: provider.providerName,
            providerReference: result.providerMessageId,
          },
          timestamp: new Date(),
        });

        await this.eventPublisher?.publish(
          createNotificationDeliveredEvent(notification, result.providerMessageId)
        );

        return this.mapToResultDTO(notification, true, result.providerMessageId, false);
      } else {
        const errorMsg = result.error ?? "Provider delivery failed";
        return this.handleDeliveryFailure(notification, errorMsg, context);
      }
    } catch (error: any) {
      const errorMsg = error?.message ?? "Provider dispatch exception";
      return this.handleDeliveryFailure(notification, errorMsg, context, error);
    }
  }

  private async handleDeliveryFailure(
    notification: Notification,
    errorMessage: string,
    context: UserContext,
    rawError?: unknown
  ): Promise<NotificationResultDTO> {
    notification.markAsFailed(errorMessage);
    await this.repository.save(notification);

    const recoverable = isRecoverableError(rawError ?? new Error(errorMessage));
    const willRetry = recoverable && notification.retryCount < this.maxRetries;
    const nextBackoffMs = willRetry ? calculateExponentialBackoff(notification.retryCount) : 0;

    await this.auditLogger?.log({
      tenantId: context.tenantId.value,
      userId: context.userId,
      action: willRetry ? "NOTIFICATION_RETRY_SCHEDULED" : "NOTIFICATION_FAILED",
      resourceType: "NOTIFICATION",
      resourceId: notification.id.value,
      details: {
        error: errorMessage,
        retryCount: notification.retryCount,
        maxRetries: this.maxRetries,
        willRetry,
        nextBackoffMs,
      },
      timestamp: new Date(),
    });

    await this.eventPublisher?.publish(
      createNotificationFailedEvent(notification, errorMessage, willRetry)
    );

    return this.mapToResultDTO(notification, false, undefined, willRetry);
  }

  public async getNotifications(
    context: UserContext,
    options?: NotificationFilterOptions
  ): Promise<{ notifications: NotificationResultDTO[]; total: number }> {
    this.validateContext(context);

    const { notifications, total } = await this.repository.findByTenant(
      context.tenantId,
      options
    );

    const dtos = notifications.map((n) =>
      this.mapToResultDTO(n, n.status === NotificationStatus.SENT)
    );

    return { notifications: dtos, total };
  }

  public async getNotificationById(
    notificationId: string,
    context: UserContext
  ): Promise<NotificationResultDTO | null> {
    this.validateContext(context);

    const notifId = NotificationId.fromString(notificationId);
    const notification = await this.repository.findById(context.tenantId, notifId);

    if (!notification) return null;

    return this.mapToResultDTO(notification, notification.status === NotificationStatus.SENT);
  }
}
