import { TicketId, QueueId, TenantId } from "../value-objects/identifiers.js";
import { TicketStatus } from "../enums/ticket-status.js";
import { QueuePriority } from "../enums/queue-priority.js";
import { QueueTicket } from "../aggregates/queue-ticket.js";

export interface IssueTicketAtomicOptions {
  customerName?: string;
  customerPhone?: string;
  priority?: QueuePriority;
  serviceId?: string;
  idempotencyKey?: string;
}

export interface ITicketRepository {
  findById(tenantId: TenantId, ticketId: TicketId): Promise<QueueTicket | null>;
  findByNumber(tenantId: TenantId, queueId: QueueId, displayNumber: string): Promise<QueueTicket | null>;
  findByIdempotencyKey(tenantId: TenantId, idempotencyKey: string): Promise<QueueTicket | null>;
  findByQueue(tenantId: TenantId, queueId: QueueId, statuses?: TicketStatus[]): Promise<QueueTicket[]>;
  findByTenant(tenantId: TenantId, statuses?: TicketStatus[]): Promise<QueueTicket[]>;
  findActiveByQueue(tenantId: TenantId, queueId: QueueId): Promise<QueueTicket[]>;
  findWaitingByQueue(tenantId: TenantId, queueId: QueueId): Promise<QueueTicket[]>;
  getNextWaitingTicket(tenantId: TenantId, queueId: QueueId): Promise<QueueTicket | null>;
  issueTicketAtomic(
    tenantId: TenantId,
    queueId: QueueId,
    options?: IssueTicketAtomicOptions
  ): Promise<QueueTicket>;
  save(ticket: QueueTicket): Promise<void>;
  countWaiting(tenantId: TenantId, queueId: QueueId): Promise<number>;
  delete(tenantId: TenantId, ticketId: TicketId): Promise<void>;
}
