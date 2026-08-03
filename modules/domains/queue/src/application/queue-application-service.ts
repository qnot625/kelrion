import { Queue, QueueProps } from "../aggregates/queue.js";
import { QueueId, TenantId } from "../value-objects/identifiers.js";
import { IQueueRepository } from "../repositories/queue-repository.js";
import {
  UserContext,
  UserRole,
  CreateQueueInput,
  UpdateQueueInput,
  IAuditLogger,
  IDomainEventPublisher,
  UnauthorizedError,
  TenantMismatchError,
  QueueNotFoundError,
} from "./types.js";

export class QueueApplicationService {
  constructor(
    private readonly queueRepository: IQueueRepository,
    private readonly auditLogger?: IAuditLogger,
    private readonly eventPublisher?: IDomainEventPublisher
  ) {}

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

  async createQueue(userContext: UserContext, input: CreateQueueInput): Promise<Queue> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const queueId = QueueId.generate();
    const queue = new Queue({
      id: queueId,
      tenantId: userContext.tenantId,
      branchId: input.branchId,
      code: input.code,
      name: input.name,
      prefix: input.prefix,
      avgServiceTimeMinutes: input.avgServiceTimeMinutes ?? 5,
    });

    await this.queueRepository.save(queue);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "queue.created",
        resourceType: "QUEUE",
        resourceId: queue.id.value,
        details: { code: queue.code, name: queue.name, prefix: queue.prefix },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: QueueId.generate().value,
        eventType: "queue.created.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: queue.id.value,
        occurredAt: new Date(),
        payload: {
          queueId: queue.id.value,
          branchId: queue.branchId.value,
          code: queue.code,
          name: queue.name,
          prefix: queue.prefix,
        },
      });
    }

    return queue;
  }

  async updateQueue(
    userContext: UserContext,
    queueId: QueueId,
    input: UpdateQueueInput
  ): Promise<Queue> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    queue.updateConfig(input);

    await this.queueRepository.save(queue);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "queue.updated",
        resourceType: "QUEUE",
        resourceId: queue.id.value,
        details: { ...input },
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: QueueId.generate().value,
        eventType: "queue.updated.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: queue.id.value,
        occurredAt: new Date(),
        payload: {
          queueId: queue.id.value,
          ...input,
        },
      });
    }

    return queue;
  }

  async pauseQueue(userContext: UserContext, queueId: QueueId): Promise<Queue> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    queue.pause();

    await this.queueRepository.save(queue);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "queue.paused",
        resourceType: "QUEUE",
        resourceId: queue.id.value,
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: QueueId.generate().value,
        eventType: "queue.paused.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: queue.id.value,
        occurredAt: new Date(),
        payload: { queueId: queue.id.value },
      });
    }

    return queue;
  }

  async resumeQueue(userContext: UserContext, queueId: QueueId): Promise<Queue> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    queue.resume();

    await this.queueRepository.save(queue);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "queue.resumed",
        resourceType: "QUEUE",
        resourceId: queue.id.value,
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: QueueId.generate().value,
        eventType: "queue.resumed.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: queue.id.value,
        occurredAt: new Date(),
        payload: { queueId: queue.id.value },
      });
    }

    return queue;
  }

  async activateQueue(userContext: UserContext, queueId: QueueId): Promise<Queue> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    queue.activate();

    await this.queueRepository.save(queue);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "queue.activated",
        resourceType: "QUEUE",
        resourceId: queue.id.value,
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: QueueId.generate().value,
        eventType: "queue.activated.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: queue.id.value,
        occurredAt: new Date(),
        payload: { queueId: queue.id.value },
      });
    }

    return queue;
  }

  async deactivateQueue(userContext: UserContext, queueId: QueueId): Promise<Queue> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    queue.deactivate();

    await this.queueRepository.save(queue);

    if (this.auditLogger) {
      await this.auditLogger.log({
        tenantId: userContext.tenantId.value,
        userId: userContext.userId,
        action: "queue.deactivated",
        resourceType: "QUEUE",
        resourceId: queue.id.value,
        timestamp: new Date(),
      });
    }

    if (this.eventPublisher) {
      await this.eventPublisher.publish({
        eventId: QueueId.generate().value,
        eventType: "queue.deactivated.v1",
        tenantId: userContext.tenantId.value,
        aggregateId: queue.id.value,
        occurredAt: new Date(),
        payload: { queueId: queue.id.value },
      });
    }

    return queue;
  }

  async getQueueById(userContext: UserContext, queueId: QueueId): Promise<Queue> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF, UserRole.MEMBER]);

    const queue = await this.queueRepository.findById(userContext.tenantId, queueId);
    if (!queue) {
      throw new QueueNotFoundError(queueId.value);
    }

    this.validateTenant(userContext, queue.tenantId);

    return queue;
  }

  async getQueuesByTenant(userContext: UserContext): Promise<Queue[]> {
    this.requireRole(userContext, [UserRole.OWNER, UserRole.STAFF, UserRole.MEMBER]);

    return this.queueRepository.findByTenant(userContext.tenantId);
  }
}
