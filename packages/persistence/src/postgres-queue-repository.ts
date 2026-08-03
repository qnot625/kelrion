import { and, eq } from "drizzle-orm";
import { QueueId, TenantId, BranchId, Queue, IQueueRepository } from "@klerion/queue";
import type { Database } from "./database.js";
import * as schema from "./schema.js";

export class PostgresQueueRepository implements IQueueRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: TenantId, queueId: QueueId): Promise<Queue | null> {
    const rows = await this.db
      .select()
      .from(schema.queues)
      .where(and(eq(schema.queues.tenantId, tenantId.value), eq(schema.queues.id, queueId.value)));

    const row = rows[0];
    if (!row) return null;
    return this.mapToQueue(row);
  }

  async findByTenant(tenantId: TenantId): Promise<Queue[]> {
    const rows = await this.db
      .select()
      .from(schema.queues)
      .where(eq(schema.queues.tenantId, tenantId.value));

    return rows.map((row) => this.mapToQueue(row));
  }

  async findByBranch(tenantId: TenantId, branchId: BranchId): Promise<Queue[]> {
    const rows = await this.db
      .select()
      .from(schema.queues)
      .where(and(eq(schema.queues.tenantId, tenantId.value), eq(schema.queues.branchId, branchId.value)));

    return rows.map((row) => this.mapToQueue(row));
  }

  async findActive(tenantId: TenantId): Promise<Queue[]> {
    const rows = await this.db
      .select()
      .from(schema.queues)
      .where(and(eq(schema.queues.tenantId, tenantId.value), eq(schema.queues.isActive, true)));

    return rows.map((row) => this.mapToQueue(row));
  }

  async save(queue: Queue): Promise<void> {
    await this.db
      .insert(schema.queues)
      .values({
        id: queue.id.value,
        tenantId: queue.tenantId.value,
        branchId: queue.branchId.value,
        name: queue.name,
        code: queue.code,
        prefix: queue.prefix,
        isActive: queue.isActive,
        currentSequence: queue.currentSequence,
        createdAt: queue.createdAt,
        updatedAt: queue.updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.queues.id,
        set: {
          name: queue.name,
          code: queue.code,
          prefix: queue.prefix,
          isActive: queue.isActive,
          currentSequence: queue.currentSequence,
          updatedAt: queue.updatedAt,
        },
      });
  }

  async delete(tenantId: TenantId, queueId: QueueId): Promise<void> {
    await this.db
      .delete(schema.queues)
      .where(and(eq(schema.queues.tenantId, tenantId.value), eq(schema.queues.id, queueId.value)));
  }

  private mapToQueue(row: typeof schema.queues.$inferSelect): Queue {
    return new Queue({
      id: new QueueId(row.id),
      tenantId: new TenantId(row.tenantId),
      branchId: new BranchId(row.branchId ?? row.tenantId),
      code: row.code,
      name: row.name,
      prefix: row.prefix,
      isActive: row.isActive,
      currentSequence: row.currentSequence,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
