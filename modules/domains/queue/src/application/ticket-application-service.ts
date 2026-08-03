import { QueueTicket } from "../aggregates/queue-ticket.js";
import { QueueId, TicketId, TenantId } from "../value-objects/identifiers.js";
import { ITicketRepository } from "../repositories/ticket-repository.js";
import { IQueueRepository } from "../repositories/queue-repository.js";
import { WaitTimeCalculator } from "../services/wait-time-calculator.js";
import { TicketStatus } from "../enums/ticket-status.js";
import {
  UserContext,
  UserRole,
  JoinQueueInput,
  CallNextTicketInput,
  TransferTicketInput,
  QueueSnapshot,
  IAuditLogger,
  IDomainEventPublisher,
  UnauthorizedError,
  TenantMismatchError,
  QueueNotFoundError,
  TicketNotFoundError,
  QueueInactiveError,
  QueuePausedError,
} from "./types.js";

export class TicketApplicationService {
  private readonly waitTimeCalculator: WaitTimeCalculator;

  constructor(
    private readonly ticketRepository: ITicketRepository,
    private readonly queueRepository: IQueueRepository,
    private readonly auditLogger?: IAuditLogger,
    private readonly eventPublisher?: IDomainEventPublisher,
    waitTimeCalculator?: WaitTimeCalculator
  ) {
    this.waitTimeCalculator = waitTimeCalculator ?? new WaitTimeCalculator();
  }

  private requireRole(userContext: UserContext, allowedRoles: UserRole[]): void {
    if (!allowedRoles.includes(userContext.role)) {
      throw new UnauthorizedError(
        `Role '${userContext.role}' is not authorized to perform this operation`
      );
    }
  }

  private validateTenant(userContext: UserContext, resourceTenantId: TenantId): void {
    if (!userContext.tenantId.equals(resourceTenantId)) {
      throw new TenantMismatchError(
        `Access denied: user tenant '${userContext.tenantId.value}' does not match resource tenant '${resourceTenantId.value}'`
      );
    }
  }

