import { and, asc, desc, eq } from "drizzle-orm";
import type { WaitlistEntry, WaitlistRepository } from "@adminops/branch-flow";
import type { Database } from "./database.js";
import { waitlists } from "./schema.js";

type WaitlistRow = typeof waitlists.$inferSelect;

function toWaitlistEntry(row: WaitlistRow): WaitlistEntry {
  return {
    id: row.id,
    tenantId: row.tenantId,
    appointmentId: row.appointmentId ?? null,
    branchId: row.branchId,
    serviceId: row.serviceId,
    customerEmail: row.customerEmail,
    customerMetadata: row.customerMetadata as Record<string, unknown>,
    queuePosition: row.queuePosition,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresWaitlistRepository implements WaitlistRepository {
  constructor(private readonly db: Database) {}

  async save(entry: WaitlistEntry): Promise<void> {
    await this.db
      .insert(waitlists)
      .values({
        id: entry.id,
        tenantId: entry.tenantId,
        appointmentId: entry.appointmentId ?? null,
        branchId: entry.branchId,
        serviceId: entry.serviceId,
        customerEmail: entry.customerEmail,
        customerMetadata: entry.customerMetadata,
        queuePosition: entry.queuePosition,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })
      .onConflictDoUpdate({
        target: waitlists.id,
        set: {
          appointmentId: entry.appointmentId ?? null,
          queuePosition: entry.queuePosition,
          updatedAt: new Date(),
        },
      });
  }

  async findById(tenantId: string, id: string): Promise<WaitlistEntry | undefined> {
    const [row] = await this.db
      .select()
      .from(waitlists)
      .where(and(eq(waitlists.tenantId, tenantId), eq(waitlists.id, id)))
      .limit(1);
    return row ? toWaitlistEntry(row) : undefined;
  }

  async listByTenant(tenantId: string): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlists)
      .where(eq(waitlists.tenantId, tenantId))
      .orderBy(asc(waitlists.queuePosition));
    return rows.map(toWaitlistEntry);
  }

  async listQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry[]> {
    const rows = await this.db
      .select()
      .from(waitlists)
      .where(
        and(
          eq(waitlists.tenantId, tenantId),
          eq(waitlists.branchId, branchId),
          eq(waitlists.serviceId, serviceId)
        )
      )
      .orderBy(asc(waitlists.queuePosition));
    return rows.map(toWaitlistEntry);
  }

  async getNextInQueue(tenantId: string, branchId: string, serviceId: string): Promise<WaitlistEntry | undefined> {
    const [row] = await this.db
      .select()
      .from(waitlists)
      .where(
        and(
          eq(waitlists.tenantId, tenantId),
          eq(waitlists.branchId, branchId),
          eq(waitlists.serviceId, serviceId)
        )
      )
      .orderBy(asc(waitlists.queuePosition))
      .limit(1);
    return row ? toWaitlistEntry(row) : undefined;
  }

  async getNextPosition(tenantId: string, branchId: string, serviceId: string): Promise<number> {
    const [row] = await this.db
      .select()
      .from(waitlists)
      .where(
        and(
          eq(waitlists.tenantId, tenantId),
          eq(waitlists.branchId, branchId),
          eq(waitlists.serviceId, serviceId)
        )
      )
      .orderBy(desc(waitlists.queuePosition))
      .limit(1);
    return row ? row.queuePosition + 1 : 1;
  }

  async delete(tenantId: string, id: string): Promise<void> {
    await this.db
      .delete(waitlists)
      .where(and(eq(waitlists.tenantId, tenantId), eq(waitlists.id, id)));
  }
}
