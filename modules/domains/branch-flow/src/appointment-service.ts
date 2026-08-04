import { randomUUID } from "node:crypto";
import {
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
  type Appointment,
  type AppointmentStatus,
  type BookAppointmentInput,
  type RescheduleAppointmentInput,
} from "./appointment.js";
import type { AppointmentRepository } from "./appointment-repository.js";
import type { BranchRepository } from "./branch-repository.js";
import type { ServiceRepository } from "./service-catalog.js";
import { calculateAvailability, type AvailabilityQueryOptions } from "./availability-engine.js";
import type { WaitlistRepository } from "./waitlist-repository.js";
import type { WaitlistEntry, AddToWaitlistInput } from "./waitlist.js";

export class SlotNotAvailableError extends Error {
  constructor(message: string = "The requested timeslot is not available") {
    super(message);
    this.name = "SlotNotAvailableError";
  }
}

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ["checked_in", "cancelled", "no_show"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export class AppointmentService {
  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly branches: BranchRepository,
    private readonly services: ServiceRepository,
    private readonly waitlists?: WaitlistRepository
  ) {}

  async book(input: BookAppointmentInput): Promise<Appointment> {
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      throw new InvalidAppointmentWindowError();
    }

    const branch = await this.branches.getBranchById(input.branchId, input.tenantId);
    if (!branch) {
      throw new Error(`Branch ${input.branchId} not found`);
    }

    const service = await this.services.getServiceById(input.serviceId, input.tenantId);
    if (!service) {
      throw new Error(`Service ${input.serviceId} not found`);
    }

    const operatingWindows = await this.branches.getOperatingWindows(input.branchId);
    const holidays = await this.branches.getHolidays(input.tenantId, input.branchId);

    // Get maxCapacity from departments matching this service, or overall.
    // Wait, the schema allows tracking capacity per department.
    // For this scope, let's just aggregate capacity from all departments of the branch,
    // or just assume a default max capacity of 1 for now if we can't easily get department capacity
    // Wait, getBranchCapacityAggregates provides total capacity for a service! Let's use that.
    const capacityAggs = await this.branches.getBranchCapacityAggregates(input.tenantId, input.serviceId);
    const branchCapacity = capacityAggs.find(a => a.branchId === input.branchId);
    const maxCapacity = branchCapacity ? branchCapacity.totalCapacity : 1;

    // We only need to check overlapping bookings for the start-end range. We'll add some buffer.
    const searchStart = new Date(input.startAt);
    searchStart.setUTCHours(0, 0, 0, 0); // Start of day
    const searchEnd = new Date(searchStart.getTime() + 24 * 60 * 60 * 1000); // Next day
    const existingBookings = await this.appointments.listByBranchAndDateRange(input.tenantId, input.branchId, searchStart, searchEnd);

    // Filter out cancelled and no_show bookings from taking up capacity
    const activeBookings = existingBookings.filter(b => b.status === "booked" || b.status === "checked_in");

    const queryOptions: AvailabilityQueryOptions = {
      startDate: searchStart,
      endDate: searchEnd,
      serviceDurationMinutes: service.durationMinutes,
      operatingWindows,
      holidays,
      existingBookings: activeBookings,
      maxCapacity,
    };

    const availableSlots = calculateAvailability(queryOptions);

    const isSlotAvailable = availableSlots.some(slot => 
      slot.startAt.getTime() === input.startAt.getTime() && 
      slot.endAt.getTime() === input.endAt.getTime()
    );

    if (!isSlotAvailable) {
      throw new SlotNotAvailableError();
    }

    const appointment: Appointment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      customerEmail: input.customerEmail,
      customerMetadata: input.customerMetadata ?? {},
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
    const appointment = await this.transition(tenantId, appointmentId, "cancelled");
    await this.promoteNextInQueue(
      tenantId,
      appointment.branchId,
      appointment.serviceId,
      appointment.startAt,
      appointment.endAt
    );
    return appointment;
  }

  async noShow(tenantId: string, appointmentId: string): Promise<Appointment> {
    const appointment = await this.transition(tenantId, appointmentId, "no_show");
    await this.promoteNextInQueue(
      tenantId,
      appointment.branchId,
      appointment.serviceId,
      appointment.startAt,
      appointment.endAt
    );
    return appointment;
  }

  async reschedule(input: RescheduleAppointmentInput): Promise<Appointment> {
    if (input.endAt.getTime() <= input.startAt.getTime()) {
      throw new InvalidAppointmentWindowError();
    }

    const appointment = await this.appointments.findById(input.tenantId, input.appointmentId);
    if (!appointment) {
      throw new AppointmentNotFoundError(input.appointmentId);
    }

    if (appointment.status === "completed" || appointment.status === "cancelled" || appointment.status === "no_show") {
      throw new InvalidAppointmentTransitionError(appointment.status, "booked");
    }

    const service = await this.services.getServiceById(appointment.serviceId, input.tenantId);
    if (!service) {
      throw new Error(`Service ${appointment.serviceId} not found`);
    }

    const operatingWindows = await this.branches.getOperatingWindows(appointment.branchId);
    const holidays = await this.branches.getHolidays(input.tenantId, appointment.branchId);

    const capacityAggs = await this.branches.getBranchCapacityAggregates(input.tenantId, appointment.serviceId);
    const branchCapacity = capacityAggs.find(a => a.branchId === appointment.branchId);
    const maxCapacity = branchCapacity ? branchCapacity.totalCapacity : 1;

    const searchStart = new Date(input.startAt);
    searchStart.setUTCHours(0, 0, 0, 0);
    const searchEnd = new Date(searchStart.getTime() + 24 * 60 * 60 * 1000);
    const existingBookings = await this.appointments.listByBranchAndDateRange(input.tenantId, appointment.branchId, searchStart, searchEnd);

    const activeBookings = existingBookings.filter(b => 
      b.id !== appointment.id && (b.status === "booked" || b.status === "checked_in")
    );

    const queryOptions: AvailabilityQueryOptions = {
      startDate: searchStart,
      endDate: searchEnd,
      serviceDurationMinutes: service.durationMinutes,
      operatingWindows,
      holidays,
      existingBookings: activeBookings,
      maxCapacity,
    };

    const availableSlots = calculateAvailability(queryOptions);

    const isSlotAvailable = availableSlots.some(slot => 
      slot.startAt.getTime() === input.startAt.getTime() && 
      slot.endAt.getTime() === input.endAt.getTime()
    );

    if (!isSlotAvailable) {
      throw new SlotNotAvailableError();
    }

    const oldStart = appointment.startAt;
    const oldEnd = appointment.endAt;

    const updated: Appointment = {
      ...appointment,
      startAt: input.startAt,
      endAt: input.endAt,
    };

    await this.appointments.save(updated);

    // Promote waitlisted customer for the freed timeslot
    await this.promoteNextInQueue(
      input.tenantId,
      appointment.branchId,
      appointment.serviceId,
      oldStart,
      oldEnd
    );

    return updated;
  }

  async list(tenantId: string): Promise<Appointment[]> {
    return this.appointments.listByTenant(tenantId);
  }

  async addToWaitlist(input: AddToWaitlistInput): Promise<WaitlistEntry> {
    if (!this.waitlists) {
      throw new Error("Waitlist repository is not configured");
    }

    const branch = await this.branches.getBranchById(input.branchId, input.tenantId);
    if (!branch) {
      throw new Error(`Branch ${input.branchId} not found`);
    }

    const service = await this.services.getServiceById(input.serviceId, input.tenantId);
    if (!service) {
      throw new Error(`Service ${input.serviceId} not found`);
    }

    const queuePosition = await this.waitlists.getNextPosition(input.tenantId, input.branchId, input.serviceId);
    const entry: WaitlistEntry = {
      id: randomUUID(),
      tenantId: input.tenantId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      customerEmail: input.customerEmail,
      customerMetadata: input.customerMetadata ?? {},
      queuePosition,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.waitlists.save(entry);
    return entry;
  }

  async removeFromWaitlist(tenantId: string, id: string): Promise<void> {
    if (!this.waitlists) {
      throw new Error("Waitlist repository is not configured");
    }

    const entry = await this.waitlists.findById(tenantId, id);
    if (!entry) {
      throw new Error(`Waitlist entry ${id} not found`);
    }

    await this.waitlists.delete(tenantId, id);
  }

  async listWaitlist(tenantId: string): Promise<WaitlistEntry[]> {
    if (!this.waitlists) {
      throw new Error("Waitlist repository is not configured");
    }
    return this.waitlists.listByTenant(tenantId);
  }

  async getWaitlistEntry(tenantId: string, id: string): Promise<WaitlistEntry | undefined> {
    if (!this.waitlists) {
      throw new Error("Waitlist repository is not configured");
    }
    return this.waitlists.findById(tenantId, id);
  }

  async promoteNextInQueue(
    tenantId: string,
    branchId: string,
    serviceId: string,
    startAt: Date,
    endAt: Date
  ): Promise<Appointment | undefined> {
    if (!this.waitlists) {
      return undefined;
    }

    const nextEntry = await this.waitlists.getNextInQueue(tenantId, branchId, serviceId);
    if (!nextEntry) {
      return undefined;
    }

    const appointment: Appointment = {
      id: randomUUID(),
      tenantId: tenantId,
      branchId: branchId,
      serviceId: serviceId,
      customerEmail: nextEntry.customerEmail,
      customerMetadata: nextEntry.customerMetadata,
      startAt: startAt,
      endAt: endAt,
      status: "booked",
      createdAt: new Date(),
    };

    await this.appointments.save(appointment);
    await this.waitlists.delete(tenantId, nextEntry.id);

    return appointment;
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
