export enum QueuePriority {
  STANDARD = "standard",
  VIP = "vip",
  APPOINTMENT = "appointment",
  EMERGENCY = "emergency",
}

export const QUEUE_PRIORITIES = Object.freeze(Object.values(QueuePriority));

export function isValidQueuePriority(priority: unknown): priority is QueuePriority {
  return typeof priority === "string" && QUEUE_PRIORITIES.includes(priority as QueuePriority);
}
