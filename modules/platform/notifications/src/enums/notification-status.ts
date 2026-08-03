export enum NotificationStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SENT = "sent",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export function isNotificationStatus(value: unknown): value is NotificationStatus {
  return (
    typeof value === "string" &&
    Object.values(NotificationStatus).includes(value as NotificationStatus)
  );
}
