export enum TicketStatus {
  WAITING = "waiting",
  CALLED = "called",
  IN_SERVICE = "in_service",
  COMPLETED = "completed",
  NO_SHOW = "no_show",
  CANCELLED = "cancelled",
  TRANSFERRED = "transferred",
}

export const TICKET_STATUSES = Object.freeze(Object.values(TicketStatus));

export function isValidTicketStatus(status: unknown): status is TicketStatus {
  return typeof status === "string" && TICKET_STATUSES.includes(status as TicketStatus);
}
