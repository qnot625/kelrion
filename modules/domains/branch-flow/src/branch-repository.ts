import type { BranchRef, OperatingWindow, Holiday } from "./branch.js";
import type { DepartmentRef } from "./department.js";
import type { BranchCapacityAggregate } from "./capacity-router.js";

export interface BranchRepository {
  // Branch Metadata Operations
  createBranch(branch: Omit<BranchRef, "id">): Promise<BranchRef>;
  getBranchById(id: string, tenantId: string): Promise<BranchRef | null>;
  getBranchBySlug(slug: string, tenantId: string): Promise<BranchRef | null>;
  getBranches(tenantId: string): Promise<BranchRef[]>;
  updateBranch(id: string, tenantId: string, updates: Partial<Omit<BranchRef, "id" | "tenantId">>): Promise<BranchRef>;

  // Capacity & Discovery Aggregations
  getBranchCapacityAggregates(tenantId: string, serviceId?: string): Promise<BranchCapacityAggregate[]>;

  // Operating Window Operations
  setOperatingWindows(branchId: string, windows: OperatingWindow[]): Promise<void>;
  getOperatingWindows(branchId: string): Promise<OperatingWindow[]>;

  // Holiday Operations
  addHoliday(holiday: Omit<Holiday, "id">): Promise<Holiday>;
  getHolidays(tenantId: string, branchId?: string | null): Promise<Holiday[]>;
  removeHoliday(id: string, tenantId: string): Promise<void>;

  // Department Operations
  createDepartment(department: Omit<DepartmentRef, "id">): Promise<DepartmentRef>;
  getDepartmentById(id: string, tenantId: string): Promise<DepartmentRef | null>;
  getDepartmentsByBranch(branchId: string, tenantId: string): Promise<DepartmentRef[]>;
  updateDepartment(id: string, tenantId: string, updates: Partial<Omit<DepartmentRef, "id" | "tenantId" | "branchId">>): Promise<DepartmentRef>;
  deleteDepartment(id: string, tenantId: string): Promise<void>;
}

