import { asc, desc, eq, sql } from "drizzle-orm";
import { computeEventHash } from "../../hash-chain.js";
import type { AuditEvent, RecordAuditEventInput } from "../../audit-event.js";
import type { AuditLog } from "../../audit-log.js";
import type { Database } from "@adminops/persistence";
import { auditEvents } from "./schema.js";

type AuditEventRow = typeof auditEvents.$inferSelect;

function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    occurredAt: row.occurredAt,
    metadata: row.metadata,
    previousHash: row.previousHash,
    hash: row.hash,
  };
}

export class PostgresAuditLog implements AuditLog {
  constructor(private readonly db: Database) {}

  /**
   * Serializes appends per tenant with an advisory lock so two concurrent
   * writers cannot read the same tail row and fork the hash chain.
   */
  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.tenantId}))`);

      const [previous] = await tx
        .select({ hash: auditEvents.hash })
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, input.tenantId))
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
        .limit(1);

      const previousHash = previous?.hash ?? null;
      const occurredAt = new Date();
      const metadata = input.metadata ?? {};

      const hash = computeEventHash({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        occurredAt,
        metadata,
        previousHash,
      });

      const [row] = await tx
        .insert(auditEvents)
        .values({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          occurredAt,
          metadata,
          previousHash,
          hash,
        })
        .returning();

      return toAuditEvent(row!);
    });
  }

  async listByTenant(tenantId: string): Promise<AuditEvent[]> {
    const rows = await this.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId))
      .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
    return rows.map(toAuditEvent);
  }
}
