export class NotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationError";
  }
}

export class InvalidNotificationDataError extends NotificationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationDataError";
  }
}

export class InvalidNotificationStateError extends NotificationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotificationStateError";
  }
}

export class UnsupportedChannelError extends NotificationError {
  constructor(channel: string) {
    super(`Unsupported notification channel: '${channel}'`);
    this.name = "UnsupportedChannelError";
  }
}

export class InvalidTemplateError extends NotificationError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTemplateError";
  }
}

export class MissingTemplateVariableError extends NotificationError {
  public readonly missingVariables: string[];

  constructor(missingVariables: string[], templateId?: string) {
    const varsStr = missingVariables.map((v) => `'${v}'`).join(", ");
    const ctx = templateId ? ` for template '${templateId}'` : "";
    super(`Missing required template variables${ctx}: ${varsStr}`);
    this.name = "MissingTemplateVariableError";
    this.missingVariables = missingVariables;
  }
}

export class TemplateNotFoundError extends NotificationError {
  constructor(templateId: string) {
    super(`Notification template not found: '${templateId}'`);
    this.name = "TemplateNotFoundError";
  }
}

export class NotificationDeliveryError extends NotificationError {
  public readonly providerName?: string;

  constructor(message: string, providerName?: string) {
    super(message);
    this.name = "NotificationDeliveryError";
    this.providerName = providerName;
  }
}

export class NotificationNotFoundError extends NotificationError {
  constructor(id: string) {
    super(`Notification not found: '${id}'`);
    this.name = "NotificationNotFoundError";
  }
}

