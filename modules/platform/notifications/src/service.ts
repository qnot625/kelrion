import { randomUUID } from "node:crypto";
import type { AuditLog } from "@adminops/audit";
import { NotificationNotFoundError, NotificationTemplateNotFoundError, NotificationValidationError } from "./errors.js";
import type {
  NotificationDeliveryRepository,
  NotificationPreferenceRepository,
  NotificationRepository,
  NotificationTemplateRepository,
} from "./repositories.js";
import type {
  NotificationChannel,
  NotificationDeliveryData,
  NotificationPreferenceData,
  NotificationProviderMap,
  NotificationRecordData,
  NotificationSeverity,
  NotificationTemplateData,
  QueueNotificationSubject,
} from "./types.js";

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000] as const;

function render(template: string, values: Readonly<Record<string, unknown>>): string {
  return template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === null || value === undefined) return "";
    return typeof value === "string" ? value : String(value);
  });
}

function defaultPreference(tenantId: string, userId: string): NotificationPreferenceData {
  return {
    tenantId,
    userId,
    emailEnabled: false,
    smsEnabled: false,
    pushEnabled: false,
    emailAddress: null,
    smsNumber: null,
    pushEndpoint: null,
    updatedAt: new Date(),
  };
}

function normalizeTemplateKey(key: string): string {
  const value = key.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(value)) {
    throw new NotificationValidationError("Template key must contain 2-80 lowercase letters, numbers, dots, dashes or underscores");
  }
  return value;
}

