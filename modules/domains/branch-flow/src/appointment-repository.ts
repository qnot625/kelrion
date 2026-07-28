import type { Appointment } from "./appointment.js";

export interface AppointmentRepository {
  save(appointment: Appointment): Promise<void>;
  findById(tenantId: string, id: string): Promise<Appointment | undefined>;
  listByTenant(tenantId: string): Promise<Appointment[]>;
}
