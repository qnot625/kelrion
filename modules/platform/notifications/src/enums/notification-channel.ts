export enum NotificationChannel {
  EMAIL = "email",
  SMS = "sms",
}

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return (
    typeof value === "string" &&
    Object.values(NotificationChannel).includes(value as NotificationChannel)
  );
}
