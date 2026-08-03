import { QueueId, TicketId, TenantId, BranchId } from "../value-objects/identifiers.js";
import { QueuePriority } from "../enums/queue-priority.js";
import { TicketStatus } from "../enums/ticket-status.js";

export enum UserRole {
  OWNER = "OWNER",
  STAFF = "STAFF",
  MEMBER = "MEMBER",
}

export interface UserContext {
  userId: string;
  tenantId: TenantId;
  role: UserRole;
}

export interface AuditLogEvent {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: "QUEUE" | "QUEUE_TICKET";
  resourceId: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface IAuditLogger {
  log(event: AuditLogEvent): Promise<void>;
}

export interface IDomainEvent<T = unknown> {
  eventId: string;
  eventType: string;
  tenantId: string;
  aggregateId: string;
  occurredAt: Date;
  payload: T;
}

export interface IDomainEventPublisher {
  publish(event: IDomainEvent): Promise<void>;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized operation") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class TenantMismatchError extends Error {
  constructor(message = "Cross-tenant access prohibited") {
    super(message);
    this.name = "TenantMismatchError";
  }
}

export class QueueNotFoundError extends Error {
  constructor(queueId: string) {
    super(`Queue not found: '${queueId}'`);
    this.name = "QueueNotFoundError";
  }
}

export class TicketNotFoundError extends Error {
  constructor(ticketId: string) {
    super(`Ticket not found: '${ticketId}'`);
    this.name = "TicketNotFoundError";
  }
}

export class QueueInactiveError extends Error {
  constructor(queueName: string) {
    super(`Queue '${queueName}' is inactive`);
    this.name = "QueueInactiveError";
  }
}

export class QueuePausedError extends Error {
  constructor(queueName: string) {
    super(`Queue '${queueName}' is paused`);
    this.name = "QueuePausedError";
  }
}

export interface CreateQueueInput {
  branchId: BranchId;
  code: string;
  name: string;
  prefix: string;
  avgServiceTimeMinutes?: number;
}

export interface UpdateQueueInput {
  name?: string;
  code?: string;
  prefix?: string;
  avgServiceTimeMinutes?: number;
}

export interface JoinQueueInput {
  queueId: QueueId;
  customerName?: string;
  customerPhone?: string;
  priority?: QueuePriority;
  serviceId?: string;
  idempotencyKey?: string;
}

export interface CallNextTicketInput {
  queueId: QueueId;
  counterId: string;
}

export interface TransferTicketInput {
  ticketId: TicketId;
  targetQueueId: QueueId;
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
}
