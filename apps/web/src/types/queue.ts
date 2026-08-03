export type UserRole = "OWNER" | "STAFF" | "MEMBER";

export interface UserContext {
  userId: string;
  tenantId: string;
  role: UserRole;
}

export type TicketStatus =
  | "waiting"
  | "called"
  | "in_service"
  | "completed"
  | "skipped"
  | "cancelled"
  | "no_show"
  | "transferred"
  | "WAITING"
  | "CALLED"
  | "IN_SERVICE"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED"
  | "NO_SHOW"
  | "TRANSFERRED";

export type QueuePriority = "STANDARD" | "VIP" | "EMERGENCY" | "APPOINTMENT";

export interface Queue {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  name: string;
  prefix: string;
  isActive: boolean;
  isPaused: boolean;
  currentSequence: number;
  avgServiceTimeMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  queueId: string;
  tenantId: string;
  number: string;
  sequence: number;
  status: TicketStatus;
  priority: QueuePriority;
  customerName?: string;
  customerPhone?: string;
  serviceId?: string;
  counterId?: string;
  servedByUserId?: string;
  estimatedWaitMinutes?: number;
  joinedAt: string;
  calledAt?: string | null;
  completedAt?: string | null;
}

export interface QueueSnapshot {
  queueId: string;
  code: string;
  name: string;
  prefix: string;
  isActive: boolean;
  isPaused: boolean;
  currentSequence: number;
  waitingCount: number;
  inServiceCount: number;
  completedTodayCount: number;
  estimatedWaitMinutes: number;
  estimatedWaitRange: string;
  activeCounters: number;
  currentlyServing?: Ticket[];
  waitingTickets?: Ticket[];
}

export type RealtimeEventType =
  | "queue.snapshot.v1"
  | "queue.ticket_joined.v1"
  | "queue.ticket_called.v1"
  | "queue.ticket_completed.v1"
  | "queue.ticket_skipped.v1"
  | "queue.ticket_transferred.v1"
  | "queue.ticket_cancelled.v1"
  | "queue.ticket_no_show.v1"
  | "heartbeat";

export interface RealtimeEvent {
  eventId: string;
  eventType: RealtimeEventType;
  tenantId: string;
  aggregateId: string;
  occurredAt: string;
  payload: any;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
