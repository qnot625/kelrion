import { Employee, EmployeeDomainError, type EmployeeState } from "./employee.js";
import {
  EmployeeNotFoundError,
  type EmployeeFilterOptions,
  type EmployeeRepository,
} from "./contracts.js";
import { validateManagerHierarchy, type ManagerHierarchyProvider } from "./hierarchy.js";
import type { EmploymentStatus, EmploymentType } from "./types.js";

export interface AuditLogRecorder {
  record(entry: {
    tenantId: string;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface CreateEmployeeServiceInput {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  employmentType: EmploymentType;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  branchId?: string | null;
  employmentStatus?: EmploymentStatus;
}

export interface UpdateEmployeeServiceInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  employmentType?: EmploymentType;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  branchId?: string | null;
}

export class EmployeeService {
  constructor(
    private repository: EmployeeRepository & Partial<ManagerHierarchyProvider>,
    private auditLog?: AuditLogRecorder,
  ) {}

  public async createEmployee(
    tenantId: string,
    actorUserId: string | null,
    input: CreateEmployeeServiceInput,
  ): Promise<EmployeeState> {
    const existingNum = await this.repository.findByEmployeeNumber(tenantId, input.employeeNumber);
    if (existingNum) {
      throw new EmployeeDomainError(`Employee number [${input.employeeNumber}] already exists for tenant`);
    }

    const existingEmail = await this.repository.findByEmail(tenantId, input.email);
    if (existingEmail) {
      throw new EmployeeDomainError(`Email [${input.email}] already exists for tenant`);
    }

    if (input.managerId && typeof this.repository.getManagerNode === "function") {
      await validateManagerHierarchy({
        tenantId,
        employeeId: "",
        proposedManagerId: input.managerId,
        provider: this.repository as ManagerHierarchyProvider,
      });
    }

    const employee = Employee.create({
      tenantId,
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      hireDate: input.hireDate,
      employmentType: input.employmentType,
      employmentStatus: input.employmentStatus,
      departmentId: input.departmentId,
      positionId: input.positionId,
      managerId: input.managerId,
      branchId: input.branchId,
    });

    await this.repository.save(employee);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId,
        actorUserId,
        action: "employee.created",
        targetType: "employee",
        targetId: employee.id,
        metadata: {
          employeeNumber: employee.employeeNumber,
          departmentId: employee.departmentId,
          positionId: employee.positionId,
        },
      });
    }

    return employee.toState();
  }

  public async getEmployeeById(tenantId: string, employeeId: string): Promise<EmployeeState> {
    const employee = await this.repository.findById(tenantId, employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId);
    }
    return employee.toState();
  }

  public async listEmployees(
    tenantId: string,
    options?: EmployeeFilterOptions,
  ): Promise<{ data: EmployeeState[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
    const offset = Math.max(options?.offset ?? 0, 0);

    const queryOptions: EmployeeFilterOptions = {
      ...options,
      limit,
      offset,
    };

    const employees = await this.repository.list(tenantId, queryOptions);
    const total = await this.repository.count(tenantId, options);

    return {
      data: employees.map((e) => e.toState()),
      total,
      limit,
      offset,
    };
  }

  public async updateEmployee(
    tenantId: string,
    actorUserId: string | null,
    employeeId: string,
    input: UpdateEmployeeServiceInput,
  ): Promise<EmployeeState> {
    const employee = await this.repository.findById(tenantId, employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId);
    }

    if (input.email && input.email.toLowerCase() !== employee.email.toLowerCase()) {
      const existing = await this.repository.findByEmail(tenantId, input.email);
      if (existing && existing.id !== employeeId) {
        throw new EmployeeDomainError(`Email [${input.email}] already exists for tenant`);
      }
    }

    if (input.managerId !== undefined && input.managerId !== employee.managerId) {
      if (input.managerId !== null && typeof this.repository.getManagerNode === "function") {
        await validateManagerHierarchy({
          tenantId,
          employeeId,
          proposedManagerId: input.managerId,
          provider: this.repository as ManagerHierarchyProvider,
        });
      }
      employee.assignManager(input.managerId);
    }

    if (input.departmentId !== undefined) {
      employee.assignDepartment(input.departmentId);
    }
    if (input.positionId !== undefined) {
      employee.assignPosition(input.positionId);
    }
    if (input.branchId !== undefined) {
      employee.transfer({ toBranchId: input.branchId, effectiveDate: new Date().toISOString().slice(0, 10) });
    }

    employee.updateProfile({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      employmentType: input.employmentType,
    });

    await this.repository.save(employee);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId,
        actorUserId,
        action: "employee.updated",
        targetType: "employee",
        targetId: employee.id,
        metadata: { changes: input },
      });
    }

    return employee.toState();
  }

  public async assignManager(
    tenantId: string,
    actorUserId: string | null,
    employeeId: string,
    proposedManagerId: string | null,
  ): Promise<EmployeeState> {
    const employee = await this.repository.findById(tenantId, employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId);
    }

    if (proposedManagerId !== null && typeof this.repository.getManagerNode === "function") {
      await validateManagerHierarchy({
        tenantId,
        employeeId,
        proposedManagerId,
        provider: this.repository as ManagerHierarchyProvider,
      });
    }

    employee.assignManager(proposedManagerId);
    await this.repository.save(employee);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId,
        actorUserId,
        action: "employee.manager_assigned",
        targetType: "employee",
        targetId: employee.id,
        metadata: { proposedManagerId },
      });
    }

    return employee.toState();
  }

  public async updateEmploymentStatus(
    tenantId: string,
    actorUserId: string | null,
    employeeId: string,
    action: "suspend" | "reactivate" | "terminate",
    reason?: string,
    terminationDate?: string,
  ): Promise<EmployeeState> {
    const employee = await this.repository.findById(tenantId, employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId);
    }

    if (action === "suspend") {
      employee.suspend(reason ?? "Suspended via admin API");
    } else if (action === "reactivate") {
      employee.activate(reason);
    } else if (action === "terminate") {
      const termDate = terminationDate ?? new Date().toISOString().slice(0, 10);
      employee.terminate({ terminationDate: termDate, reason });
    } else {
      throw new EmployeeDomainError(`Invalid status action: ${action}`);
    }

    await this.repository.save(employee);

    if (this.auditLog) {
      await this.auditLog.record({
        tenantId,
        actorUserId,
        action: "employee.status_changed",
        targetType: "employee",
        targetId: employee.id,
        metadata: { action, reason, employmentStatus: employee.employmentStatus },
      });
    }

    return employee.toState();
  }

  public async deleteEmployee(
    tenantId: string,
    actorUserId: string | null,
    employeeId: string,
  ): Promise<{ success: boolean }> {
    const employee = await this.repository.findById(tenantId, employeeId);
    if (!employee) {
      throw new EmployeeNotFoundError(employeeId);
    }

    const deleted = await this.repository.delete(tenantId, employeeId);

    if (deleted && this.auditLog) {
      await this.auditLog.record({
        tenantId,
        actorUserId,
        action: "employee.deleted",
        targetType: "employee",
        targetId: employeeId,
      });
    }

    return { success: deleted };
  }
}
