import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TenantId,
  BranchId,
  QueueId,
  TicketId,
  UserRole,
  UserContext,
  AuditLogEvent,
  IAuditLogger,
  IDomainEvent,
  IDomainEventPublisher,
  QueueApplicationService,
  TicketApplicationService,
  InMemoryQueueRepository,
  InMemoryTicketRepository,
  UnauthorizedError,
  TenantMismatchError,
  QueueNotFoundError,
  TicketNotFoundError,
  QueueInactiveError,
  QueuePausedError,
  TicketStatus,
  QueuePriority,
} from "../src/index.js";

class TestAuditLogger implements IAuditLogger {
  public logs: AuditLogEvent[] = [];

  async log(event: AuditLogEvent): Promise<void> {
    this.logs.push(event);
  }

  clear(): void {
    this.logs = [];
  }
}

class TestEventPublisher implements IDomainEventPublisher {
  public events: IDomainEvent[] = [];

  async publish(event: IDomainEvent): Promise<void> {
    this.events.push(event);
  }

  clear(): void {
    this.events = [];
  }
}

test("QueueApplicationService CRUD, RBAC, tenant isolation, and audit logging", async () => {
  const queueRepo = new InMemoryQueueRepository();
  const auditLogger = new TestAuditLogger();
  const eventPublisher = new TestEventPublisher();

  const service = new QueueApplicationService(queueRepo, auditLogger, eventPublisher);

  const tenantA = TenantId.generate();
  const tenantB = TenantId.generate();
  const branchA = BranchId.generate();

  const ownerUser: UserContext = {
    userId: "user-owner-1",
    tenantId: tenantA,
    role: UserRole.OWNER,
  };

  const staffUser: UserContext = {
    userId: "user-staff-1",
    tenantId: tenantA,
    role: UserRole.STAFF,
  };

  const memberUser: UserContext = {
    userId: "user-member-1",
    tenantId: tenantA,
    role: UserRole.MEMBER,
  };

  const crossTenantUser: UserContext = {
    userId: "user-cross-1",
    tenantId: tenantB,
    role: UserRole.OWNER,
  };

  // 1. Create Queue by Owner
  const queue = await service.createQueue(ownerUser, {
    branchId: branchA,
    code: "CONSULT",
    name: "Consultation Queue",
    prefix: "CQ",
    avgServiceTimeMinutes: 10,
  });

  assert.ok(queue.id);
  assert.equal(queue.code, "CONSULT");
  assert.equal(queue.prefix, "CQ");
  assert.equal(auditLogger.logs.length, 1);
  assert.equal(auditLogger.logs[0].action, "queue.created");
  assert.equal(auditLogger.logs[0].resourceId, queue.id.value);
  assert.equal(eventPublisher.events.length, 1);
  assert.equal(eventPublisher.events[0].eventType, "queue.created.v1");

  // 2. Member cannot create queue (RBAC check)
  auditLogger.clear();
  eventPublisher.clear();
  await assert.rejects(
    () =>
      service.createQueue(memberUser, {
        branchId: branchA,
        code: "MEMBER_Q",
        name: "Member Queue",
        prefix: "MQ",
      }),
    UnauthorizedError
  );
  assert.equal(auditLogger.logs.length, 0); // Failed op must NOT emit audit log
  assert.equal(eventPublisher.events.length, 0);

  // 3. Update Queue Configuration by Staff
  const updatedQueue = await service.updateQueue(staffUser, queue.id, {
    name: "Updated Consultation",
    avgServiceTimeMinutes: 12,
  });
  assert.equal(updatedQueue.name, "Updated Consultation");
  assert.equal(updatedQueue.avgServiceTimeMinutes, 12);
  assert.equal(auditLogger.logs.length, 1);
  assert.equal(auditLogger.logs[0].action, "queue.updated");

  // 4. Pause and Resume Queue
  await service.pauseQueue(ownerUser, queue.id);
  let fetched = await service.getQueueById(memberUser, queue.id);
  assert.equal(fetched.isPaused, true);

  await service.resumeQueue(staffUser, queue.id);
  fetched = await service.getQueueById(memberUser, queue.id);
  assert.equal(fetched.isPaused, false);

  // 5. Activate and Deactivate Queue
  await service.deactivateQueue(ownerUser, queue.id);
  fetched = await service.getQueueById(memberUser, queue.id);
  assert.equal(fetched.isActive, false);

  await service.activateQueue(staffUser, queue.id);
  fetched = await service.getQueueById(memberUser, queue.id);
  assert.equal(fetched.isActive, true);

  // 6. Tenant Isolation Check on getQueueById
  await assert.rejects(
    () => service.getQueueById(crossTenantUser, queue.id),
    QueueNotFoundError // Scoped query returns null, resulting in not found or mismatch
  );

  // 7. List Queues
  const queuesTenantA = await service.getQueuesByTenant(memberUser);
  assert.equal(queuesTenantA.length, 1);

  const queuesTenantB = await service.getQueuesByTenant(crossTenantUser);
  assert.equal(queuesTenantB.length, 0);
});

