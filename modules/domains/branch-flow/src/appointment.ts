export type AppointmentStatus = "booked" | "checked_in" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  readonly id: string;
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly customerEmail: string;
  readonly customerMetadata: Record<string, unknown>;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly status: AppointmentStatus;
  readonly createdAt: Date;
}

export interface BookAppointmentInput {
  tenantId: string;
  branchId: string;
  serviceId: string;
  customerEmail: string;
  customerMetadata?: Record<string, unknown>;
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
