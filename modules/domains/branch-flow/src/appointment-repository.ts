import type { Appointment } from "./appointment.js";

export interface AppointmentRepository {
  save(appointment: Appointment): Promise<void>;
  findById(tenantId: string, id: string): Promise<Appointment | undefined>;
  listByTenant(tenantId: string): Promise<Appointment[]>;
  listByBranchAndDateRange(tenantId: string, branchId: string, startAt: Date, endAt: Date): Promise<Appointment[]>;
  reschedule(tenantId: string, id: string, newStartAt: Date, newEndAt: Date): Promise<Appointment | undefined>;
  cancel(tenantId: string, id: string): Promise<Appointment | undefined>;
}