test("TicketApplicationService lifecycle, RBAC, tenant isolation, snapshot, and audit logging", async () => {
  const queueRepo = new InMemoryQueueRepository();
  const ticketRepo = new InMemoryTicketRepository(queueRepo);
  const auditLogger = new TestAuditLogger();
  const eventPublisher = new TestEventPublisher();

  const queueService = new QueueApplicationService(queueRepo, auditLogger, eventPublisher);
  const ticketService = new TicketApplicationService(
    ticketRepo,
    queueRepo,
    auditLogger,
    eventPublisher
  );

  const tenantA = TenantId.generate();
  const tenantB = TenantId.generate();
  const branchA = BranchId.generate();

  const ownerUser: UserContext = {
    userId: "user-owner-1",
    tenantId: tenantA,
    role: UserRole.OWNER,
  };

  const staffUser: UserContext = {
    userId: "user-staff-1",
    tenantId: tenantA,
    role: UserRole.STAFF,
  };

  const memberUser1: UserContext = {
    userId: "user-member-1",
    tenantId: tenantA,
    role: UserRole.MEMBER,
  };

  const memberUser2: UserContext = {
    userId: "user-member-2",
    tenantId: tenantA,
    role: UserRole.MEMBER,
  };

  const crossTenantUser: UserContext = {
    userId: "user-cross-1",
    tenantId: tenantB,
    role: UserRole.STAFF,
  };

  const queue1 = await queueService.createQueue(ownerUser, {
    branchId: branchA,
    code: "CARDIO",
    name: "Cardiology",
    prefix: "C",
  });

  const queue2 = await queueService.createQueue(ownerUser, {
    branchId: branchA,
    code: "NEURO",
    name: "Neurology",
    prefix: "N",
  });

  auditLogger.clear();
  eventPublisher.clear();

  // 1. Join Queue by Member
  const t1 = await ticketService.joinQueue(memberUser1, {
    queueId: queue1.id,
    customerName: "Alice Smith",
    priority: QueuePriority.STANDARD,
  });

  assert.equal(t1.number.formatted, "C001");
  assert.equal(t1.status, TicketStatus.WAITING);
  assert.equal(auditLogger.logs.length, 1);
  assert.equal(auditLogger.logs[0].action, "ticket.joined");
  assert.equal(eventPublisher.events[0].eventType, "queue.ticket_joined.v1");

  const t2 = await ticketService.joinQueue(memberUser2, {
    queueId: queue1.id,
    customerName: "Bob Jones",
    priority: QueuePriority.VIP,
  });

  assert.equal(t2.number.formatted, "C002");

  // 2. Member cannot call next ticket (RBAC check)
  auditLogger.clear();
  eventPublisher.clear();
  await assert.rejects(
    () => ticketService.callNextTicket(memberUser1, queue1.id, "COUNTER-1"),
    UnauthorizedError
  );
  assert.equal(auditLogger.logs.length, 0);

  // 3. Staff calls next ticket (VIP ticket t2 is prioritized over t1)
  const called = await ticketService.callNextTicket(staffUser, queue1.id, "COUNTER-1");
  assert.ok(called);
  assert.equal(called.id.value, t2.id.value);
  assert.equal(called.status, TicketStatus.CALLED);
  assert.equal(auditLogger.logs.length, 1);
  assert.equal(auditLogger.logs[0].action, "ticket.called");
  assert.equal(eventPublisher.events[0].eventType, "queue.ticket_called.v1");

  // 4. Recall ticket
  auditLogger.clear();
  eventPublisher.clear();
  const recalled = await ticketService.recallTicket(staffUser, t2.id);
  assert.equal(recalled.id.value, t2.id.value);
  assert.equal(auditLogger.logs[0].action, "ticket.recalled");

  // 5. Complete ticket
  auditLogger.clear();
  eventPublisher.clear();
  const completed = await ticketService.completeTicket(staffUser, t2.id);
  assert.equal(completed.status, TicketStatus.COMPLETED);
  assert.equal(auditLogger.logs[0].action, "ticket.completed");

  // 6. Call next (t1) and Skip ticket
  const called2 = await ticketService.callNextTicket(staffUser, queue1.id, "COUNTER-1");
  assert.ok(called2);
  assert.equal(called2.id.value, t1.id.value);

  auditLogger.clear();
  eventPublisher.clear();
  const skipped = await ticketService.skipTicket(staffUser, t1.id);
  assert.equal(skipped.status, TicketStatus.NO_SHOW);
  assert.equal(auditLogger.logs[0].action, "ticket.skipped");

  // 7. Join another ticket t3 and Transfer to Queue 2
  const t3 = await ticketService.joinQueue(memberUser1, {
    queueId: queue1.id,
    customerName: "Charlie",
  });
  const called3 = await ticketService.callNextTicket(staffUser, queue1.id, "COUNTER-2");
  assert.ok(called3);

  auditLogger.clear();
  eventPublisher.clear();
  const transferred = await ticketService.transferTicket(staffUser, t3.id, queue2.id);
  assert.equal(transferred.status, TicketStatus.TRANSFERRED);
  assert.equal(transferred.queueId.value, queue2.id.value);
  assert.equal(auditLogger.logs[0].action, "ticket.transferred");

  // 8. Join t4, Call, Mark No Show
  const t4 = await ticketService.joinQueue(memberUser2, {
    queueId: queue1.id,
    customerName: "David",
  });
  await ticketService.callNextTicket(staffUser, queue1.id, "COUNTER-1");

  auditLogger.clear();
  eventPublisher.clear();
  const noShow = await ticketService.markNoShow(staffUser, t4.id);
  assert.equal(noShow.status, TicketStatus.NO_SHOW);
  assert.equal(auditLogger.logs[0].action, "ticket.no_show");

  // 9. Join t5 and Cancel
  const t5 = await ticketService.joinQueue(memberUser1, {
    queueId: queue1.id,
    customerName: "Eve",
  });
  auditLogger.clear();
  eventPublisher.clear();
  const cancelled = await ticketService.cancelTicket(memberUser1, t5.id, "User changed mind");
  assert.equal(cancelled.status, TicketStatus.CANCELLED);
  assert.equal(auditLogger.logs[0].action, "ticket.cancelled");

  // 10. Queue Snapshot
  const snapshot = await ticketService.getQueueSnapshot(memberUser1, queue1.id);
  assert.equal(snapshot.queueId, queue1.id.value);
  assert.equal(snapshot.code, "CARDIO");
  assert.equal(snapshot.isActive, true);
  assert.equal(snapshot.isPaused, false);
  assert.equal(typeof snapshot.estimatedWaitRange, "string");

  // 11. Cross-tenant access rejection on ticket operations
  await assert.rejects(
    () => ticketService.getTicketById(crossTenantUser, t5.id),
    TicketNotFoundError
  );
  await assert.rejects(
    () => ticketService.completeTicket(crossTenantUser, t5.id),
    TicketNotFoundError
  );
});

