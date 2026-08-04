import { and, asc, eq, isNull, or, type SQL } from "drizzle-orm";
import {
  type BranchRef,
  type OperatingWindow,
  type Holiday,
  type DepartmentRef,
  type BranchRepository,
  type BranchCapacityAggregate,
  DuplicateBranchSlugError,
  DuplicateDepartmentSlugError,
  DepartmentNotFoundError,
  validateCoordinates,
  validateOperatingWindows,
  validateHolidayRange,
  validateDepartmentCapacity,
} from "@adminops/branch-flow";
import type { Database } from "./database.js";
import { branches, branchOperatingWindows, branchHolidays, departments, branchServices, appointments } from "./schema.js";
import { isUniqueViolation } from "./pg-errors.js";

type BranchRow = typeof branches.$inferSelect;
type OperatingWindowRow = typeof branchOperatingWindows.$inferSelect;
type HolidayRow = typeof branchHolidays.$inferSelect;
type DepartmentRow = typeof departments.$inferSelect;

function toDepartmentRef(row: DepartmentRow): DepartmentRef {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    name: row.name,
    slug: row.slug,
    capacity: row.capacity,
  };
}


function toBranchRef(row: BranchRow): BranchRef {
  return {
    id: row.id,
    tenantId: row.tenantId,
    slug: row.slug,
    name: row.name,
    status: row.status as "active" | "inactive",
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function toOperatingWindow(row: OperatingWindowRow): OperatingWindow {
  return {
    dayOfWeek: row.dayOfWeek,
    openMinutes: row.openMinutes,
    closeMinutes: row.closeMinutes,
  };
}

function toHoliday(row: HolidayRow): Holiday {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    name: row.name,
    startAt: row.startAt,
    endAt: row.endAt,
  };
}

export class PostgresBranchRepository implements BranchRepository {
  constructor(private readonly db: Database) {}

  async createBranch(branch: Omit<BranchRef, "id">): Promise<BranchRef> {
    validateCoordinates(branch.latitude, branch.longitude);
    try {
      const [row] = await this.db
        .insert(branches)
        .values({
          tenantId: branch.tenantId,
          slug: branch.slug,
          name: branch.name,
          status: branch.status,
          address: branch.address,
          latitude: branch.latitude,
          longitude: branch.longitude,
        })
        .returning();
      if (!row) {
        throw new Error("Failed to create branch: no row returned");
      }
      return toBranchRef(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateBranchSlugError(`Branch with slug '${branch.slug}' already exists for this tenant.`);
      }
      throw error;
    }
  }

  async getBranchById(id: string, tenantId: string): Promise<BranchRef | null> {
    const [row] = await this.db
      .select()
      .from(branches)
      .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
      .limit(1);
    return row ? toBranchRef(row) : null;
  }

  async getBranchBySlug(slug: string, tenantId: string): Promise<BranchRef | null> {
    const [row] = await this.db
      .select()
      .from(branches)
      .where(and(eq(branches.slug, slug), eq(branches.tenantId, tenantId)))
      .limit(1);
    return row ? toBranchRef(row) : null;
  }

  async getBranches(tenantId: string): Promise<BranchRef[]> {
    const rows = await this.db
      .select()
      .from(branches)
      .where(eq(branches.tenantId, tenantId))
      .orderBy(asc(branches.name));
    return rows.map(toBranchRef);
  }

  async getBranchCapacityAggregates(tenantId: string, serviceId?: string): Promise<BranchCapacityAggregate[]> {
    const branchRows = await this.db
      .select()
      .from(branches)
      .where(and(eq(branches.tenantId, tenantId), eq(branches.status, "active")))
      .orderBy(asc(branches.name));

    if (branchRows.length === 0) {
      return [];
    }

    const deptRows = await this.db
      .select({
        branchId: departments.branchId,
        capacity: departments.capacity,
      })
      .from(departments)
      .where(eq(departments.tenantId, tenantId));

    const capacityMap = new Map<string, number>();
    for (const d of deptRows) {
      capacityMap.set(d.branchId, (capacityMap.get(d.branchId) ?? 0) + d.capacity);
    }

    const bsConditions = [eq(branchServices.tenantId, tenantId), eq(branchServices.status, "active")];
    if (serviceId) {
      bsConditions.push(eq(branchServices.serviceId, serviceId));
    }
    const bsRows = await this.db
      .select({
        branchId: branchServices.branchId,
        serviceId: branchServices.serviceId,
      })
      .from(branchServices)
      .where(and(...bsConditions));

    const serviceMap = new Map<string, string[]>();
    for (const bs of bsRows) {
      const existing = serviceMap.get(bs.branchId) ?? [];
      existing.push(bs.serviceId);
      serviceMap.set(bs.branchId, existing);
    }

    const apptRows = await this.db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.tenantId, tenantId),
          or(eq(appointments.status, "booked"), eq(appointments.status, "checked_in"))
        )
      );
    const activeBookingsCount = apptRows.length;

    const aggregates: BranchCapacityAggregate[] = [];
    for (const row of branchRows) {
      const offeredServiceIds = serviceMap.get(row.id) ?? [];
      if (serviceId && !offeredServiceIds.includes(serviceId)) {
        continue;
      }

      aggregates.push({
        branchId: row.id,
        tenantId: row.tenantId,
        branchName: row.name,
        status: row.status as "active" | "inactive",
        address: row.address,
        latitude: row.latitude,
        longitude: row.longitude,
        totalCapacity: capacityMap.get(row.id) ?? 0,
        activeBookingsCount,
        offeredServiceIds,
      });
    }

    return aggregates;
  }

  async updateBranch(
    id: string,
    tenantId: string,
    updates: Partial<Omit<BranchRef, "id" | "tenantId">>
  ): Promise<BranchRef> {
    const original = await this.getBranchById(id, tenantId);
    if (!original) {
      throw new Error("Branch not found");
    }

    const finalLat = updates.latitude !== undefined ? updates.latitude : original.latitude;
    const finalLng = updates.longitude !== undefined ? updates.longitude : original.longitude;
    validateCoordinates(finalLat, finalLng);

    try {
      const [row] = await this.db
        .update(branches)
        .set({
          slug: updates.slug,
          name: updates.name,
          status: updates.status,
          address: updates.address,
          latitude: updates.latitude,
          longitude: updates.longitude,
        })
        .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new Error("Branch not found");
      }
      return toBranchRef(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateBranchSlugError(`Branch with slug '${updates.slug}' already exists for this tenant.`);
      }
      throw error;
    }
  }

  async setOperatingWindows(branchId: string, windows: OperatingWindow[]): Promise<void> {
    validateOperatingWindows(windows);
    await this.db.transaction(async (tx) => {
      await tx
        .delete(branchOperatingWindows)
        .where(eq(branchOperatingWindows.branchId, branchId));
      if (windows.length > 0) {
        await tx.insert(branchOperatingWindows).values(
          windows.map((w) => ({
            branchId,
            dayOfWeek: w.dayOfWeek,
            openMinutes: w.openMinutes,
            closeMinutes: w.closeMinutes,
          }))
        );
      }
    });
  }

  async getOperatingWindows(branchId: string): Promise<OperatingWindow[]> {
    const rows = await this.db
      .select()
      .from(branchOperatingWindows)
      .where(eq(branchOperatingWindows.branchId, branchId))
      .orderBy(asc(branchOperatingWindows.dayOfWeek), asc(branchOperatingWindows.openMinutes));
    return rows.map(toOperatingWindow);
  }

  async addHoliday(holiday: Omit<Holiday, "id">): Promise<Holiday> {
    validateHolidayRange(holiday.startAt, holiday.endAt);
    const [row] = await this.db
      .insert(branchHolidays)
      .values({
        tenantId: holiday.tenantId,
        branchId: holiday.branchId,
        name: holiday.name,
        startAt: holiday.startAt,
        endAt: holiday.endAt,
      })
      .returning();
    if (!row) {
      throw new Error("Failed to create holiday: no row returned");
    }
    return toHoliday(row);
  }

  async getHolidays(tenantId: string, branchId?: string | null): Promise<Holiday[]> {
    const conditions: (SQL | undefined)[] = [eq(branchHolidays.tenantId, tenantId)];
    if (branchId !== undefined) {
      if (branchId === null) {
        conditions.push(isNull(branchHolidays.branchId));
      } else {
        const branchCondition = or(isNull(branchHolidays.branchId), eq(branchHolidays.branchId, branchId));
        if (branchCondition) {
          conditions.push(branchCondition);
        }
      }
    }
    const rows = await this.db
      .select()
      .from(branchHolidays)
      .where(and(...conditions))
      .orderBy(asc(branchHolidays.startAt));
    return rows.map(toHoliday);
  }

  async removeHoliday(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(branchHolidays)
      .where(and(eq(branchHolidays.id, id), eq(branchHolidays.tenantId, tenantId)));
  }

  // Department Operations
  async createDepartment(department: Omit<DepartmentRef, "id">): Promise<DepartmentRef> {
    validateDepartmentCapacity(department.capacity);
    try {
      const [row] = await this.db
        .insert(departments)
        .values({
          tenantId: department.tenantId,
          branchId: department.branchId,
          name: department.name,
          slug: department.slug,
          capacity: department.capacity,
        })
        .returning();
      if (!row) {
        throw new Error("Failed to create department: no row returned");
      }
      return toDepartmentRef(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateDepartmentSlugError(
          `Department with slug '${department.slug}' already exists in this branch.`
        );
      }
      throw error;
    }
  }

  async getDepartmentById(id: string, tenantId: string): Promise<DepartmentRef | null> {
    const [row] = await this.db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)))
      .limit(1);
    return row ? toDepartmentRef(row) : null;
  }

  async getDepartmentsByBranch(branchId: string, tenantId: string): Promise<DepartmentRef[]> {
    const rows = await this.db
      .select()
      .from(departments)
      .where(and(eq(departments.branchId, branchId), eq(departments.tenantId, tenantId)))
      .orderBy(asc(departments.name));
    return rows.map(toDepartmentRef);
  }

  async updateDepartment(
    id: string,
    tenantId: string,
    updates: Partial<Omit<DepartmentRef, "id" | "tenantId" | "branchId">>
  ): Promise<DepartmentRef> {
    const original = await this.getDepartmentById(id, tenantId);
    if (!original) {
      throw new DepartmentNotFoundError("Department not found.");
    }

    const finalCapacity = updates.capacity !== undefined ? updates.capacity : original.capacity;
    validateDepartmentCapacity(finalCapacity);

    try {
      const [row] = await this.db
        .update(departments)
        .set({
          name: updates.name,
          slug: updates.slug,
          capacity: updates.capacity,
        })
        .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)))
        .returning();
      if (!row) {
        throw new DepartmentNotFoundError("Department not found.");
      }
      return toDepartmentRef(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateDepartmentSlugError(
          `Department with slug '${updates.slug}' already exists in this branch.`
        );
      }
      throw error;
    }
  }

  async deleteDepartment(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(departments)
      .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)));
  }
}

