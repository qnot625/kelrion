import { QueueId, TicketId, TenantId, BranchId } from "../value-objects/identifiers.js";
import { TicketStatus } from "../enums/ticket-status.js";
import { Queue } from "../aggregates/queue.js";
import { QueueTicket } from "../aggregates/queue-ticket.js";
import { IQueueRepository } from "./queue-repository.js";
import { ITicketRepository } from "./ticket-repository.js";

export class InMemoryQueueRepository implements IQueueRepository {
  private queues: Map<string, Queue> = new Map();

  async findById(tenantId: TenantId, queueId: QueueId): Promise<Queue | null> {
    const queue = this.queues.get(queueId.value);
    if (!queue || !queue.tenantId.equals(tenantId)) {
      return null;
    }
    return queue;
  }

  async findByTenant(tenantId: TenantId): Promise<Queue[]> {
    return Array.from(this.queues.values()).filter((q) => q.tenantId.equals(tenantId));
  }

  async findByBranch(tenantId: TenantId, branchId: BranchId): Promise<Queue[]> {
    return Array.from(this.queues.values()).filter(
      (q) => q.tenantId.equals(tenantId) && q.branchId.equals(branchId)
    );
  }

  async findActive(tenantId: TenantId): Promise<Queue[]> {
    return Array.from(this.queues.values()).filter(
      (q) => q.tenantId.equals(tenantId) && q.isActive
    );
  }

  async save(queue: Queue): Promise<void> {
    this.queues.set(queue.id.value, queue);
  }

  async delete(tenantId: TenantId, queueId: QueueId): Promise<void> {
    const queue = await this.findById(tenantId, queueId);
    if (queue) {
      this.queues.delete(queueId.value);
    }
  }

  clear(): void {
    this.queues.clear();
  }
}

export class InMemoryTicketRepository implements ITicketRepository {
  private tickets: Map<string, QueueTicket> = new Map();

  constructor(private queueRepo?: IQueueRepository) {}

  async findById(tenantId: TenantId, ticketId: TicketId): Promise<QueueTicket | null> {
    const ticket = this.tickets.get(ticketId.value);
    if (!ticket || !ticket.tenantId.equals(tenantId)) {
      return null;
    }
    return ticket;
  }

  async findByNumber(tenantId: TenantId, queueId: QueueId, displayNumber: string): Promise<QueueTicket | null> {
    for (const ticket of this.tickets.values()) {
      if (
        ticket.tenantId.equals(tenantId) &&
        ticket.queueId.equals(queueId) &&
        ticket.number.formatted.toUpperCase() === displayNumber.trim().toUpperCase()
      ) {
        return ticket;
      }
    }
    return null;
  }

  async findByIdempotencyKey(tenantId: TenantId, idempotencyKey: string): Promise<QueueTicket | null> {
    for (const ticket of this.tickets.values()) {
      if (
        ticket.tenantId.equals(tenantId) &&
        ticket.idempotencyKey &&
        ticket.idempotencyKey === idempotencyKey
      ) {
        return ticket;
      }
    }
    return null;
  }

  async findByQueue(tenantId: TenantId, queueId: QueueId, statuses?: TicketStatus[]): Promise<QueueTicket[]> {
    return Array.from(this.tickets.values()).filter((t) => {
      if (!t.tenantId.equals(tenantId) || !t.queueId.equals(queueId)) return false;
      if (statuses && statuses.length > 0) {
        return statuses.includes(t.status);
      }
      return true;
    });
  }

  async findByTenant(tenantId: TenantId, statuses?: TicketStatus[]): Promise<QueueTicket[]> {
    return Array.from(this.tickets.values()).filter((t) => {
      if (!t.tenantId.equals(tenantId)) return false;
      if (statuses && statuses.length > 0) {
        return statuses.includes(t.status);
      }
      return true;
    });
  }

  async findActiveByQueue(tenantId: TenantId, queueId: QueueId): Promise<QueueTicket[]> {
    const activeStatuses = [TicketStatus.WAITING, TicketStatus.CALLED, TicketStatus.IN_SERVICE];
    return this.findByQueue(tenantId, queueId, activeStatuses);
  }

  async findWaitingByQueue(tenantId: TenantId, queueId: QueueId): Promise<QueueTicket[]> {
    return this.findByQueue(tenantId, queueId, [TicketStatus.WAITING]);
  }

  async getNextWaitingTicket(tenantId: TenantId, queueId: QueueId): Promise<QueueTicket | null> {
    const waitingTickets = await this.findWaitingByQueue(tenantId, queueId);
    if (waitingTickets.length === 0) return null;
    const sorted = Queue.sortTicketsByPriority(waitingTickets);
    return sorted[0] ?? null;
  }

  async issueTicketAtomic(
    tenantId: TenantId,
    queueId: QueueId,
    options?: {
      customerName?: string;
      customerPhone?: string;
      priority?: any;
      serviceId?: string;
      idempotencyKey?: string;
    }
  ): Promise<QueueTicket> {
    if (options?.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(tenantId, options.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    if (!this.queueRepo) {
      throw new Error("InMemoryTicketRepository requires queueRepo instance for issueTicketAtomic");
    }

    const queue = await this.queueRepo.findById(tenantId, queueId);
    if (!queue) {
      throw new Error(`Queue not found: ${queueId.value}`);
    }

    const ticket = queue.issueTicket(options);
    await this.queueRepo.save(queue);
    await this.save(ticket);
    return ticket;
  }

  async save(ticket: QueueTicket): Promise<void> {
    this.tickets.set(ticket.id.value, ticket);
  }

  async countWaiting(tenantId: TenantId, queueId: QueueId): Promise<number> {
    const waiting = await this.findWaitingByQueue(tenantId, queueId);
    return waiting.length;
  }

  async delete(tenantId: TenantId, ticketId: TicketId): Promise<void> {
    const ticket = await this.findById(tenantId, ticketId);
    if (ticket) {
      this.tickets.delete(ticketId.value);
    }
  }

  clear(): void {
    this.tickets.clear();
  }
}
