import { and, asc, eq, max } from "drizzle-orm";
import type { WaitlistEntry, WaitlistRepository, WaitlistStatus } from "@adminops/branch-flow";
import type { Database } from "./database.js";
import { appointmentWaitlists } from "./schema.js";

type WaitlistRow = typeof appointmentWaitlists.$inferSelect;

function toEntry(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    serviceId: row.serviceId,
    customerEmail: row.customerEmail,
    customerMetadata: row.customerMetadata,
    desiredStartAt: row.desiredStartAt,
    desiredEndAt: row.desiredEndAt,
    queuePosition: row.queuePosition,
    status: row.status as WaitlistStatus,
    promotedAppointmentId: row.promotedAppointmentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresWaitlistRepository implements WaitlistRepository {
  constructor(private readonly db: Database) {}

  async save(entry: WaitlistEntry): Promise<void> {
    await this.db.insert(appointmentWaitlists).values({
      id: entry.id,
      tenantId: entry.tenantId,
      branchId: entry.branchId,
      serviceId: entry.serviceId,
      customerEmail: entry.customerEmail,
      customerMetadata: entry.customerMetadata,
      desiredStartAt: entry.desiredStartAt,
      desiredEndAt: entry.desiredEndAt,
      queuePosition: entry.queuePosition,
      status: entry.status,
      promotedAppointmentId: entry.promotedAppointmentId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }).onConflictDoUpdate({
      target: appointmentWaitlists.id,
      set: {
        customerEmail: entry.customerEmail,
        customerMetadata: entry.customerMetadata,
        desiredStartAt: entry.desiredStartAt,
        desiredEndAt: entry.desiredEndAt,
        queuePosition: entry.queuePosition,
        status: entry.status,
        promotedAppointmentId: entry.promotedAppointmentId,
        updatedAt: entry.updatedAt,
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<WaitlistEntry | undefined> {
    const [row] = await this.db.select().from(appointmentWaitlists)
      .where(and(eq(appointmentWaitlists.tenantId, tenantId), eq(appointmentWaitlists.id, id))).limit(1);
    return row ? toEntry(row) : undefined;
  }

  async listByTenant(tenantId: string): Promise<WaitlistEntry[]> {
    const rows = await this.db.select().from(appointmentWaitlists)
      .where(eq(appointmentWaitlists.tenantId, tenantId))
      .orderBy(asc(appointmentWaitlists.createdAt));
    return rows.map(toEntry);
  }

  async listQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry[]> {
    const rows = await this.db.select().from(appointmentWaitlists).where(and(
      eq(appointmentWaitlists.tenantId, tenantId),
      eq(appointmentWaitlists.branchId, branchId),
      eq(appointmentWaitlists.serviceId, serviceId),
      eq(appointmentWaitlists.status, "waiting"),
    )).orderBy(asc(appointmentWaitlists.queuePosition), asc(appointmentWaitlists.createdAt));
    return rows.map(toEntry);
  }

  async getNextInQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry | undefined> {
    return (await this.listQueue(tenantId, branchId, serviceId))[0];
  }

  async getNextPosition(tenantId: string, branchId: string, serviceId: string): Promise<number> {
    const [row] = await this.db.select({ position: max(appointmentWaitlists.queuePosition) })
      .from(appointmentWaitlists).where(and(
        eq(appointmentWaitlists.tenantId, tenantId),
        eq(appointmentWaitlists.branchId, branchId),
        eq(appointmentWaitlists.serviceId, serviceId),
        eq(appointmentWaitlists.status, "waiting"),
      ));
    return (row?.position ?? 0) + 1;
  }
}
