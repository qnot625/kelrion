export type WaitlistStatus = "waiting" | "promoted" | "removed";

export interface WaitlistEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly customerEmail: string;
  readonly customerMetadata: Readonly<Record<string, unknown>>;
  readonly desiredStartAt: Date | null;
  readonly desiredEndAt: Date | null;
  readonly queuePosition: number;
  readonly status: WaitlistStatus;
  readonly promotedAppointmentId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AddToWaitlistInput {
  tenantId: string;
  branchId: string;
  serviceId: string;
  customerEmail: string;
  customerMetadata?: Readonly<Record<string, unknown>>;
  desiredStartAt?: Date | null;
  desiredEndAt?: Date | null;
}

export class WaitlistEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`Waitlist entry "${id}" was not found for this tenant`);
    this.name = "WaitlistEntryNotFoundError";
  }
}
