import { randomUUID } from "node:crypto";
import {
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
  type Appointment,
  type AppointmentStatus,
  type BookAppointmentInput,
} from "./appointment.js";
import type { AppointmentRepository } from "./appointment-repository.js";

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ["checked_in", "cancelled", "no_show"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export class AppointmentService {
  constructor(private readonly appointments: AppointmentRepository) {}

  async book(input: BookAppointmentInput): Promise<Appointment> {
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      throw new InvalidAppointmentWindowError();
    }

    const appointment: Appointment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      customerEmail: input.customerEmail,
      serviceName: input.serviceName,
      startAt: input.startAt,
      endAt: input.endAt,
      status: "booked",
      createdAt: new Date(),
    };

    await this.appointments.save(appointment);
    return appointment;
  }

  async checkIn(tenantId: string, appointmentId: string): Promise<Appointment> {
    return this.transition(tenantId, appointmentId, "checked_in");
  }

  async complete(tenantId: string, appointmentId: string): Promise<Appointment> {
    return this.transition(tenantId, appointmentId, "completed");
  }

  async cancel(tenantId: string, appointmentId: string): Promise<Appointment> {
    return this.transition(tenantId, appointmentId, "cancelled");
  }

  async list(tenantId: string): Promise<Appointment[]> {
    return this.appointments.listByTenant(tenantId);
  }

  private async transition(
    tenantId: string,
    appointmentId: string,
    to: AppointmentStatus,
  ): Promise<Appointment> {
    const appointment = await this.appointments.findById(tenantId, appointmentId);
    if (!appointment) {
      throw new AppointmentNotFoundError(appointmentId);
    }

    if (!ALLOWED_TRANSITIONS[appointment.status].includes(to)) {
      throw new InvalidAppointmentTransitionError(appointment.status, to);
    }

    const updated: Appointment = { ...appointment, status: to };
    await this.appointments.save(updated);
    return updated;
  }
}
