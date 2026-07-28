import type { AuditEvent, RecordAuditEventInput } from "./audit-event.js";

export interface AuditLog {
  record(input: RecordAuditEventInput): Promise<AuditEvent>;
  listByTenant(tenantId: string): Promise<AuditEvent[]>;
}
