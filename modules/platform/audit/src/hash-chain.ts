import { createHash } from "node:crypto";

interface HashableEventFields {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: Date;
  metadata: Readonly<Record<string, unknown>>;
  previousHash: string | null;
}

/**
 * Hashes an event together with the hash of the event before it, so any
 * edit, reorder or deletion downstream of a tampered event is detectable:
 * recomputing the chain from that point on will no longer match the
 * recorded hashes. This is tamper-evidence, not tamper-prevention — it
 * still relies on the store itself being append-only.
 */
export function computeEventHash(input: HashableEventFields): string {
  const canonical = JSON.stringify({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    occurredAt: input.occurredAt.toISOString(),
    metadata: input.metadata,
    previousHash: input.previousHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function verifyChainIntegrity(
  events: readonly (HashableEventFields & { hash: string })[],
): boolean {
  let expectedPreviousHash: string | null = null;
  for (const event of events) {
    if (event.previousHash !== expectedPreviousHash) {
      return false;
    }
    if (computeEventHash(event) !== event.hash) {
      return false;
    }
    expectedPreviousHash = event.hash;
  }
  return true;
}
