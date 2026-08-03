import crypto from "node:crypto";
import { NotificationChannel } from "../enums/notification-channel.js";
import {
  INotificationProvider,
  NotificationPayload,
  ProviderSendResult,
} from "./notification-provider.interface.js";
import { NotificationDeliveryError } from "../errors/notification-errors.js";

export interface SMTPConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface EmailProviderOptions {
  mode?: "smtp" | "console";
  smtpConfig?: SMTPConfig;
  fromAddress?: string;
  silent?: boolean;
  customTransport?: (payload: NotificationPayload) => Promise<ProviderSendResult>;
}

export interface SentEmailLog {
  id: string;
  to: string;
  from: string;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
  sentAt: Date;
}

export class EmailNotificationProvider implements INotificationProvider {
  public readonly channel = NotificationChannel.EMAIL;
  public readonly providerName: string;

  private readonly mode: "smtp" | "console";
  private readonly smtpConfig?: SMTPConfig;
  private readonly fromAddress: string;
  private readonly silent: boolean;
  private readonly customTransport?: (payload: NotificationPayload) => Promise<ProviderSendResult>;
  private readonly sentLogs: SentEmailLog[] = [];

  constructor(options: EmailProviderOptions = {}) {
    this.mode = options.mode ?? (options.smtpConfig ? "smtp" : "console");
    this.smtpConfig = options.smtpConfig;
    this.fromAddress = options.fromAddress ?? options.smtpConfig?.from ?? "noreply@klerion.internal";
    this.silent = options.silent ?? true;
    this.customTransport = options.customTransport;
    this.providerName = this.mode === "smtp" ? "EmailSMTPProvider" : "EmailConsoleProvider";
  }

  public async send(payload: NotificationPayload): Promise<ProviderSendResult> {
    if (payload.channel !== NotificationChannel.EMAIL) {
      return {
        success: false,
        error: `EmailNotificationProvider cannot handle channel '${payload.channel}'`,
      };
    }

    if (!payload.to || typeof payload.to !== "string" || !payload.to.includes("@")) {
      return {
        success: false,
        error: `Invalid email recipient address: '${payload.to}'`,
      };
    }

    if (!payload.body || typeof payload.body !== "string" || payload.body.trim().length === 0) {
      return {
        success: false,
        error: "Email notification payload body cannot be empty",
      };
    }

    if (this.customTransport) {
      try {
        return await this.customTransport(payload);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `Email provider transport failure: ${errorMsg}`,
        };
      }
    }

    if (this.mode === "smtp" && this.smtpConfig) {
      try {
        // SMTP sending adapter placeholder
        const messageId = `smtp_msg_${crypto.randomUUID()}`;
        return {
          success: true,
          providerMessageId: messageId,
          sentAt: new Date(),
        };
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          success: false,
          error: `SMTP delivery error: ${errorMsg}`,
        };
      }
    }

    // Console Adapter behavior
    const messageId = `email_console_${crypto.randomUUID()}`;
    const logEntry: SentEmailLog = {
      id: messageId,
      to: payload.to,
      from: this.fromAddress,
      subject: payload.subject,
      body: payload.body,
      metadata: payload.metadata,
      sentAt: new Date(),
    };

    this.sentLogs.push(logEntry);

    if (!this.silent) {
      console.log(
        `[EmailProvider] Sent to '${payload.to}' | Subject: '${payload.subject ?? "N/A"}' | MessageId: ${messageId}`
      );
    }

    return {
      success: true,
      providerMessageId: messageId,
      sentAt: logEntry.sentAt,
    };
  }

  public getSentLogs(): SentEmailLog[] {
    return [...this.sentLogs];
  }

  public clearSentLogs(): void {
    this.sentLogs.length = 0;
  }
}
