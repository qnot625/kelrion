import { and, asc, eq, gt, lt } from "drizzle-orm";
import type {
  Appointment,
  AppointmentRepository,
  AppointmentStatus,
} from "@adminops/branch-flow";
import type { Database } from "./database.js";
import { appointments } from "./schema.js";

type AppointmentRow = typeof appointments.$inferSelect;

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    serviceId: row.serviceId,
    customerEmail: row.customerEmail,
    serviceName: row.serviceName,
    customerMetadata: row.customerMetadata,
    startAt: row.startAt,
    endAt: row.endAt,
    status: row.status as AppointmentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: Database) {}

  async save(appointment: Appointment): Promise<void> {
    await this.db.insert(appointments).values({
      id: appointment.id,
      tenantId: appointment.tenantId,
      branchId: appointment.branchId,
      serviceId: appointment.serviceId,
      customerEmail: appointment.customerEmail,
      serviceName: appointment.serviceName,
      customerMetadata: appointment.customerMetadata,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt ?? appointment.createdAt,
    }).onConflictDoUpdate({
      target: appointments.id,
      set: {
        branchId: appointment.branchId,
        serviceId: appointment.serviceId,
        customerEmail: appointment.customerEmail,
        serviceName: appointment.serviceName,
        customerMetadata: appointment.customerMetadata,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        updatedAt: appointment.updatedAt ?? new Date(),
      },
    });
  }

  async findById(tenantId: string, id: string): Promise<Appointment | undefined> {
    const [row] = await this.db.select().from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id))).limit(1);
    return row ? toAppointment(row) : undefined;
  }

  async listByTenant(tenantId: string): Promise<Appointment[]> {
    const rows = await this.db.select().from(appointments)
      .where(eq(appointments.tenantId, tenantId)).orderBy(asc(appointments.startAt));
    return rows.map(toAppointment);
  }

  async listByBranchAndDateRange(
    tenantId: string,
    branchId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<Appointment[]> {
    const rows = await this.db.select().from(appointments).where(and(
      eq(appointments.tenantId, tenantId),
      eq(appointments.branchId, branchId),
      lt(appointments.startAt, endAt),
      gt(appointments.endAt, startAt),
    )).orderBy(asc(appointments.startAt));
    return rows.map(toAppointment);
  }
}
