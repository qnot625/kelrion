import {
  type BranchRef,
  type OperatingWindow,
  type Holiday,
  DuplicateBranchSlugError,
  BranchNotFoundError,
  validateCoordinates,
  validateOperatingWindows,
  validateHolidayRange,
} from "./branch.js";
import {
  type DepartmentRef,
  DuplicateDepartmentSlugError,
  DepartmentNotFoundError,
  validateDepartmentCapacity,
} from "./department.js";
import type { BranchRepository } from "./branch-repository.js";
import type { BranchCapacityAggregate } from "./capacity-router.js";

export class InMemoryBranchRepository implements BranchRepository {
  private readonly branches = new Map<string, BranchRef>();
  private readonly operatingWindows = new Map<string, OperatingWindow[]>(); // key: branchId
  private readonly holidays = new Map<string, Holiday>();
  private readonly departments = new Map<string, DepartmentRef>();
  private readonly branchServices = new Map<string, { tenantId: string; branchId: string; serviceId: string; status: string }>();
  private readonly activeBookings = new Map<string, number>(); // key: `${tenantId}:${branchId}`

  public setBranchServiceMapping(tenantId: string, branchId: string, serviceId: string, status = "active"): void {
    const id = `${tenantId}:${branchId}:${serviceId}`;
    this.branchServices.set(id, { tenantId, branchId, serviceId, status });
  }

  public setActiveBookingsCount(tenantId: string, branchId: string, count: number): void {
    this.activeBookings.set(`${tenantId}:${branchId}`, count);
  }

  async getBranchCapacityAggregates(tenantId: string, serviceId?: string): Promise<BranchCapacityAggregate[]> {
    const activeBranches = [...this.branches.values()].filter(
      (b) => b.tenantId === tenantId && b.status === "active"
    );

    const aggregates: BranchCapacityAggregate[] = [];

    for (const branch of activeBranches) {
      const offeredServiceIds = [...this.branchServices.values()]
        .filter((bs) => bs.tenantId === tenantId && bs.branchId === branch.id && bs.status === "active")
        .map((bs) => bs.serviceId);

      if (serviceId && !offeredServiceIds.includes(serviceId)) {
        continue;
      }

      const branchDepts = [...this.departments.values()].filter(
        (d) => d.tenantId === tenantId && d.branchId === branch.id
      );
      const totalCapacity = branchDepts.reduce((sum, d) => sum + d.capacity, 0);
      const activeBookingsCount = this.activeBookings.get(`${tenantId}:${branch.id}`) ?? 0;

      aggregates.push({
        branchId: branch.id,
        tenantId: branch.tenantId,
        branchName: branch.name,
        status: branch.status,
        address: branch.address,
        latitude: branch.latitude,
        longitude: branch.longitude,
        totalCapacity,
        activeBookingsCount,
        offeredServiceIds,
      });
    }

    return aggregates;
  }

  async createBranch(branchInput: Omit<BranchRef, "id">): Promise<BranchRef> {
    validateCoordinates(branchInput.latitude, branchInput.longitude);

    // Enforce unique slug per tenant
    const slugExists = [...this.branches.values()].some(
      (b) => b.tenantId === branchInput.tenantId && b.slug === branchInput.slug
    );
    if (slugExists) {
      throw new DuplicateBranchSlugError(`Branch with slug '${branchInput.slug}' already exists for this tenant.`);
    }

    const id = `branch-${Math.random().toString(36).substring(2, 11)}`;
    const branch: BranchRef = {
      id,
      ...branchInput,
    };
    this.branches.set(id, branch);
    return branch;
  }

  async getBranchById(id: string, tenantId: string): Promise<BranchRef | null> {
    const branch = this.branches.get(id);
    if (branch && branch.tenantId === tenantId) {
      return branch;
    }
    return null;
  }

  async getBranchBySlug(slug: string, tenantId: string): Promise<BranchRef | null> {
    const branch = [...this.branches.values()].find(
      (b) => b.tenantId === tenantId && b.slug === slug
    );
    return branch || null;
  }

  async getBranches(tenantId: string): Promise<BranchRef[]> {
    return [...this.branches.values()].filter((b) => b.tenantId === tenantId);
  }

