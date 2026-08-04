import { and, asc, eq, lt, gt } from "drizzle-orm";
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
    customerMetadata: row.customerMetadata as Record<string, unknown>,
    startAt: row.startAt,
    endAt: row.endAt,
    status: row.status as AppointmentStatus,
    createdAt: row.createdAt,
  };
}

export class PostgresAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: Database) {}

  async save(appointment: Appointment): Promise<void> {
    await this.db
      .insert(appointments)
      .values({
        id: appointment.id,
        tenantId: appointment.tenantId,
        branchId: appointment.branchId,
        serviceId: appointment.serviceId,
        customerEmail: appointment.customerEmail,
        customerMetadata: appointment.customerMetadata,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
        status: appointment.status,
        createdAt: appointment.createdAt,
      })
      .onConflictDoUpdate({
        target: appointments.id,
        set: { status: appointment.status },
      });
  }

  async findById(tenantId: string, id: string): Promise<Appointment | undefined> {
    const [row] = await this.db
      .select()
      .from(appointments)
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)))
      .limit(1);
    return row ? toAppointment(row) : undefined;
  }

  async listByTenant(tenantId: string): Promise<Appointment[]> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(eq(appointments.tenantId, tenantId))
      .orderBy(asc(appointments.startAt));
    return rows.map(toAppointment);
  }

  async listByBranchAndDateRange(
    tenantId: string,
    branchId: string,
    startAt: Date,
    endAt: Date
  ): Promise<Appointment[]> {
    const rows = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          eq(appointments.branchId, branchId),
          lt(appointments.startAt, endAt),
          gt(appointments.endAt, startAt)
        )
      )
      .orderBy(asc(appointments.startAt));
    return rows.map(toAppointment);
  }

  async reschedule(
    tenantId: string,
    id: string,
    newStartAt: Date,
    newEndAt: Date
  ): Promise<Appointment | undefined> {
    const [updatedRow] = await this.db
      .update(appointments)
      .set({
        startAt: newStartAt,
        endAt: newEndAt,
      })
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)))
      .returning();

    return updatedRow ? toAppointment(updatedRow) : undefined;
  }

  async cancel(
    tenantId: string,
    id: string
  ): Promise<Appointment | undefined> {
    const [updatedRow] = await this.db
      .update(appointments)
      .set({
        status: "cancelled",
      })
      .where(and(eq(appointments.tenantId, tenantId), eq(appointments.id, id)))
      .returning();

    return updatedRow ? toAppointment(updatedRow) : undefined;
  }
}
