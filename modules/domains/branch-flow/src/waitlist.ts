export interface WaitlistEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly appointmentId?: string | null;
  readonly branchId: string;
  readonly serviceId: string;
  readonly customerEmail: string;
  readonly customerMetadata: Record<string, unknown>;
  readonly queuePosition: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AddToWaitlistInput {
  tenantId: string;
  branchId: string;
  serviceId: string;
  customerEmail: string;
  customerMetadata?: Record<string, unknown>;
}
