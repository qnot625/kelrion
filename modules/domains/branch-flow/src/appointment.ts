export type AppointmentStatus = "booked" | "checked_in" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string | null;
  readonly serviceId: string | null;
  readonly customerEmail: string;
  readonly serviceName: string;
  readonly customerMetadata: Readonly<Record<string, unknown>>;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly status: AppointmentStatus;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
}

export interface BookAppointmentInput {
  tenantId: string;
  branchId?: string | null;
  serviceId?: string | null;
  customerEmail: string;
  serviceName?: string;
  customerMetadata?: Readonly<Record<string, unknown>>;
  startAt: Date;
  endAt: Date;
}

export interface RescheduleAppointmentInput {
  tenantId: string;
  appointmentId: string;
  startAt: Date;
  endAt: Date;
}

export class InvalidAppointmentWindowError extends Error {
  constructor() {
    super("Appointment end time must be after its start time");
    this.name = "InvalidAppointmentWindowError";
  }
}

export class AppointmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Appointment "${id}" was not found for this tenant`);
    this.name = "AppointmentNotFoundError";
  }
}

export class InvalidAppointmentTransitionError extends Error {
  constructor(from: AppointmentStatus, to: AppointmentStatus) {
    super(`Cannot move an appointment from "${from}" to "${to}"`);
    this.name = "InvalidAppointmentTransitionError";
  }
}

export class AppointmentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentConfigurationError";
  }
}

export class SlotNotAvailableError extends Error {
  constructor(message = "The requested timeslot is not available") {
    super(message);
    this.name = "SlotNotAvailableError";
  }
}
