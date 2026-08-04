import type { Appointment } from "./appointment.js";
import type { AppointmentRepository } from "./appointment-repository.js";

export class InMemoryAppointmentRepository implements AppointmentRepository {
  private readonly byId = new Map<string, Appointment>();

  async save(appointment: Appointment): Promise<void> {
    this.byId.set(appointment.id, appointment);
  }

  async findById(tenantId: string, id: string): Promise<Appointment | undefined> {
    const appointment = this.byId.get(id);
    return appointment && appointment.tenantId === tenantId ? appointment : undefined;
  }

  async listByTenant(tenantId: string): Promise<Appointment[]> {
    return [...this.byId.values()]
      .filter((appointment) => appointment.tenantId === tenantId)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  async listByBranchAndDateRange(tenantId: string, branchId: string, startAt: Date, endAt: Date): Promise<Appointment[]> {
    return [...this.byId.values()].filter((appointment) => 
      appointment.tenantId === tenantId && 
      appointment.branchId === branchId && 
      appointment.endAt.getTime() > startAt.getTime() && 
      appointment.startAt.getTime() < endAt.getTime()
    );
  }

  async reschedule(tenantId: string, id: string, newStartAt: Date, newEndAt: Date): Promise<Appointment | undefined> {
    const appointment = await this.findById(tenantId, id);
    if (!appointment) return undefined;
    const updated: Appointment = {
      ...appointment,
      startAt: newStartAt,
      endAt: newEndAt,
    };
    this.byId.set(id, updated);
    return updated;
  }

  async cancel(tenantId: string, id: string): Promise<Appointment | undefined> {
    const appointment = await this.findById(tenantId, id);
    if (!appointment) return undefined;
    const updated: Appointment = {
      ...appointment,
      status: "cancelled",
    };
    this.byId.set(id, updated);
    return updated;
  }
}
