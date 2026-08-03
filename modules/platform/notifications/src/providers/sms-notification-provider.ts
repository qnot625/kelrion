import crypto from "node:crypto";
import { NotificationChannel } from "../enums/notification-channel.js";
import {
  INotificationProvider,
  NotificationPayload,
  ProviderSendResult,
} from "./notification-provider.interface.js";

export interface WebhookConfig {
  webhookUrl: string;
  apiKey?: string;
  senderId?: string;
}

export interface SMSProviderOptions {
  mode?: "webhook" | "console";
  webhookConfig?: WebhookConfig;
  senderId?: string;
  silent?: boolean;
  customTransport?: (payload: NotificationPayload) => Promise<ProviderSendResult>;
}

export interface SentSMSLog {
  id: string;
  to: string;
  senderId: string;
  body: string;
  metadata?: Record<string, unknown>;
  sentAt: Date;
}

export class SMSNotificationProvider implements INotificationProvider {
  public readonly channel = NotificationChannel.SMS;
  public readonly providerName: string;

  private readonly mode: "webhook" | "console";
  private readonly webhookConfig?: WebhookConfig;
  private readonly senderId: string;
  private readonly silent: boolean;
  private readonly customTransport?: (payload: NotificationPayload) => Promise<ProviderSendResult>;
  private readonly sentLogs: SentSMSLog[] = [];

  constructor(options: SMSProviderOptions = {}) {
    this.mode = options.mode ?? (options.webhookConfig ? "webhook" : "console");
    this.webhookConfig = options.webhookConfig;
    this.senderId = options.senderId ?? options.webhookConfig?.senderId ?? "KLERION_SMS";
    this.silent = options.silent ?? true;
    this.customTransport = options.customTransport;
    this.providerName = this.mode === "webhook" ? "SMSWebhookProvider" : "SMSConsoleProvider";
  }

  public async send(payload: NotificationPayload): Promise<ProviderSendResult> {
    if (payload.channel !== NotificationChannel.SMS) {
      return {
        success: false,
        error: `SMSNotificationProvider cannot handle channel '${payload.channel}'`,
      };
    }

    if (!payload.to || typeof payload.to !== "string") {
      return {
        success: false,
        error: "Invalid SMS recipient phone number",
      };
    }

    const phoneDigits = payload.to.replace(/\D/g, "");
    if (phoneDigits.length < 7) {
      return {
        success: false,
        error: `Invalid SMS recipient phone number format: '${payload.to}'`,
      };
    }

    if (!payload.body || typeof payload.body !== "string" || payload.body.trim().length === 0) {
      return {
        success: false,
        error: "SMS notification payload body cannot be empty",
      };
    }

    if (this.customTransport) {
      try {
        return await this.customTransport(payload);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `SMS provider transport failure: ${errorMsg}`,
        };
      }
    }

    if (this.mode === "webhook" && this.webhookConfig) {
      try {
        // Webhook adapter placeholder
        const messageId = `sms_webhook_${crypto.randomUUID()}`;
        return {
          success: true,
          providerMessageId: messageId,
          sentAt: new Date(),
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `SMS webhook delivery error: ${errorMsg}`,
        };
      }
    }

    // Console Adapter behavior
    const messageId = `sms_console_${crypto.randomUUID()}`;
    const logEntry: SentSMSLog = {
      id: messageId,
      to: payload.to,
      senderId: this.senderId,
      body: payload.body,
      metadata: payload.metadata,
      sentAt: new Date(),
    };

    this.sentLogs.push(logEntry);

    if (!this.silent) {
      console.log(
        `[SMSProvider] Sent SMS to '${payload.to}' from '${this.senderId}' | MessageId: ${messageId}`
      );
    }

    return {
      success: true,
      providerMessageId: messageId,
      sentAt: logEntry.sentAt,
    };
  }

  public getSentLogs(): SentSMSLog[] {
    return [...this.sentLogs];
  }

  public clearSentLogs(): void {
    this.sentLogs.length = 0;
  }
}
