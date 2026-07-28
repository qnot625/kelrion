import { randomUUID } from "node:crypto";
import type { AuditEvent, RecordAuditEventInput } from "./audit-event.js";
import type { AuditLog } from "./audit-log.js";
import { computeEventHash } from "./hash-chain.js";

export class InMemoryAuditLog implements AuditLog {
  private readonly eventsByTenant = new Map<string, AuditEvent[]>();

  async record(input: RecordAuditEventInput): Promise<AuditEvent> {
    const chain = this.eventsByTenant.get(input.tenantId) ?? [];
    const previousHash = chain.length > 0 ? chain[chain.length - 1]!.hash : null;
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

    const event: AuditEvent = {
      id: randomUUID(),
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt,
      metadata,
      previousHash,
      hash,
    };

    chain.push(event);
    this.eventsByTenant.set(input.tenantId, chain);
    return event;
  }

  async listByTenant(tenantId: string): Promise<AuditEvent[]> {
    return [...(this.eventsByTenant.get(tenantId) ?? [])];
  }
}
