import { ServiceTicket } from './service-ticket.js';
import { ServiceTicketRepository } from './service-ticket-repository.js';
import { TicketFilterOptions, ServiceDeskMetrics } from './types.js';

export class InMemoryServiceTicketRepository implements ServiceTicketRepository {
  private tickets: Map<string, ServiceTicket> = new Map();

  public clear(): void {
    this.tickets.clear();
  }

  private getKey(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  public async save(ticket: ServiceTicket): Promise<void> {
    const key = this.getKey(ticket.tenantId, ticket.id);
    this.tickets.set(key, ticket);
  }

  public async findById(tenantId: string, id: string): Promise<ServiceTicket | null> {
    const key = this.getKey(tenantId, id);
    const ticket = this.tickets.get(key);
    if (!ticket || ticket.tenantId !== tenantId) {
      return null;
    }
    return ticket;
  }

  public async findByTicketNumber(tenantId: string, ticketNumber: string): Promise<ServiceTicket | null> {
    for (const ticket of this.tickets.values()) {
      if (ticket.tenantId === tenantId && ticket.ticketNumber === ticketNumber) {
        return ticket;
      }
    }
    return null;
  }

  public async findAll(
    tenantId: string,
    options: TicketFilterOptions = {}
  ): Promise<{ items: ServiceTicket[]; total: number }> {
    const list: ServiceTicket[] = [];

    // Filter strictly by tenantId
    for (const ticket of this.tickets.values()) {
      if (ticket.tenantId !== tenantId) continue;

      // Status filter
      if (options.status) {
        if (Array.isArray(options.status)) {
          if (!options.status.includes(ticket.status)) continue;
        } else if (ticket.status !== options.status) {
          continue;
        }
      }

      // Priority filter
      if (options.priority) {
        if (Array.isArray(options.priority)) {
          if (!options.priority.includes(ticket.priority)) continue;
        } else if (ticket.priority !== options.priority) {
          continue;
        }
      }

      // Category filter
      if (options.category) {
        if (Array.isArray(options.category)) {
          if (!options.category.includes(ticket.category)) continue;
        } else if (ticket.category !== options.category) {
          continue;
        }
      }

      // Requester filter
      if (options.requesterUserId && ticket.requesterUserId !== options.requesterUserId) {
        continue;
      }

      // Assignee filter
      if (options.assignedUserId && ticket.assignedUserId !== options.assignedUserId) {
        continue;
      }

      // Team filter
      if (options.assignedTeamId && ticket.assignedTeamId !== options.assignedTeamId) {
        continue;
      }

      // SLA status filter
      if (options.slaStatus && ticket.slaStatus !== options.slaStatus) {
        continue;
      }

      // Search term
      if (options.search && options.search.trim()) {
        const term = options.search.trim().toLowerCase();
        const matchesTitle = ticket.title.toLowerCase().includes(term);
        const matchesDesc = ticket.description.toLowerCase().includes(term);
        const matchesNum = ticket.ticketNumber.toLowerCase().includes(term);
        const matchesReq = ticket.requesterName?.toLowerCase().includes(term);
        if (!matchesTitle && !matchesDesc && !matchesNum && !matchesReq) {
          continue;
        }
      }

      list.push(ticket);
    }

    // Sort by createdAt descending
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = list.length;
    const page = options.page || 1;
    const limit = options.limit || 50;
    const startIndex = (page - 1) * limit;

    const items = list.slice(startIndex, startIndex + limit);

    return { items, total };
  }

  public async delete(tenantId: string, id: string): Promise<void> {
    const key = this.getKey(tenantId, id);
    const existing = this.tickets.get(key);
    if (existing && existing.tenantId === tenantId) {
      this.tickets.delete(key);
    }
  }

  public async getMetrics(tenantId: string): Promise<ServiceDeskMetrics> {
    let totalTickets = 0;
    let openTickets = 0;
    let inProgressTickets = 0;
    let pendingUserTickets = 0;
    let resolvedTickets = 0;
    let closedTickets = 0;
    let urgentTickets = 0;
    let slaBreachedTickets = 0;
    let slaWarningTickets = 0;
    let unassignedTickets = 0;

    for (const ticket of this.tickets.values()) {
      if (ticket.tenantId !== tenantId) continue;

      totalTickets++;

      if (ticket.status === 'NEW' || ticket.status === 'OPEN') {
        openTickets++;
      } else if (ticket.status === 'IN_PROGRESS') {
        inProgressTickets++;
      } else if (ticket.status === 'PENDING_USER') {
        pendingUserTickets++;
      } else if (ticket.status === 'RESOLVED') {
        resolvedTickets++;
      } else if (ticket.status === 'CLOSED') {
        closedTickets++;
      }

      if (ticket.priority === 'URGENT') {
        urgentTickets++;
      }

      if (ticket.slaStatus === 'BREACHED') {
        slaBreachedTickets++;
      } else if (ticket.slaStatus === 'WARNING') {
        slaWarningTickets++;
      }

      if (!ticket.assignedUserId && !ticket.assignedTeamId && ticket.status !== 'CLOSED' && ticket.status !== 'CANCELLED') {
        unassignedTickets++;
      }
    }

    return {
      totalTickets,
      openTickets,
      inProgressTickets,
      pendingUserTickets,
      resolvedTickets,
      closedTickets,
      urgentTickets,
      slaBreachedTickets,
      slaWarningTickets,
      unassignedTickets,
    };
  }
}
