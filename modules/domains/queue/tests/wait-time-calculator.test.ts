import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QueueId,
  TicketId,
  TenantId,
  BranchId,
  QueuePriority,
  TicketStatus,
  Queue,
  QueueTicket,
  WaitTimeCalculator,
} from "../src/index.js";

function createDummyQueue(options?: { avgServiceTimeMinutes?: number; isActive?: boolean }): Queue {
  return new Queue({
    id: QueueId.generate(),
    tenantId: TenantId.generate(),
    branchId: BranchId.generate(),
    code: "TEST",
    name: "Test Queue",
    prefix: "T",
    avgServiceTimeMinutes: options?.avgServiceTimeMinutes ?? 10,
    isActive: options?.isActive ?? true,
  });
}

test("WaitTimeCalculator moving average calculation with completed tickets", () => {
  const tenantId = TenantId.generate();
  const branchId = BranchId.generate();
  const queueId = QueueId.generate();

  const now = new Date();

  // No historical tickets -> returns queue fallback default
  const emptyRes = WaitTimeCalculator.calculateMovingAverageServiceTime([], 8);
  assert.equal(emptyRes.avgMinutes, 8);
  assert.equal(emptyRes.sampleSize, 0);

  // Completed tickets with known durations: 10 mins and 20 mins -> avg 15 mins
  const ticket1 = new QueueTicket({
    id: TicketId.generate(),
    tenantId,
    branchId,
    queueId,
    number: { formatted: "T001" } as any,
    status: TicketStatus.COMPLETED,
    calledAt: new Date(now.getTime() - 30 * 60 * 1000),
    serviceStartedAt: new Date(now.getTime() - 25 * 60 * 1000),
    completedAt: new Date(now.getTime() - 15 * 60 * 1000), // 10 mins duration
  });

  const ticket2 = new QueueTicket({
    id: TicketId.generate(),
    tenantId,
    branchId,
    queueId,
    number: { formatted: "T002" } as any,
    status: TicketStatus.COMPLETED,
    serviceStartedAt: new Date(now.getTime() - 25 * 60 * 1000),
    completedAt: new Date(now.getTime() - 5 * 60 * 1000), // 20 mins duration
  });

  // Cancelled & No-show tickets should be ignored
  const ticketCancelled = new QueueTicket({
    id: TicketId.generate(),
    tenantId,
    branchId,
    queueId,
    number: { formatted: "T003" } as any,
    status: TicketStatus.CANCELLED,
  });

  const avgRes = WaitTimeCalculator.calculateMovingAverageServiceTime([ticket1, ticket2, ticketCancelled], 5);
  assert.equal(avgRes.avgMinutes, 15);
  assert.equal(avgRes.sampleSize, 2);
});

test("WaitTimeCalculator ignores invalid and corrupt completed ticket records", () => {
  const tenantId = TenantId.generate();
  const branchId = BranchId.generate();
  const queueId = QueueId.generate();
  const now = new Date();

  // Ticket missing start time
  const corruptTicket1 = new QueueTicket({
    id: TicketId.generate(),
    tenantId,
    branchId,
    queueId,
    number: { formatted: "T001" } as any,
    status: TicketStatus.COMPLETED,
    completedAt: now,
  });

  // Ticket with negative duration (completed before start)
  const corruptTicket2 = new QueueTicket({
    id: TicketId.generate(),
    tenantId,
    branchId,
    queueId,
    number: { formatted: "T002" } as any,
    status: TicketStatus.COMPLETED,
    serviceStartedAt: now,
    completedAt: new Date(now.getTime() - 10000),
  });

  const avgRes = WaitTimeCalculator.calculateMovingAverageServiceTime([corruptTicket1, corruptTicket2], 7);
  assert.equal(avgRes.avgMinutes, 7);
  assert.equal(avgRes.sampleSize, 0);
});

