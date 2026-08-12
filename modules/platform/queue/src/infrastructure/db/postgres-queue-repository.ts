import { and, asc, desc, eq, gt, isNull, notInArray, sql } from "drizzle-orm";
import {
  QueueConfiguration,
  QueueEntry,
  type QueueCheckInSource,
  type QueueConfigurationRepository,
  type QueueCustomerReference,
  type QueueEntryKind,
  type QueueEntryRepository,
  type QueueEntryStatus,
  type QueueEventData,
  type QueueEventRepository,
  type QueueEventType,
  type QueuePriority,
} from "../../index.js";
import type { Database } from "@adminops/persistence";
import { queueConfigurations, queueEntries, queueEvents } from "./schema.js";

type ConfigRow = typeof queueConfigurations.$inferSelect;
type EntryRow = typeof queueEntries.$inferSelect;
type EventRow = typeof queueEvents.$inferSelect;

function config(row: ConfigRow): QueueConfiguration {
  return new QueueConfiguration({
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    serviceId: row.serviceId,
    departmentId: row.departmentId,
    prefix: row.prefix,
    averageServiceMinutes: row.averageServiceMinutes,
    allowWalkIns: row.allowWalkIns,
    allowAppointmentCheckIn: row.allowAppointmentCheckIn,
    maxEarlyCheckInMinutes: row.maxEarlyCheckInMinutes,
    maxLateCheckInMinutes: row.maxLateCheckInMinutes,
    maxConcurrentServing: row.maxConcurrentServing,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function entry(row: EntryRow): QueueEntry {
  return new QueueEntry({
    id: row.id,
    tenantId: row.tenantId,
    publicToken: row.publicToken,
    ticketNumber: row.ticketNumber,
    kind: row.kind as QueueEntryKind,
    branchId: row.branchId,
    serviceId: row.serviceId,
    departmentId: row.departmentId,
    appointmentId: row.appointmentId,
    customer: row.customer,
    priority: row.priority as QueuePriority,
    priorityAdjustment: row.priorityAdjustment,
    priorityScore: row.priorityScore,
    checkInSource: row.checkInSource as QueueCheckInSource,
    status: row.status as QueueEntryStatus,
    stationId: row.stationId,
    servingStaffUserId: row.servingStaffUserId,
    recallCount: row.recallCount,
    checkedInAt: row.checkedInAt,
    calledAt: row.calledAt,
    serviceStartedAt: row.serviceStartedAt,
    completedAt: row.completedAt,
    noShowAt: row.noShowAt,
    cancelledAt: row.cancelledAt,
    transferredAt: row.transferredAt,
    idempotencyKey: row.idempotencyKey,
    transferFromEntryId: row.transferFromEntryId,
    metadata: row.metadata,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function event(row: EventRow): QueueEventData {
  return {
    id: row.id,
    sequence: row.sequence,
    tenantId: row.tenantId,
    branchId: row.branchId,
    serviceId: row.serviceId,
    entryId: row.entryId,
    type: row.type as QueueEventType,
    actorUserId: row.actorUserId,
    data: row.data,
    createdAt: row.createdAt,
  };
}

export class PostgresQueueConfigurationRepository implements QueueConfigurationRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(queueConfigurations).where(and(eq(queueConfigurations.tenantId, tenantId), eq(queueConfigurations.id, id))).limit(1);
    return row ? config(row) : null;
  }

  async findForQueue(tenantId: string, branchId: string, serviceId: string, departmentId?: string | null) {
    if (departmentId) {
      const [exact] = await this.db.select().from(queueConfigurations).where(and(
        eq(queueConfigurations.tenantId, tenantId),
        eq(queueConfigurations.branchId, branchId),
        eq(queueConfigurations.serviceId, serviceId),
        eq(queueConfigurations.departmentId, departmentId),
      )).limit(1);
      if (exact) return config(exact);
    }
    const [fallback] = await this.db.select().from(queueConfigurations).where(and(
      eq(queueConfigurations.tenantId, tenantId),
      eq(queueConfigurations.branchId, branchId),
      eq(queueConfigurations.serviceId, serviceId),
      isNull(queueConfigurations.departmentId),
    )).limit(1);
    return fallback ? config(fallback) : null;
  }

  async listByTenant(tenantId: string) {
    return (await this.db.select().from(queueConfigurations).where(eq(queueConfigurations.tenantId, tenantId)).orderBy(desc(queueConfigurations.updatedAt))).map(config);
  }

  async listByBranch(tenantId: string, branchId: string) {
    return (await this.db.select().from(queueConfigurations).where(and(eq(queueConfigurations.tenantId, tenantId), eq(queueConfigurations.branchId, branchId))).orderBy(desc(queueConfigurations.updatedAt))).map(config);
  }

  async save(configuration: QueueConfiguration) {
    const data = configuration.toPersistence();
    await this.db.insert(queueConfigurations).values({
      id: data.id,
      tenantId: data.tenantId,
      branchId: data.branchId,
      serviceId: data.serviceId,
      departmentId: data.departmentId,
      prefix: data.prefix,
      averageServiceMinutes: data.averageServiceMinutes,
      allowWalkIns: data.allowWalkIns,
      allowAppointmentCheckIn: data.allowAppointmentCheckIn,
      maxEarlyCheckInMinutes: data.maxEarlyCheckInMinutes,
      maxLateCheckInMinutes: data.maxLateCheckInMinutes,
      maxConcurrentServing: data.maxConcurrentServing,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }).onConflictDoUpdate({
      target: queueConfigurations.id,
      set: {
        branchId: data.branchId,
        serviceId: data.serviceId,
        departmentId: data.departmentId,
        prefix: data.prefix,
        averageServiceMinutes: data.averageServiceMinutes,
        allowWalkIns: data.allowWalkIns,
        allowAppointmentCheckIn: data.allowAppointmentCheckIn,
        maxEarlyCheckInMinutes: data.maxEarlyCheckInMinutes,
        maxLateCheckInMinutes: data.maxLateCheckInMinutes,
        maxConcurrentServing: data.maxConcurrentServing,
        updatedAt: data.updatedAt,
      },
    });
  }
}

export class PostgresQueueEntryRepository implements QueueEntryRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string) {
    const [row] = await this.db.select().from(queueEntries).where(and(eq(queueEntries.tenantId, tenantId), eq(queueEntries.id, id))).limit(1);
    return row ? entry(row) : null;
  }

  async findByPublicToken(tenantId: string, publicToken: string) {
    const [row] = await this.db.select().from(queueEntries).where(and(eq(queueEntries.tenantId, tenantId), eq(queueEntries.publicToken, publicToken))).limit(1);
    return row ? entry(row) : null;
  }

  async findActiveByAppointment(tenantId: string, appointmentId: string) {
    const [row] = await this.db.select().from(queueEntries).where(and(
      eq(queueEntries.tenantId, tenantId),
      eq(queueEntries.appointmentId, appointmentId),
      notInArray(queueEntries.status, ["COMPLETED", "NO_SHOW", "CANCELLED", "TRANSFERRED"]),
    )).orderBy(desc(queueEntries.updatedAt)).limit(1);
    return row ? entry(row) : null;
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    const [row] = await this.db.select().from(queueEntries).where(and(eq(queueEntries.tenantId, tenantId), eq(queueEntries.idempotencyKey, idempotencyKey))).limit(1);
    return row ? entry(row) : null;
  }

  async listForQueue(tenantId: string, branchId: string, serviceId: string) {
    return (await this.db.select().from(queueEntries).where(and(eq(queueEntries.tenantId, tenantId), eq(queueEntries.branchId, branchId), eq(queueEntries.serviceId, serviceId))).orderBy(desc(queueEntries.priorityScore), asc(queueEntries.checkedInAt))).map(entry);
  }

  async listByBranch(tenantId: string, branchId: string) {
    return (await this.db.select().from(queueEntries).where(and(eq(queueEntries.tenantId, tenantId), eq(queueEntries.branchId, branchId))).orderBy(desc(queueEntries.priorityScore), asc(queueEntries.checkedInAt))).map(entry);
  }

  async save(value: QueueEntry) {
    const data = value.toPersistence();
    await this.db.insert(queueEntries).values({
      id: data.id,
      tenantId: data.tenantId,
      publicToken: data.publicToken,
      ticketNumber: data.ticketNumber,
      kind: data.kind,
      branchId: data.branchId,
      serviceId: data.serviceId,
      departmentId: data.departmentId,
      appointmentId: data.appointmentId,
      customer: { ...data.customer },
      priority: data.priority,
      priorityAdjustment: data.priorityAdjustment,
      priorityScore: data.priorityScore,
      checkInSource: data.checkInSource,
      status: data.status,
      stationId: data.stationId,
      servingStaffUserId: data.servingStaffUserId,
      recallCount: data.recallCount,
      checkedInAt: data.checkedInAt,
      calledAt: data.calledAt,
      serviceStartedAt: data.serviceStartedAt,
      completedAt: data.completedAt,
      noShowAt: data.noShowAt,
      cancelledAt: data.cancelledAt,
      transferredAt: data.transferredAt,
      idempotencyKey: data.idempotencyKey,
      transferFromEntryId: data.transferFromEntryId,
      metadata: { ...data.metadata },
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }).onConflictDoUpdate({
      target: queueEntries.id,
      set: {
        priority: data.priority,
        priorityAdjustment: data.priorityAdjustment,
        priorityScore: data.priorityScore,
        status: data.status,
        stationId: data.stationId,
        servingStaffUserId: data.servingStaffUserId,
        recallCount: data.recallCount,
        calledAt: data.calledAt,
        serviceStartedAt: data.serviceStartedAt,
        completedAt: data.completedAt,
        noShowAt: data.noShowAt,
        cancelledAt: data.cancelledAt,
        transferredAt: data.transferredAt,
        metadata: { ...data.metadata },
        updatedAt: data.updatedAt,
      },
    });
  }

  async nextTicketNumber(tenantId: string, branchId: string, serviceId: string, prefix: string, businessDate: string) {
    const result = await this.db.execute(sql`
      INSERT INTO queue_ticket_sequences (tenant_id, branch_id, service_id, bucket_date, last_sequence)
      VALUES (${tenantId}::uuid, ${branchId}::uuid, ${serviceId}::uuid, ${businessDate}, 1)
      ON CONFLICT (tenant_id, branch_id, service_id, bucket_date)
      DO UPDATE SET last_sequence = queue_ticket_sequences.last_sequence + 1
      RETURNING last_sequence
    `);
    const rows = (result as unknown as { rows?: Array<{ last_sequence: number | string }> }).rows ?? [];
    const sequence = Number(rows[0]?.last_sequence ?? 0);
    if (!Number.isInteger(sequence) || sequence < 1) throw new Error("Could not allocate queue ticket number");
    return `${prefix}${String(sequence).padStart(3, "0")}`;
  }
}

export class PostgresQueueEventRepository implements QueueEventRepository {
  constructor(private readonly db: Database) {}

  async append(value: Omit<QueueEventData, "sequence">): Promise<QueueEventData> {
    const result = await this.db.execute(sql`
      INSERT INTO queue_event_sequences (tenant_id, last_sequence)
      VALUES (${value.tenantId}::uuid, 1)
      ON CONFLICT (tenant_id)
      DO UPDATE SET last_sequence = queue_event_sequences.last_sequence + 1
      RETURNING last_sequence
    `);
    const rows = (result as unknown as { rows?: Array<{ last_sequence: number | string }> }).rows ?? [];
    const sequence = Number(rows[0]?.last_sequence ?? 0);
    if (!Number.isInteger(sequence) || sequence < 1) throw new Error("Could not allocate queue event sequence");
    await this.db.insert(queueEvents).values({
      tenantId: value.tenantId,
      sequence,
      id: value.id,
      branchId: value.branchId,
      serviceId: value.serviceId,
      entryId: value.entryId,
      type: value.type,
      actorUserId: value.actorUserId,
      data: { ...value.data },
      createdAt: value.createdAt,
    });
    return { ...structuredClone(value), sequence, createdAt: new Date(value.createdAt) };
  }

  async listAfter(tenantId: string, afterSequence: number, options?: { branchId?: string; serviceId?: string; limit?: number }) {
    const conditions = [eq(queueEvents.tenantId, tenantId), gt(queueEvents.sequence, afterSequence)];
    if (options?.branchId) conditions.push(eq(queueEvents.branchId, options.branchId));
    if (options?.serviceId) conditions.push(eq(queueEvents.serviceId, options.serviceId));
    const rows = await this.db.select().from(queueEvents).where(and(...conditions)).orderBy(asc(queueEvents.sequence)).limit(Math.min(Math.max(options?.limit ?? 200, 1), 1000));
    return rows.map(event);
  }

  async listForEntry(tenantId: string, entryId: string) {
    return (await this.db.select().from(queueEvents).where(and(eq(queueEvents.tenantId, tenantId), eq(queueEvents.entryId, entryId))).orderBy(asc(queueEvents.sequence))).map(event);
  }
}
