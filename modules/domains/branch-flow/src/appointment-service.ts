import { randomUUID } from "node:crypto";
import {
  AppointmentConfigurationError,
  AppointmentNotFoundError,
  InvalidAppointmentTransitionError,
  InvalidAppointmentWindowError,
  SlotNotAvailableError,
  type Appointment,
  type AppointmentStatus,
  type BookAppointmentInput,
  type RescheduleAppointmentInput,
} from "./appointment.js";
import type { AppointmentRepository } from "./appointment-repository.js";
import { calculateAvailability, type TimeSlot } from "./availability-engine.js";
import type { BranchRepository } from "./branch-repository.js";
import type { ServiceRepository } from "./service-catalog.js";
import type { AddToWaitlistInput, WaitlistEntry } from "./waitlist.js";
import { WaitlistEntryNotFoundError } from "./waitlist.js";
import type { WaitlistRepository } from "./waitlist-repository.js";

const ACTIVE_STATUSES: readonly AppointmentStatus[] = ["booked", "checked_in"];
const ALLOWED_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  booked: ["checked_in", "cancelled", "no_show"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export interface AppointmentAvailabilityQuery {
  readonly tenantId: string;
  readonly branchId: string;
  readonly serviceId: string;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly slotIntervalMinutes?: number;
  readonly excludeAppointmentId?: string;
}

export class AppointmentService {
  private readonly locks = new Map<string, Promise<void>>();

  constructor(
    private readonly appointments: AppointmentRepository,
    private readonly branches?: BranchRepository,
    private readonly services?: ServiceRepository,
    private readonly waitlists?: WaitlistRepository,
  ) {}

  async availability(query: AppointmentAvailabilityQuery): Promise<TimeSlot[]> {
    this.requireSchedulingDependencies();
    if (query.endAt.getTime() <= query.startAt.getTime()) throw new InvalidAppointmentWindowError();

    const branch = await this.branches!.getBranchById(query.branchId, query.tenantId);
    if (!branch || branch.status !== "active") {
      throw new AppointmentConfigurationError("The selected branch is not available");
    }
    const service = await this.services!.getServiceById(query.serviceId, query.tenantId);
    if (!service || service.status !== "active") {
      throw new AppointmentConfigurationError("The selected service is not available");
    }
    const offered = await this.services!.getBranchServices(query.branchId, query.tenantId);
    if (!offered.some((candidate) => candidate.id === service.id && candidate.status === "active")) {
      throw new AppointmentConfigurationError("The selected service is not offered at this branch");
    }

    const operatingWindows = await this.branches!.getOperatingWindows(query.branchId);
    if (!operatingWindows.length) {
      throw new AppointmentConfigurationError("The selected branch has no operating calendar");
    }
    const holidays = await this.branches!.getHolidays(query.tenantId, query.branchId);
    const existing = await this.appointments.listByBranchAndDateRange(
      query.tenantId,
      query.branchId,
      query.startAt,
      query.endAt,
    );
    const active = existing.filter((appointment) =>
      ACTIVE_STATUSES.includes(appointment.status) && appointment.id !== query.excludeAppointmentId);
    const aggregates = await this.branches!.getBranchCapacityAggregates(query.tenantId);
    const capacity = aggregates.find((item) => item.branchId === query.branchId)?.totalCapacity ?? 0;
    if (capacity < 1) {
      throw new AppointmentConfigurationError("The selected branch has no configured service capacity");
    }

    return calculateAvailability({
      startDate: query.startAt,
      endDate: query.endAt,
      serviceDurationMinutes: service.durationMinutes,
      slotIntervalMinutes: query.slotIntervalMinutes,
      operatingWindows,
      holidays,
      existingBookings: active,
      maxCapacity: capacity,
    });
  }

  async book(input: BookAppointmentInput): Promise<Appointment> {
    this.validateWindow(input.startAt, input.endAt);
    if (!input.branchId || !input.serviceId) return this.bookLegacy(input);

    return this.withLock(`${input.tenantId}:${input.branchId}`, async () => {
      const slots = await this.availability({
        tenantId: input.tenantId,
        branchId: input.branchId!,
        serviceId: input.serviceId!,
        startAt: startOfUtcDay(input.startAt),
        endAt: endOfUtcDay(input.startAt),
      });
      const selected = slots.some((slot) =>
        slot.startAt.getTime() === input.startAt.getTime() && slot.endAt.getTime() === input.endAt.getTime());
      if (!selected) throw new SlotNotAvailableError();

      const service = await this.services!.getServiceById(input.serviceId!, input.tenantId);
      if (!service) throw new AppointmentConfigurationError("The selected service is not available");
      const appointment = this.newAppointment({ ...input, serviceName: service.name });
      await this.appointments.save(appointment);
      return appointment;
    });
  }

  async reschedule(input: RescheduleAppointmentInput): Promise<Appointment> {
    this.validateWindow(input.startAt, input.endAt);
    const appointment = await this.requireAppointment(input.tenantId, input.appointmentId);
    if (appointment.status !== "booked") {
      throw new InvalidAppointmentTransitionError(appointment.status, "booked");
    }
    if (!appointment.branchId || !appointment.serviceId) {
      const updated = { ...appointment, startAt: input.startAt, endAt: input.endAt, updatedAt: new Date() };
      await this.appointments.save(updated);
      return updated;
    }

    return this.withLock(`${input.tenantId}:${appointment.branchId}`, async () => {
      const slots = await this.availability({
        tenantId: input.tenantId,
        branchId: appointment.branchId!,
        serviceId: appointment.serviceId!,
        startAt: startOfUtcDay(input.startAt),
        endAt: endOfUtcDay(input.startAt),
        excludeAppointmentId: appointment.id,
      });
      if (!slots.some((slot) =>
        slot.startAt.getTime() === input.startAt.getTime() && slot.endAt.getTime() === input.endAt.getTime())) {
        throw new SlotNotAvailableError();
      }
      const oldStartAt = appointment.startAt;
      const oldEndAt = appointment.endAt;
      const updated: Appointment = {
        ...appointment,
        startAt: input.startAt,
        endAt: input.endAt,
        updatedAt: new Date(),
      };
      await this.appointments.save(updated);
      await this.promoteNextInQueue(input.tenantId, appointment.branchId!, appointment.serviceId!, oldStartAt, oldEndAt);
      return updated;
    });
  }

  async checkIn(tenantId: string, appointmentId: string): Promise<Appointment> {
    return this.transition(tenantId, appointmentId, "checked_in");
  }

  async complete(tenantId: string, appointmentId: string): Promise<Appointment> {
    return this.transition(tenantId, appointmentId, "completed");
  }

  async cancel(tenantId: string, appointmentId: string): Promise<Appointment> {
    return this.releaseSlot(tenantId, appointmentId, "cancelled");
  }

  async noShow(tenantId: string, appointmentId: string): Promise<Appointment> {
    return this.releaseSlot(tenantId, appointmentId, "no_show");
  }

  async list(tenantId: string): Promise<Appointment[]> {
    return this.appointments.listByTenant(tenantId);
  }

  async addToWaitlist(input: AddToWaitlistInput): Promise<WaitlistEntry> {
    this.requireSchedulingDependencies(true);
    return this.withLock(`${input.tenantId}:${input.branchId}`, async () => {
      if (input.desiredStartAt || input.desiredEndAt) {
        if (!input.desiredStartAt || !input.desiredEndAt) throw new InvalidAppointmentWindowError();
        this.validateWindow(input.desiredStartAt, input.desiredEndAt);
      }
      const branch = await this.branches!.getBranchById(input.branchId, input.tenantId);
      if (!branch || branch.status !== "active") throw new AppointmentConfigurationError("The selected branch is not available");
      const services = await this.services!.getBranchServices(input.branchId, input.tenantId);
      if (!services.some((service) => service.id === input.serviceId && service.status === "active")) {
        throw new AppointmentConfigurationError("The selected service is not offered at this branch");
      }
      const now = new Date();
      const entry: WaitlistEntry = {
        id: randomUUID(),
        tenantId: input.tenantId,
        branchId: input.branchId,
        serviceId: input.serviceId,
        customerEmail: input.customerEmail,
        customerMetadata: input.customerMetadata ?? {},
        desiredStartAt: input.desiredStartAt ?? null,
        desiredEndAt: input.desiredEndAt ?? null,
        queuePosition: await this.waitlists!.getNextPosition(input.tenantId, input.branchId, input.serviceId),
        status: "waiting",
        promotedAppointmentId: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.waitlists!.save(entry);
      return entry;
    });
  }

  async listWaitlist(tenantId: string): Promise<WaitlistEntry[]> {
    this.requireWaitlist();
    return this.waitlists!.listByTenant(tenantId);
  }

  async getWaitlistEntry(tenantId: string, id: string): Promise<WaitlistEntry | undefined> {
    this.requireWaitlist();
    return this.waitlists!.findById(tenantId, id);
  }

  async removeFromWaitlist(tenantId: string, id: string): Promise<WaitlistEntry> {
    this.requireWaitlist();
    const entry = await this.waitlists!.findById(tenantId, id);
    if (!entry) throw new WaitlistEntryNotFoundError(id);
    if (entry.status !== "waiting") return entry;
    const updated = { ...entry, status: "removed" as const, updatedAt: new Date() };
    await this.waitlists!.save(updated);
    return updated;
  }

  private async releaseSlot(
    tenantId: string,
    appointmentId: string,
    status: "cancelled" | "no_show",
  ): Promise<Appointment> {
    const current = await this.requireAppointment(tenantId, appointmentId);
    if (!current.branchId || !current.serviceId) return this.transition(tenantId, appointmentId, status);
    return this.withLock(`${tenantId}:${current.branchId}`, async () => {
      const appointment = await this.transition(tenantId, appointmentId, status);
      await this.promoteNextInQueue(
        tenantId,
        appointment.branchId!,
        appointment.serviceId!,
        appointment.startAt,
        appointment.endAt,
      );
      return appointment;
    });
  }

  private async promoteNextInQueue(
    tenantId: string,
    branchId: string,
    serviceId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<Appointment | undefined> {
    if (!this.waitlists) return undefined;
    const queue = await this.waitlists.listQueue(tenantId, branchId, serviceId);
    const next = queue.find((entry) =>
      !entry.desiredStartAt || !entry.desiredEndAt ||
      (entry.desiredStartAt.getTime() === startAt.getTime() && entry.desiredEndAt.getTime() === endAt.getTime()));
    if (!next) return undefined;
    const service = await this.services?.getServiceById(serviceId, tenantId);
    if (!service) return undefined;
    const appointment = this.newAppointment({
      tenantId,
      branchId,
      serviceId,
      customerEmail: next.customerEmail,
      customerMetadata: next.customerMetadata,
      serviceName: service.name,
      startAt,
      endAt,
    });
    await this.appointments.save(appointment);
    await this.waitlists.save({
      ...next,
      status: "promoted",
      promotedAppointmentId: appointment.id,
      updatedAt: new Date(),
    });
    return appointment;
  }

  private async bookLegacy(input: BookAppointmentInput): Promise<Appointment> {
    if (!input.serviceName?.trim()) {
      throw new AppointmentConfigurationError("serviceName is required when branchId and serviceId are not supplied");
    }
    const appointment = this.newAppointment({ ...input, branchId: null, serviceId: null, serviceName: input.serviceName });
    await this.appointments.save(appointment);
    return appointment;
  }

  private newAppointment(input: BookAppointmentInput & { serviceName: string }): Appointment {
    const now = new Date();
    return {
      id: randomUUID(),
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      serviceId: input.serviceId ?? null,
      customerEmail: input.customerEmail,
      serviceName: input.serviceName,
      customerMetadata: input.customerMetadata ?? {},
      startAt: input.startAt,
      endAt: input.endAt,
      status: "booked",
      createdAt: now,
      updatedAt: now,
    };
  }

  private async requireAppointment(tenantId: string, id: string): Promise<Appointment> {
    const appointment = await this.appointments.findById(tenantId, id);
    if (!appointment) throw new AppointmentNotFoundError(id);
    return appointment;
  }

  private async transition(tenantId: string, appointmentId: string, to: AppointmentStatus): Promise<Appointment> {
    const appointment = await this.requireAppointment(tenantId, appointmentId);
    if (!ALLOWED_TRANSITIONS[appointment.status].includes(to)) {
      throw new InvalidAppointmentTransitionError(appointment.status, to);
    }
    const updated: Appointment = { ...appointment, status: to, updatedAt: new Date() };
    await this.appointments.save(updated);
    return updated;
  }

  private validateWindow(startAt: Date, endAt: Date): void {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt.getTime() <= startAt.getTime()) {
      throw new InvalidAppointmentWindowError();
    }
  }

  private requireSchedulingDependencies(includeWaitlist = false): void {
    if (!this.branches || !this.services || (includeWaitlist && !this.waitlists)) {
      throw new AppointmentConfigurationError("Advanced scheduling is not configured");
    }
  }

  private requireWaitlist(): void {
    if (!this.waitlists) throw new AppointmentConfigurationError("Waitlist support is not configured");
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }
}

function startOfUtcDay(value: Date): Date {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

function endOfUtcDay(value: Date): Date {
  return new Date(startOfUtcDay(value).getTime() + 24 * 60 * 60 * 1000);
}