  async joinQueue(userContext: UserContext, input: JoinQueueInput): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.MEMBER, UserRole.STAFF, UserRole.OWNER]);

    const queue = await this.queueRepository.findById(userContext.tenantId, input.queueId);
    if (!queue) {
      throw new QueueNotFoundError(input.queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    if (!queue.isActive) {
      throw new QueueInactiveError(queue.name);
    }

    if (queue.isPaused) {
      throw new QueuePausedError(queue.name);
    }

    const ticket = await this.ticketRepository.issueTicketAtomic(
      userContext.tenantId,
      queue.id,
      {
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        priority: input.priority,
        serviceId: input.serviceId,
        idempotencyKey: input.idempotencyKey,
      }
    );

    // Calculate wait time
    const waitingTickets = await this.ticketRepository.findWaitingByQueue(
      userContext.tenantId,
      queue.id
    );
    const position = waitingTickets.findIndex((t) => t.id.equals(ticket.id)) + 1;
    const estWait = queue.calculateWaitTimeMinutes(position > 0 ? position : waitingTickets.length + 1);
    ticket.updateEstimatedWait(estWait);

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.joined",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: {
          queueId: queue.id.value,
          ticketNumber: ticket.number.formatted,
          priority: ticket.priority,
        },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_joined.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          queueId: queue.id.value,
          ticketNumber: ticket.number.formatted,
          priority: ticket.priority,
          estimatedWaitMinutes: ticket.estimatedWaitMinutes,
        },
      });
    }

    return ticket;
  }

  async callNextTicket(
    userContext: UserContext,
    queueId: QueueId,
    counterId: string
  ): Promise<QueueTicket | null> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    const ticket = await this.ticketRepository.getNextWaitingTicket(
      userContext.tenantId,
      queueId
    );

    if (!ticket) {
      return null;
    }

    this.validateTenant(userContext, ticket.tenantId);

    ticket.call(counterId, userContext.userId);

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.called",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: {
          queueId: queueId.value,
          counterId,
          ticketNumber: ticket.number.formatted,
        },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_called.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          queueId: queueId.value,
          counterId,
          servedByUserId: userContext.userId,
          ticketNumber: ticket.number.formatted,
        },
      });
    }

    return ticket;
  }

  async recallTicket(userContext: UserContext, ticketId: TicketId): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const ticket = await this.ticketRepository.findById(userContext.tenantId, ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId.value);
    }

    this.validateTenant(userContext, ticket.tenantId);

    ticket.recall();

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.recalled",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: { ticketNumber: ticket.number.formatted },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_called.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          queueId: ticket.queueId.value,
          counterId: ticket.counterId,
          ticketNumber: ticket.number.formatted,
          isRecall: true,
        },
      });
    }

    return ticket;
  }

  async skipTicket(userContext: UserContext, ticketId: TicketId): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const ticket = await this.ticketRepository.findById(userContext.tenantId, ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId.value);
    }

    this.validateTenant(userContext, ticket.tenantId);

    ticket.skip();

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.skipped",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: { ticketNumber: ticket.number.formatted },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_skipped.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          queueId: ticket.queueId.value,
          ticketNumber: ticket.number.formatted,
        },
      });
    }

    return ticket;
  }

  async completeTicket(userContext: UserContext, ticketId: TicketId): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const ticket = await this.ticketRepository.findById(userContext.tenantId, ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId.value);
    }

    this.validateTenant(userContext, ticket.tenantId);

    ticket.complete();

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.completed",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: { ticketNumber: ticket.number.formatted },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_completed.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          queueId: ticket.queueId.value,
          ticketNumber: ticket.number.formatted,
        },
      });
    }

    return ticket;
  }

  async cancelTicket(
    userContext: UserContext,
    ticketId: TicketId,
    reason?: string
  ): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.MEMBER, UserRole.STAFF, UserRole.OWNER]);

    const ticket = await this.ticketRepository.findById(userContext.tenantId, ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId.value);
    }

    this.validateTenant(userContext, ticket.tenantId);

    ticket.cancel(reason);

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.cancelled",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: { ticketNumber: ticket.number.formatted, reason },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_cancelled.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          queueId: ticket.queueId.value,
          ticketNumber: ticket.number.formatted,
          reason,
        },
      });
    }

    return ticket;
  }

  async transferTicket(
    userContext: UserContext,
    ticketId: TicketId,
    targetQueueId: QueueId
  ): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const ticket = await this.ticketRepository.findById(userContext.tenantId, ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId.value);
    }

    this.validateTenant(userContext, ticket.tenantId);

    const targetQueue = await this.queueRepository.findById(
      userContext.tenantId,
      targetQueueId
    );
    if (!targetQueue) {
      throw new QueueNotFoundError(targetQueueId.value);
    }

    this.validateTenant(userContext, targetQueue.tenantId);

    ticket.transfer(targetQueueId);

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.transferred",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: {
          sourceQueueId: ticket.queueId.value,
          targetQueueId: targetQueueId.value,
          ticketNumber: ticket.number.formatted,
        },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_transferred.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          targetQueueId: targetQueueId.value,
          ticketNumber: ticket.number.formatted,
        },
      });
    }

    return ticket;
  }

  async markNoShow(userContext: UserContext, ticketId: TicketId): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const ticket = await this.ticketRepository.findById(userContext.tenantId, ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId.value);
    }

    this.validateTenant(userContext, ticket.tenantId);

    ticket.markNoShow();

    await this.ticketRepository.save(ticket);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "ticket.no_show",
        resourceType: "QUEUE_TICKET",
        resourceId: ticket.id.value,
        details: { ticketNumber: ticket.number.formatted },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: TicketId.generate().value,
        eventType: "queue.ticket_no_show.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: ticket.id.value,
        occurredAt: new Date(),
        payload: {
          ticketId: ticket.id.value,
          queueId: ticket.queueId.value,
          ticketNumber: ticket.number.formatted,
        },
      });
    }

    return ticket;
  }

  async getTicketById(userContext: UserContext, ticketId: TicketId): Promise<QueueTicket> {
    this.requireRole(userContext, [UserRole.MEMBER, UserRole.STAFF, UserRole.OWNER]);

    const ticket = await this.ticketRepository.findById(userContext.tenantId, ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId.value);
    }

    this.validateTenant(userContext, ticket.tenantId);

    return ticket;
  }

  async getQueueSnapshot(
    userContext: UserContext,
    queueId: QueueId
  ): Promise<QueueSnapshot> {
    this.requireRole(userContext, [UserRole.MEMBER, UserRole.STAFF, UserRole.OWNER]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    const allTickets = await this.ticketRepository.findByQueue(
      userContext.tenantId,
      queueId
    );

    const waitingTickets = allTickets.filter((t) => t.status === TicketStatus.WAITING);
    const inServiceTickets = allTickets.filter(
      (t) => t.status === TicketStatus.CALLED || t.status === TicketStatus.IN_SERVICE
    );
    const completedToday = allTickets.filter((t) => t.status === TicketStatus.COMPLETED);

    const activeCounters = Math.max(1, new Set(inServiceTickets.map((t) => t.counterId).filter(Boolean)).size);

    const waitResult = WaitTimeCalculator.calculateWaitTime({
      queue,
      waitingTickets,
      inServiceTickets,
      completedTickets: completedToday,
      activeCounters,
    });

    return {
      queueId: queue.id.value,
      code: queue.code,
      name: queue.name,
      prefix: queue.prefix,
      isActive: queue.isActive,
      isPaused: queue.isPaused,
      currentSequence: queue.currentSequence,
      waitingCount: waitingTickets.length,
      inServiceCount: inServiceTickets.length,
      completedTodayCount: completedToday.length,
      estimatedWaitMinutes: waitResult.estimatedMinutes,
      estimatedWaitRange: waitResult.formattedDisplay,
      activeCounters,
    };
  }
}