export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly preferences: NotificationPreferenceRepository,
    private readonly templates: NotificationTemplateRepository,
    private readonly deliveries: NotificationDeliveryRepository,
    private readonly auditLog?: AuditLog,
  ) {}

  async notify(input: {
    tenantId: string;
    recipientUserId?: string | null;
    kind: string;
    title: string;
    message: string;
    severity?: NotificationSeverity;
    entityType?: string | null;
    entityId?: string | null;
    data?: Readonly<Record<string, unknown>>;
    channels?: readonly NotificationChannel[];
    usePreferences?: boolean;
    destinations?: Partial<Record<Exclude<NotificationChannel, "IN_APP">, string | null>>;
    actorUserId?: string | null;
  }): Promise<NotificationRecordData> {
    const title = input.title.trim();
    const message = input.message.trim();
    if (!title || title.length > 160) throw new NotificationValidationError("Notification title must contain 1-160 characters");
    if (!message || message.length > 4000) throw new NotificationValidationError("Notification message must contain 1-4000 characters");
    if (!input.kind.trim()) throw new NotificationValidationError("Notification kind is required");

    const now = new Date();
    const notification = await this.notifications.create({
      id: randomUUID(),
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId?.trim() || null,
      kind: input.kind.trim(),
      title,
      message,
      severity: input.severity ?? "INFO",
      entityType: input.entityType?.trim() || null,
      entityId: input.entityId?.trim() || null,
      data: structuredClone(input.data ?? {}),
      readAt: null,
      createdAt: now,
    });

    const preference = notification.recipientUserId
      ? await this.getPreferences(input.tenantId, notification.recipientUserId)
      : null;
    const channels = new Set<NotificationChannel>(input.channels ?? (notification.recipientUserId ? ["IN_APP"] : []));
    if (input.usePreferences && preference) {
      channels.add("IN_APP");
      if (preference.emailEnabled) channels.add("EMAIL");
      if (preference.smsEnabled) channels.add("SMS");
      if (preference.pushEnabled) channels.add("PUSH");
    }

    for (const channel of channels) {
      const destination = this.destination(channel, preference, input.destinations);
      const canDeliver = channel === "IN_APP" ? Boolean(notification.recipientUserId) : Boolean(destination);
      const delivery: NotificationDeliveryData = {
        id: randomUUID(),
        tenantId: notification.tenantId,
        notificationId: notification.id,
        channel,
        destination,
        status: channel === "IN_APP" && canDeliver ? "SENT" : canDeliver ? "PENDING" : "SKIPPED",
        attempts: channel === "IN_APP" && canDeliver ? 1 : 0,
        lastError: canDeliver ? null : channel === "IN_APP" ? "No recipient user is available" : "No channel destination is configured",
        providerReference: null,
        nextAttemptAt: canDeliver && channel !== "IN_APP" ? now : null,
        sentAt: channel === "IN_APP" && canDeliver ? now : null,
        createdAt: now,
        updatedAt: now,
      };
      await this.deliveries.save(delivery);
    }

    await this.audit("notification.created", notification.tenantId, input.actorUserId ?? null, notification.id, {
      kind: notification.kind,
      recipientUserId: notification.recipientUserId,
      channels: [...channels],
    });
    return notification;
  }

  async notifyQueueEvent(input: {
    tenantId: string;
    entry: QueueNotificationSubject;
    eventType: string;
    data?: Readonly<Record<string, unknown>>;
    actorUserId?: string | null;
  }): Promise<NotificationRecordData | null> {
    const content = this.queueContent(input.entry, input.eventType, input.data ?? {});
    if (!content) return null;
    return this.notify({
      tenantId: input.tenantId,
      recipientUserId: input.entry.customer.userId ?? null,
      kind: `queue.${input.eventType.toLowerCase()}`,
      title: content.title,
      message: content.message,
      severity: content.severity,
      entityType: "queue_entry",
      entityId: input.entry.id,
      data: {
        publicToken: input.entry.publicToken,
        ticketNumber: input.entry.ticketNumber,
        branchId: input.entry.branchId,
        serviceId: input.entry.serviceId,
        ...input.data,
      },
      usePreferences: true,
      actorUserId: input.actorUserId,
    });
  }

  listForUser(tenantId: string, userId: string, options?: { afterSequence?: number; limit?: number; unreadOnly?: boolean }) {
    return this.notifications.listForUser(tenantId, userId, options);
  }

  unreadCount(tenantId: string, userId: string) {
    return this.notifications.unreadCount(tenantId, userId);
  }

  async markRead(tenantId: string, userId: string, id: string) {
    const notification = await this.notifications.markRead(tenantId, userId, id, new Date());
    if (!notification) throw new NotificationNotFoundError(id);
    return notification;
  }

  markAllRead(tenantId: string, userId: string) {
    return this.notifications.markAllRead(tenantId, userId, new Date());
  }

  async getPreferences(tenantId: string, userId: string): Promise<NotificationPreferenceData> {
    return (await this.preferences.find(tenantId, userId)) ?? defaultPreference(tenantId, userId);
  }

  async updatePreferences(input: {
    tenantId: string;
    userId: string;
    emailEnabled?: boolean;
    smsEnabled?: boolean;
    pushEnabled?: boolean;
    emailAddress?: string | null;
    smsNumber?: string | null;
    pushEndpoint?: string | null;
  }): Promise<NotificationPreferenceData> {
    const current = await this.getPreferences(input.tenantId, input.userId);
    const next: NotificationPreferenceData = {
      ...current,
      emailEnabled: input.emailEnabled ?? current.emailEnabled,
      smsEnabled: input.smsEnabled ?? current.smsEnabled,
      pushEnabled: input.pushEnabled ?? current.pushEnabled,
      emailAddress: input.emailAddress === undefined ? current.emailAddress : input.emailAddress?.trim() || null,
      smsNumber: input.smsNumber === undefined ? current.smsNumber : input.smsNumber?.trim() || null,
      pushEndpoint: input.pushEndpoint === undefined ? current.pushEndpoint : input.pushEndpoint?.trim() || null,
      updatedAt: new Date(),
    };
    if (next.emailEnabled && !next.emailAddress) throw new NotificationValidationError("An email address is required when email notifications are enabled");
    if (next.smsEnabled && !next.smsNumber) throw new NotificationValidationError("A phone number is required when SMS notifications are enabled");
    if (next.pushEnabled && !next.pushEndpoint) throw new NotificationValidationError("A push endpoint is required when push notifications are enabled");
    await this.preferences.save(next);
    await this.audit("notification.preferences_updated", input.tenantId, input.userId, input.userId, {
      emailEnabled: next.emailEnabled,
      smsEnabled: next.smsEnabled,
      pushEnabled: next.pushEnabled,
    });
    return next;
  }

  async createTemplate(input: {
    tenantId: string;
    key: string;
    channel: NotificationTemplateData["channel"];
    titleTemplate: string;
    bodyTemplate: string;
    actorUserId: string;
  }): Promise<NotificationTemplateData> {
    const key = normalizeTemplateKey(input.key);
    if (await this.templates.findByKey(input.tenantId, key, input.channel)) {
      throw new NotificationValidationError(`Template '${key}' already exists for ${input.channel}`);
    }
    const now = new Date();
    const template: NotificationTemplateData = {
      id: randomUUID(),
      tenantId: input.tenantId,
      key,
      channel: input.channel,
      titleTemplate: input.titleTemplate.trim(),
      bodyTemplate: input.bodyTemplate.trim(),
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.validateTemplate(template);
    await this.templates.save(template);
    await this.audit("notification.template_created", input.tenantId, input.actorUserId, template.id, { key, channel: template.channel });
    return template;
  }

  async updateTemplate(input: {
    tenantId: string;
    id: string;
    titleTemplate?: string;
    bodyTemplate?: string;
    status?: NotificationTemplateData["status"];
    actorUserId: string;
  }): Promise<NotificationTemplateData> {
    const current = await this.templates.findById(input.tenantId, input.id);
    if (!current) throw new NotificationTemplateNotFoundError(input.id);
    const next: NotificationTemplateData = {
      ...current,
      titleTemplate: input.titleTemplate === undefined ? current.titleTemplate : input.titleTemplate.trim(),
      bodyTemplate: input.bodyTemplate === undefined ? current.bodyTemplate : input.bodyTemplate.trim(),
      status: input.status ?? current.status,
      updatedAt: new Date(),
    };
    this.validateTemplate(next);
    await this.templates.save(next);
    await this.audit("notification.template_updated", input.tenantId, input.actorUserId, next.id, { status: next.status });
    return next;
  }

  listTemplates(tenantId: string) {
    return this.templates.list(tenantId);
  }

  async sendTemplate(input: {
    tenantId: string;
    key: string;
    channel: NotificationTemplateData["channel"];
    recipientUserId?: string | null;
    values?: Readonly<Record<string, unknown>>;
    destination?: string | null;
    actorUserId?: string | null;
  }) {
    const key = normalizeTemplateKey(input.key);
    const template = await this.templates.findByKey(input.tenantId, key, input.channel);
    if (!template || template.status !== "ACTIVE") throw new NotificationTemplateNotFoundError(`${key}:${input.channel}`);
    return this.notify({
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId,
      kind: `template.${key}`,
      title: render(template.titleTemplate, input.values ?? {}),
      message: render(template.bodyTemplate, input.values ?? {}),
      channels: [input.channel],
      destinations: input.channel === "IN_APP" ? undefined : { [input.channel]: input.destination ?? null },
      actorUserId: input.actorUserId,
      data: { templateId: template.id, templateKey: template.key },
    });
  }

  listDeliveries(tenantId: string, options?: { notificationId?: string; status?: NotificationDeliveryData["status"]; limit?: number }) {
    return this.deliveries.list(tenantId, options);
  }

  async processPending(tenantId: string, providers: NotificationProviderMap, limit = 50) {
    const due = await this.deliveries.listPending(tenantId, new Date(), Math.min(Math.max(limit, 1), 200));
    const results: NotificationDeliveryData[] = [];
    for (const delivery of due) {
      if (delivery.channel === "IN_APP") continue;
      const provider = providers[delivery.channel];
      if (!provider) continue;
      const notification = await this.notifications.findById(tenantId, delivery.notificationId);
      if (!notification) continue;
      const attempt = delivery.attempts + 1;
      try {
        const result = await provider.send({ notification, delivery });
        const now = new Date();
        const sent: NotificationDeliveryData = {
          ...delivery,
          status: "SENT",
          attempts: attempt,
          lastError: null,
          providerReference: result.providerReference?.trim() || null,
          nextAttemptAt: null,
          sentAt: now,
          updatedAt: now,
        };
        await this.deliveries.save(sent);
        results.push(sent);
      } catch (error) {
        const exhausted = attempt >= RETRY_DELAYS_MS.length;
        const now = new Date();
        const failed: NotificationDeliveryData = {
          ...delivery,
          status: exhausted ? "EXHAUSTED" : "FAILED",
          attempts: attempt,
          lastError: error instanceof Error ? error.message.slice(0, 1000) : "Notification provider failed",
          nextAttemptAt: exhausted ? null : new Date(now.getTime() + (RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)] ?? RETRY_DELAYS_MS[0])),
          updatedAt: now,
        };
        await this.deliveries.save(failed);
        results.push(failed);
      }
    }
    return results;
  }

  private destination(
    channel: NotificationChannel,
    preference: NotificationPreferenceData | null,
    overrides?: Partial<Record<Exclude<NotificationChannel, "IN_APP">, string | null>>,
  ): string | null {
    if (channel === "IN_APP") return null;
    if (overrides && channel in overrides) return overrides[channel]?.trim() || null;
    if (!preference) return null;
    if (channel === "EMAIL") return preference.emailAddress;
    if (channel === "SMS") return preference.smsNumber;
    return preference.pushEndpoint;
  }

  private validateTemplate(template: NotificationTemplateData) {
    if (!template.titleTemplate || template.titleTemplate.length > 200) throw new NotificationValidationError("Template title must contain 1-200 characters");
    if (!template.bodyTemplate || template.bodyTemplate.length > 10_000) throw new NotificationValidationError("Template body must contain 1-10000 characters");
  }

  private queueContent(entry: QueueNotificationSubject, eventType: string, data: Readonly<Record<string, unknown>>) {
    const ticket = entry.ticketNumber;
    switch (eventType) {
      case "CHECKED_IN": return { title: `Queue ticket ${ticket}`, message: `You are checked in with ticket ${ticket}.`, severity: "SUCCESS" as const };
      case "CALLED": return { title: `Ticket ${ticket} has been called`, message: data.stationId ? `Please proceed to ${String(data.stationId)}.` : "Please proceed to the service point.", severity: "WARNING" as const };
      case "RECALLED": return { title: `Ticket ${ticket} recalled`, message: data.stationId ? `Please proceed to ${String(data.stationId)} now.` : "Your ticket has been recalled.", severity: "WARNING" as const };
      case "SERVICE_STARTED": return { title: `Service started for ${ticket}`, message: "A staff member has started serving your request.", severity: "INFO" as const };
      case "COMPLETED": return { title: `Service completed for ${ticket}`, message: "Your queue service has been completed.", severity: "SUCCESS" as const };
      case "CANCELLED": return { title: `Ticket ${ticket} cancelled`, message: "Your queue ticket has been cancelled.", severity: "WARNING" as const };
      case "NO_SHOW": return { title: `Ticket ${ticket} marked no-show`, message: "Your queue ticket was marked as a no-show.", severity: "WARNING" as const };
      case "TRANSFERRED": return { title: `Ticket ${ticket} transferred`, message: "Your request has been transferred to another queue.", severity: "INFO" as const };
      case "PRIORITY_CHANGED": return { title: `Ticket ${ticket} priority updated`, message: "The priority of your queue ticket has changed.", severity: "INFO" as const };
      default: return null;
    }
  }

  private async audit(action: string, tenantId: string, actorUserId: string | null, targetId: string, metadata: Record<string, unknown>) {
    if (!this.auditLog) return;
    await this.auditLog.record({ tenantId, actorUserId, action, targetType: "notification", targetId, metadata });
  }
}

export { render as renderNotificationTemplate };
