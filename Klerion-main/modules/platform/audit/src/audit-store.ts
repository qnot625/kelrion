import crypto from "node:crypto";

export interface AuditEvent {
  id: string;
  tenantId: string;
  action: string;
  actorId: string;
  timestamp: string;
  payload: Record<string, unknown>;
  hash: string;
  previousHash: string;
}

export class AuditLogService {
  private static events: AuditEvent[] = [];
  private static lastHashByTenant: Map<string, string> = new Map();

  /**
   * Appends an immutable audit log event with SHA-256 hash chaining.
   */
  public static async logEvent(
    tenantId: string,
    action: string,
    actorId: string,
    payload: Record<string, unknown> = {}
  ): Promise<AuditEvent> {
    const previousHash = this.lastHashByTenant.get(tenantId) || "0".repeat(64);
    const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const timestamp = new Date().toISOString();

    const dataToHash = `${id}:${tenantId}:${action}:${actorId}:${timestamp}:${JSON.stringify(payload)}:${previousHash}`;
    const hash = crypto.createHash("sha256").update(dataToHash).digest("hex");

    const event: AuditEvent = {
      id,
      tenantId,
      action,
      actorId,
      timestamp,
      payload,
      hash,
      previousHash,
    };

    // Immutability: Freeze object before storage
    Object.freeze(event);
    Object.freeze(event.payload);

    this.events.push(event);
    this.lastHashByTenant.set(tenantId, hash);

    return event;
  }

  /**
   * Queries audit logs with filtering and tenant isolation.
   */
  public static queryEvents(
    tenantId: string,
    filters?: { action?: string; actorId?: string; limit?: number }
  ): AuditEvent[] {
    let result = this.events.filter((e) => e.tenantId === tenantId);
    if (filters?.action) {
      result = result.filter((e) => e.action === filters.action);
    }
    if (filters?.actorId) {
      result = result.filter((e) => e.actorId === filters.actorId);
    }
    const limit = filters?.limit || 100;
    return result.slice(-limit);
  }

  /**
   * Verifies the cryptographic chain integrity of audit logs for a tenant.
   */
  public static verifyIntegrity(tenantId: string): { valid: boolean; corruptedEventId?: string } {
    const tenantEvents = this.events.filter((e) => e.tenantId === tenantId);
    let expectedPreviousHash = "0".repeat(64);

    for (const event of tenantEvents) {
      if (event.previousHash !== expectedPreviousHash) {
        return { valid: false, corruptedEventId: event.id };
      }

      const dataToHash = `${event.id}:${event.tenantId}:${event.action}:${event.actorId}:${event.timestamp}:${JSON.stringify(event.payload)}:${event.previousHash}`;
      const recomputedHash = crypto.createHash("sha256").update(dataToHash).digest("hex");

      if (recomputedHash !== event.hash) {
        return { valid: false, corruptedEventId: event.id };
      }

      expectedPreviousHash = event.hash;
    }

    return { valid: true };
  }

  /**
   * Clears audit store (for testing).
   */
  public static clear(): void {
    this.events = [];
    this.lastHashByTenant.clear();
  }
}
