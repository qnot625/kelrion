import { ServiceTicket, ServiceTicketProps } from './service-ticket.js';
import { ServiceTicketRepository } from './service-ticket-repository.js';
import { TicketFilterOptions, TicketCategory, TicketPriority, TicketStatus, ServiceDeskMetrics } from './types.js';

export type AuditLogPublisher = (eventType: string, payload: Record<string, unknown>) => Promise<void> | void;

export class TicketService {
  constructor(
    private readonly repository: ServiceTicketRepository,
    private readonly auditPublisher?: AuditLogPublisher
  ) {}

  private async publishAudit(eventType: string, payload: Record<string, unknown>): Promise<void> {
    if (this.auditPublisher) {
      try {
        await this.auditPublisher(eventType, payload);
      } catch (err) {
        console.error(`Failed to publish audit event ${eventType}:`, err);
      }
    }
  }

  public async createTicket(
    tenantId: string,
    props: Omit<ServiceTicketProps, 'id' | 'tenantId'> & { id?: string }
  ): Promise<ServiceTicket> {
    const id = props.id || `tck_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ticket = new ServiceTicket({
      ...props,
      id,
      tenantId,
      status: props.status || 'NEW',
    });

    await this.repository.save(ticket);

    await this.publishAudit('ticket.created', {
      tenantId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      requesterUserId: ticket.requesterUserId,
      category: ticket.category,
      priority: ticket.priority,
    });

    return ticket;
  }

  public async saveDraft(
    tenantId: string,
    props: Omit<ServiceTicketProps, 'id' | 'tenantId'> & { id?: string }
  ): Promise<ServiceTicket> {
    const id = props.id || `tck_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ticket = new ServiceTicket({
      ...props,
      id,
      tenantId,
      status: 'DRAFT',
    });

    await this.repository.save(ticket);

    await this.publishAudit('ticket.draft_saved', {
      tenantId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requesterUserId: ticket.requesterUserId,
    });

    return ticket;
  }

  public async submitDraft(tenantId: string, ticketId: string, userId: string): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.submit(userId);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.submitted', {
      tenantId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      submittedBy: userId,
    });

    return ticket;
  }

  public async updateTicket(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    updates: {
      title?: string;
      description?: string;
      category?: TicketCategory;
      customFields?: Record<string, unknown>;
    }
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.updateDetails(actorUserId, updates);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.updated', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      updates,
    });

    return ticket;
  }

  public async assignTicket(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    assigneeUserId?: string,
    teamId?: string
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.assign(actorUserId, assigneeUserId, teamId);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.assigned', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      assigneeUserId,
      teamId,
    });

    return ticket;
  }

  public async updateStatus(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    newStatus: TicketStatus,
    comment?: string
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.changeStatus(actorUserId, newStatus, comment);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.status_changed', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      newStatus,
      comment,
    });

    return ticket;
  }

  public async updatePriority(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    newPriority: TicketPriority,
    reason?: string
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.updatePriority(actorUserId, newPriority, reason);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.priority_changed', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      newPriority,
      reason,
    });

    return ticket;
  }

  public async addComment(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    content: string,
    isInternal: boolean = false,
    authorName?: string,
    authorRole?: string
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.addComment(actorUserId, content, isInternal, authorName, authorRole);
    await this.repository.save(ticket);

    await this.publishAudit(isInternal ? 'ticket.internal_note_added' : 'ticket.comment_added', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      isInternal,
    });

    return ticket;
  }

  public async addAttachment(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    fileName: string,
    fileUrl: string,
    fileSize: number,
    mimeType?: string
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.addAttachment(actorUserId, fileName, fileUrl, fileSize, mimeType);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.attachment_added', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      fileName,
    });

    return ticket;
  }

  public async resolveTicket(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    resolutionNotes: string
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.resolve(actorUserId, resolutionNotes);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.resolved', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      resolutionNotes,
    });

    return ticket;
  }

  public async closeTicket(tenantId: string, ticketId: string, actorUserId: string): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.close(actorUserId);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.closed', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
    });

    return ticket;
  }

  public async cancelTicket(
    tenantId: string,
    ticketId: string,
    actorUserId: string,
    reason: string
  ): Promise<ServiceTicket> {
    const ticket = await this.repository.findById(tenantId, ticketId);
    if (!ticket) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    ticket.cancel(actorUserId, reason);
    await this.repository.save(ticket);

    await this.publishAudit('ticket.cancelled', {
      tenantId,
      ticketId: ticket.id,
      actorUserId,
      reason,
    });

    return ticket;
  }

  public async getTicket(tenantId: string, ticketId: string): Promise<ServiceTicket | null> {
    return this.repository.findById(tenantId, ticketId);
  }

  public async listTickets(
    tenantId: string,
    options: TicketFilterOptions = {}
  ): Promise<{ items: ServiceTicket[]; total: number }> {
    return this.repository.findAll(tenantId, options);
  }

  public async getMetrics(tenantId: string): Promise<ServiceDeskMetrics> {
    return this.repository.getMetrics(tenantId);
  }

  public async checkSLAExpirations(tenantId: string): Promise<{ warningCount: number; breachedCount: number }> {
    const { items } = await this.repository.findAll(tenantId, { limit: 1000 });
    let warningCount = 0;
    let breachedCount = 0;
    const now = new Date();

    for (const ticket of items) {
      const prevSla = ticket.slaStatus;
      ticket.evaluateSLA(now);

      if (ticket.slaStatus !== prevSla) {
        await this.repository.save(ticket);

        if (ticket.slaStatus === 'BREACHED') {
          breachedCount++;
          await this.publishAudit('ticket.sla_breached', {
            tenantId,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            dueAt: ticket.dueAt,
          });
        } else if (ticket.slaStatus === 'WARNING') {
          warningCount++;
          await this.publishAudit('ticket.sla_warning', {
            tenantId,
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            dueAt: ticket.dueAt,
          });
        }
      }
    }

    return { warningCount, breachedCount };
  }
}