  async updateBranch(
    id: string,
    tenantId: string,
    updates: Partial<Omit<BranchRef, "id" | "tenantId">>
  ): Promise<BranchRef> {
    const branch = this.branches.get(id);
    if (!branch || branch.tenantId !== tenantId) {
      throw new BranchNotFoundError("Branch not found.");
    }

    const updatedLat = updates.latitude !== undefined ? updates.latitude : branch.latitude;
    const updatedLng = updates.longitude !== undefined ? updates.longitude : branch.longitude;
    validateCoordinates(updatedLat, updatedLng);

    if (updates.slug && updates.slug !== branch.slug) {
      const slugExists = [...this.branches.values()].some(
        (b) => b.tenantId === tenantId && b.slug === updates.slug && b.id !== id
      );
      if (slugExists) {
        throw new DuplicateBranchSlugError(`Branch with slug '${updates.slug}' already exists for this tenant.`);
      }
    }

    const updated: BranchRef = {
      ...branch,
      ...updates,
    };
    this.branches.set(id, updated);
    return updated;
  }

  async setOperatingWindows(branchId: string, windows: OperatingWindow[]): Promise<void> {
    validateOperatingWindows(windows);
    this.operatingWindows.set(branchId, [...windows]);
  }

  async getOperatingWindows(branchId: string): Promise<OperatingWindow[]> {
    return this.operatingWindows.get(branchId) || [];
  }

  async addHoliday(holidayInput: Omit<Holiday, "id">): Promise<Holiday> {
    validateHolidayRange(holidayInput.startAt, holidayInput.endAt);

    const id = `holiday-${Math.random().toString(36).substring(2, 11)}`;
    const holiday: Holiday = {
      id,
      ...holidayInput,
    };
    this.holidays.set(id, holiday);
    return holiday;
  }

  async getHolidays(tenantId: string, branchId?: string | null): Promise<Holiday[]> {
    return [...this.holidays.values()].filter((h) => {
      if (h.tenantId !== tenantId) return false;
      if (branchId === undefined) return true; // fetch all tenant holidays
      return h.branchId === null || h.branchId === branchId;
    });
  }

  async removeHoliday(id: string, tenantId: string): Promise<void> {
    const holiday = this.holidays.get(id);
    if (holiday && holiday.tenantId === tenantId) {
      this.holidays.delete(id);
    }
  }

  // Department Operations
  async createDepartment(deptInput: Omit<DepartmentRef, "id">): Promise<DepartmentRef> {
    validateDepartmentCapacity(deptInput.capacity);

    // Verify parent branch exists and belongs to tenant
    const branch = await this.getBranchById(deptInput.branchId, deptInput.tenantId);
    if (!branch) {
      throw new Error("Parent branch not found for this tenant.");
    }

    // Unique slug per branch & tenant
    const slugExists = [...this.departments.values()].some(
      (d) => d.tenantId === deptInput.tenantId && d.branchId === deptInput.branchId && d.slug === deptInput.slug
    );
    if (slugExists) {
      throw new DuplicateDepartmentSlugError(`Department with slug '${deptInput.slug}' already exists in this branch.`);
    }

    const id = `dept-${Math.random().toString(36).substring(2, 11)}`;
    const department: DepartmentRef = {
      id,
      ...deptInput,
    };
    this.departments.set(id, department);
    return department;
  }

  async getDepartmentById(id: string, tenantId: string): Promise<DepartmentRef | null> {
    const dept = this.departments.get(id);
    if (dept && dept.tenantId === tenantId) {
      return dept;
    }
    return null;
  }

  async getDepartmentsByBranch(branchId: string, tenantId: string): Promise<DepartmentRef[]> {
    return [...this.departments.values()].filter(
      (d) => d.tenantId === tenantId && d.branchId === branchId
    );
  }

  async updateDepartment(
    id: string,
    tenantId: string,
    updates: Partial<Omit<DepartmentRef, "id" | "tenantId" | "branchId">>
  ): Promise<DepartmentRef> {
    const dept = this.departments.get(id);
    if (!dept || dept.tenantId !== tenantId) {
      throw new DepartmentNotFoundError("Department not found.");
    }

    if (updates.capacity !== undefined) {
      validateDepartmentCapacity(updates.capacity);
    }

    if (updates.slug && updates.slug !== dept.slug) {
      const slugExists = [...this.departments.values()].some(
        (d) => d.tenantId === tenantId && d.branchId === dept.branchId && d.slug === updates.slug && d.id !== id
      );
      if (slugExists) {
        throw new DuplicateDepartmentSlugError(`Department with slug '${updates.slug}' already exists in this branch.`);
      }
    }

    const updated: DepartmentRef = {
      ...dept,
      ...updates,
    };
    this.departments.set(id, updated);
    return updated;
  }

  async deleteDepartment(id: string, tenantId: string): Promise<void> {
    const dept = this.departments.get(id);
    if (dept && dept.tenantId === tenantId) {
      this.departments.delete(id);
    }
  }
}