test("WaitTimeCalculator queue depth and active counter estimation", () => {
  const queue = createDummyQueue({ avgServiceTimeMinutes: 10 });

  const t1 = queue.issueTicket({ customerName: "Alice" });
  const t2 = queue.issueTicket({ customerName: "Bob" });
  const t3 = queue.issueTicket({ customerName: "Charlie" });

  const waitingTickets = [t1, t2, t3];

  // Estimate for t3 (3rd in queue, 2 ahead of t3)
  // Workload: 2 tickets ahead * 10 mins = 20 mins base wait
  const resSingleCounter = WaitTimeCalculator.calculateWaitTime({
    queue,
    targetTicket: t3,
    waitingTickets,
    activeCounters: 1,
  });

  assert.equal(resSingleCounter.estimatedMinutes, 20);
  assert.equal(resSingleCounter.minimumMinutes, 17); // Math.floor(20 * 0.85) = 17
  assert.equal(resSingleCounter.maximumMinutes, 25); // Math.ceil(20 * 1.25) = 25
  assert.equal(resSingleCounter.formattedDisplay, "17–25 mins");
  assert.equal(resSingleCounter.positionInQueue, 3);

  // Estimate with 2 active counters: 20 mins / 2 = 10 mins base wait
  const resTwoCounters = WaitTimeCalculator.calculateWaitTime({
    queue,
    targetTicket: t3,
    waitingTickets,
    activeCounters: 2,
  });

  assert.equal(resTwoCounters.estimatedMinutes, 10);
  assert.equal(resTwoCounters.formattedDisplay, "8–13 mins");
});

test("WaitTimeCalculator priority weighting in wait time estimation", () => {
  const queue = createDummyQueue({ avgServiceTimeMinutes: 10 });

  const tStandard = queue.issueTicket({ customerName: "Standard", priority: QueuePriority.STANDARD });
  const tEmergency = queue.issueTicket({ customerName: "Emergency", priority: QueuePriority.EMERGENCY });

  const waitingTickets = [tStandard, tEmergency];

  // Because tEmergency has EMERGENCY priority, priority sorting places Emergency ahead of Standard.
  // Standard ticket will have Emergency ahead of it.
  // Emergency ticket workload multiplier = 1.5.
  // Standard wait time = 1.5 * 10 = 15 mins base wait time.
  const resStandard = WaitTimeCalculator.calculateWaitTime({
    queue,
    targetTicket: tStandard,
    waitingTickets,
    activeCounters: 1,
  });

  assert.equal(resStandard.positionInQueue, 2); // Placed 2nd behind Emergency
  assert.equal(resStandard.estimatedMinutes, 15);

  // Emergency ticket is placed 1st (0 ahead of it)
  const resEmergency = WaitTimeCalculator.calculateWaitTime({
    queue,
    targetTicket: tEmergency,
    waitingTickets,
    activeCounters: 1,
  });

  assert.equal(resEmergency.positionInQueue, 1);
  assert.equal(resEmergency.formattedDisplay, "0–5 mins");
});

test("WaitTimeCalculator handles confidence levels and edge cases", () => {
  const queue = createDummyQueue({ avgServiceTimeMinutes: 10, isActive: false });

  // Inactive queue
  const resInactive = WaitTimeCalculator.calculateWaitTime({ queue });
  assert.equal(resInactive.formattedDisplay, "Queue Inactive");
  assert.equal(resInactive.estimatedMinutes, 0);

  // Paused queue
  const activeQueue = createDummyQueue({ avgServiceTimeMinutes: 10, isActive: true });
  const resPaused = WaitTimeCalculator.calculateWaitTime({ queue: activeQueue, isQueuePaused: true });
  assert.equal(resPaused.formattedDisplay, "Queue Paused");

  // Ticket currently in service
  const tInService = activeQueue.issueTicket({ customerName: "Dave" });
  tInService.call("Counter-1", "user-1");
  tInService.startService();

  const resInService = WaitTimeCalculator.calculateWaitTime({
    queue: activeQueue,
    targetTicket: tInService,
    waitingTickets: [tInService],
  });

  assert.equal(resInService.formattedDisplay, "Currently Serving");
  assert.equal(resInService.estimatedMinutes, 0);
  assert.equal(resInService.positionInQueue, 0);
});