test("TicketApplicationService rejects ticket issuance for inactive or paused queues", async () => {
  const queueRepo = new InMemoryQueueRepository();
  const ticketRepo = new InMemoryTicketRepository(queueRepo);
  const queueService = new QueueApplicationService(queueRepo);
  const ticketService = new TicketApplicationService(ticketRepo, queueRepo);

  const tenant = TenantId.generate();
  const ownerUser: UserContext = { userId: "owner-1", tenantId: tenant, role: UserRole.OWNER };
  const memberUser: UserContext = { userId: "member-1", tenantId: tenant, role: UserRole.MEMBER };

  const queue = await queueService.createQueue(ownerUser, {
    branchId: BranchId.generate(),
    code: "TEST",
    name: "Test Queue",
    prefix: "TQ",
  });

  // Pause queue
  await queueService.pauseQueue(ownerUser, queue.id);
  await assert.rejects(
    () => ticketService.joinQueue(memberUser, { queueId: queue.id }),
    QueuePausedError
  );

  // Resume queue and then deactivate queue
  await queueService.resumeQueue(ownerUser, queue.id);
  await queueService.deactivateQueue(ownerUser, queue.id);

  await assert.rejects(
    () => ticketService.joinQueue(memberUser, { queueId: queue.id }),
    QueueInactiveError
  );
});
