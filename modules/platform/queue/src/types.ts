export type QueuePriority = "STANDARD" | "PRIORITY" | "URGENT";
export type QueueEntryKind = "WALK_IN" | "APPOINTMENT";
export type QueueCheckInSource = "STAFF" | "KIOSK" | "QR" | "PUBLIC" | "API";
export type QueueEntryStatus = "WAITING" | "CALLED" | "SERVING" | "COMPLETED" | "NO_SHOW" | "CANCELLED" | "TRANSFERRED";
export type QueueEventType = "CHECKED_IN" | "PRIORITY_CHANGED" | "CALLED" | "RECALLED" | "SERVICE_STARTED" | "COMPLETED" | "NO_SHOW" | "CANCELLED" | "TRANSFERRED";

export interface QueueCustomerReference {
  readonly userId?: string | null;
  readonly employeeId?: string | null;
  readonly customerId?: string | null;
  readonly name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly externalReference?: string | null;
}

export interface QueueConfigurationData {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly departmentId: string | null;
  readonly prefix: string;
  readonly averageServiceMinutes: number;
  readonly allowWalkIns: boolean;
  readonly allowAppointmentCheckIn: boolean;
  readonly maxEarlyCheckInMinutes: number | null;
  readonly maxLateCheckInMinutes: number | null;
  readonly maxConcurrentServing: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface QueueEntryData {
  readonly id: string;
  readonly tenantId: string;
  readonly publicToken: string;
  readonly ticketNumber: string;
  readonly kind: QueueEntryKind;
  readonly branchId: string;
  readonly serviceId: string;
  readonly departmentId: string | null;
  readonly appointmentId: string | null;
  readonly customer: QueueCustomerReference;
  readonly priority: QueuePriority;
  readonly priorityAdjustment: number;
  readonly priorityScore: number;
  readonly checkInSource: QueueCheckInSource;
  readonly status: QueueEntryStatus;
  readonly stationId: string | null;
  readonly servingStaffUserId: string | null;
  readonly recallCount: number;
  readonly checkedInAt: Date;
  readonly calledAt: Date | null;
  readonly serviceStartedAt: Date | null;
  readonly completedAt: Date | null;
  readonly noShowAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly transferredAt: Date | null;
  readonly idempotencyKey: string | null;
  readonly transferFromEntryId: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface QueueEventData {
  readonly id: string;
  readonly sequence: number;
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly entryId: string;
  readonly type: QueueEventType;
  readonly actorUserId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

export interface QueueSnapshotItem {
  readonly entryId: string;
  readonly ticketNumber: string;
  readonly status: QueueEntryStatus;
  readonly priority: QueuePriority;
  readonly stationId: string | null;
  readonly checkedInAt: Date;
  readonly calledAt: Date | null;
}

export interface AppointmentCheckInFacts {
  readonly appointmentId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly departmentId?: string | null;
  readonly startsAt?: Date | null;
  readonly status?: string | null;
  readonly customer?: QueueCustomerReference;
}
