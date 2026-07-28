export interface AuditEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly previousHash: string | null;
  readonly hash: string;
}

export interface RecordAuditEventInput {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}
