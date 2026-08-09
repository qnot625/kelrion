export class NotificationValidationError extends Error {
  constructor(message: string) { super(message); this.name = "NotificationValidationError"; }
}
export class NotificationNotFoundError extends Error {
  constructor(id: string) { super(`Notification '${id}' was not found`); this.name = "NotificationNotFoundError"; }
}
export class NotificationTemplateNotFoundError extends Error {
  constructor(id: string) { super(`Notification template '${id}' was not found`); this.name = "NotificationTemplateNotFoundError"; }
}
