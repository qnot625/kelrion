import { and, eq, inArray, count, sql } from "drizzle-orm";
import {
  TicketId,
  QueueId,
  TenantId,
  BranchId,
  TicketStatus,
  QueuePriority,
  TicketNumber,
  QueueTicket,
  Queue,
  ITicketRepository,
  IssueTicketAtomicOptions,
} from "@klerion/queue";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PostgresTicketRepository implements ITicketRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, ticketId: TicketId): Promise<QueueTicket | null> {
    const rows = await this.db
      .select()
      .from(schema.queueTickets)
      .where(
        and(eq(schema.queueTickets.tenantId, tenantId.value), eq(schema.queueTickets.id, ticketId.value))
      );

    const row = rows[0];
    if (!row) return null;
    return this.mapToQueueTicket(row);
  }

  async findByNumber(
    tenantId: TenantId,
    queueId: QueueId,
    displayNumber: string
  ): Promise<QueueTicket | null> {
    const rows = await this.db
      .select()
      .from(schema.queueTickets)
      .where(
        and(
          eq(schema.queueTickets.tenantId, tenantId.value),
          eq(schema.queueTickets.queueId, queueId.value),
          eq(schema.queueTickets.displayNumber, displayNumber.trim().toUpperCase())
        )
      );

    const row = rows[0];
    if (!row) return null;
    return this.mapToQueueTicket(row);
  }

  async findByIdempotencyKey(
    tenantId: TenantId,
    idempotencyKey: string
  ): Promise<QueueTicket | null> {
    const rows = await this.db
      .select()
      .from(schema.queueTickets)
      .where(
        and(
          eq(schema.queueTickets.tenantId, tenantId.value),
          eq(schema.queueTickets.idempotencyKey, idempotencyKey)
        )
      );

    const row = rows[0];
    if (!row) return null;
    return this.mapToQueueTicket(row);
  }

  async findByQueue(
    tenantId: TenantId,
    queueId: QueueId,
    statuses?: TicketStatus[]
  ): Promise<QueueTicket[]> {
    const conditions = [
      eq(schema.queueTickets.tenantId, tenantId.value),
      eq(schema.queueTickets.queueId, queueId.value),
    ];

    if (statuses && statuses.length > 0) {
      conditions.push(inArray(schema.queueTickets.status, statuses));
    }

    const rows = await this.db
      .select()
      .from(schema.queueTickets)
      .where(and(...conditions));

    return rows.map((r) => this.mapToQueueTicket(r));
  }

  async findByTenant(tenantId: TenantId, statuses?: TicketStatus[]): Promise<QueueTicket[]> {
    const conditions = [eq(schema.queueTickets.tenantId, tenantId.value)];

    if (statuses && statuses.length > 0) {
      conditions.push(inArray(schema.queueTickets.status, statuses));
    }

    const rows = await this.db
      .select()
      .from(schema.queueTickets)
      .where(and(...conditions));

    return rows.map((r) => this.mapToQueueTicket(r));
  }

  async findActiveByQueue(tenantId: TenantId, queueId: QueueId): Promise<QueueTicket[]> {
    return this.findByQueue(tenantId, queueId, [
      TicketStatus.WAITING,
      TicketStatus.CALLED,
      TicketStatus.IN_SERVICE,
    ]);
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
    options?: IssueTicketAtomicOptions
  ): Promise<QueueTicket> {
    return await this.db.transaction(async (tx) => {
      if (options?.idempotencyKey) {
        const existingRows = await tx
          .select()
          .from(schema.queueTickets)
          .where(
            and(
              eq(schema.queueTickets.tenantId, tenantId.value),
              eq(schema.queueTickets.idempotencyKey, options.idempotencyKey)
            )
          );
        if (existingRows[0]) {
          return this.mapToQueueTicket(existingRows[0]);
        }
      }

      const updatedQueues = await tx
        .update(schema.queues)
        .set({
          currentSequence: sql`${schema.queues.currentSequence} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.queues.tenantId, tenantId.value),
            eq(schema.queues.id, queueId.value)
          )
        )
        .returning();

      const queueRow = updatedQueues[0];
      if (!queueRow) {
        throw new Error(`Queue not found: ${queueId.value}`);
      }
      if (!queueRow.isActive) {
        throw new Error(`Cannot issue ticket for inactive queue '${queueRow.name}'`);
      }

      const nextSequence = queueRow.currentSequence;
      const ticketNumber = TicketNumber.create(queueRow.prefix, nextSequence);
      const ticketId = TicketId.generate();

      const [insertedRow] = await tx
        .insert(schema.queueTickets)
        .values({
          id: ticketId.value,
          tenantId: tenantId.value,
          queueId: queueId.value,
          ticketNumber: ticketNumber.sequence,
          displayNumber: ticketNumber.formatted,
          priorityLevel: options?.priority ?? QueuePriority.STANDARD,
          status: TicketStatus.WAITING,
          customerName: options?.customerName ?? null,
          customerPhone: options?.customerPhone ?? null,
          serviceId: options?.serviceId ?? null,
          idempotencyKey: options?.idempotencyKey ?? null,
          joinedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();

      if (insertedRow) {
        return this.mapToQueueTicket(insertedRow);
      }

      if (options?.idempotencyKey) {
        const existingRows = await tx
          .select()
          .from(schema.queueTickets)
          .where(
            and(
              eq(schema.queueTickets.tenantId, tenantId.value),
              eq(schema.queueTickets.idempotencyKey, options.idempotencyKey)
            )
          );
        if (existingRows[0]) {
          return this.mapToQueueTicket(existingRows[0]);
        }
      }

      throw new Error(`Failed to issue ticket atomically for queue '${queueId.value}'`);
    });
  }

  async save(ticket: QueueTicket): Promise<void> {
    await this.db
      .insert(schema.queueTickets)
      .values({
        id: ticket.id.value,
        tenantId: ticket.tenantId.value,
        queueId: ticket.queueId.value,
        ticketNumber: ticket.number.sequence,
        displayNumber: ticket.number.formatted,
        priorityLevel: ticket.priority,
        status: ticket.status,
        customerName: ticket.customerName,
        customerPhone: ticket.customerPhone,
        serviceId: ticket.serviceId,
        counterNumber: ticket.counterId,
        idempotencyKey: ticket.idempotencyKey,
        joinedAt: ticket.createdAt,
        calledAt: ticket.calledAt,
        servedAt: ticket.serviceStartedAt,
        completedAt: ticket.completedAt,
      })
      .onConflictDoUpdate({
        target: schema.queueTickets.id,
        set: {
          status: ticket.status,
          priorityLevel: ticket.priority,
          customerName: ticket.customerName,
          customerPhone: ticket.customerPhone,
          counterNumber: ticket.counterId,
          idempotencyKey: ticket.idempotencyKey,
          calledAt: ticket.calledAt,
          servedAt: ticket.serviceStartedAt,
          completedAt: ticket.completedAt,
        },
      });
  }

  async countWaiting(tenantId: TenantId, queueId: QueueId): Promise<number> {
    const result = await this.db
      .select({ val: count() })
      .from(schema.queueTickets)
      .where(
        and(
          eq(schema.queueTickets.tenantId, tenantId.value),
          eq(schema.queueTickets.queueId, queueId.value),
          eq(schema.queueTickets.status, TicketStatus.WAITING)
        )
      );

    return Number(result[0]?.val ?? 0);
  }

  async delete(tenantId: TenantId, ticketId: TicketId): Promise<void> {
    await this.db
      .delete(schema.queueTickets)
      .where(
        and(eq(schema.queueTickets.tenantId, tenantId.value), eq(schema.queueTickets.id, ticketId.value))
      );
  }

  private mapToQueueTicket(row: typeof schema.queueTickets.$inferSelect): QueueTicket {
    let ticketNumber: TicketNumber;
    try {
      ticketNumber = TicketNumber.parse(row.displayNumber);
    } catch {
      ticketNumber = TicketNumber.create("A", row.ticketNumber);
    }

    return new QueueTicket({
      id: new TicketId(row.id),
      tenantId: new TenantId(row.tenantId),
      branchId: new BranchId(row.tenantId),
      queueId: new QueueId(row.queueId),
      number: ticketNumber,
      status: row.status as TicketStatus,
      priority: row.priorityLevel as QueuePriority,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      serviceId: row.serviceId,
      counterId: row.counterNumber,
      idempotencyKey: row.idempotencyKey,
      calledAt: row.calledAt,
      serviceStartedAt: row.servedAt,
      completedAt: row.completedAt,
      createdAt: row.joinedAt,
    });
  }
}
