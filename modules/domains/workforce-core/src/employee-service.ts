import { Employee, type CreateEmployeeInput, type UpdateEmployeePlacementInput, type UpdateEmployeeProfileInput } from "./employee.js";
import {
  EmployeeNotFoundError,
  WorkforceValidationError,
  type AuditRecorder,
  type EmployeeRepository,
} from "./contracts.js";
import type { EmployeeFilterOptions, EmployeeState, EmploymentStatus } from "./types.js";

export interface UpdateEmployeeInput extends UpdateEmployeeProfileInput, UpdateEmployeePlacementInput {
  readonly userId?: string | null;
}

export class EmployeeService {
  constructor(
    private readonly repository: EmployeeRepository,
    private readonly audit?: AuditRecorder,
  ) {}

  async create(tenantId: string, actorUserId: string | null, input: Omit<CreateEmployeeInput, "tenantId">): Promise<EmployeeState> {
    if (await this.repository.findByEmployeeNumber(tenantId, input.employeeNumber)) {
      throw new WorkforceValidationError(`Employee number "${input.employeeNumber}" already exists`);
    }
    if (await this.repository.findByEmail(tenantId, input.email)) {
      throw new WorkforceValidationError(`Employee email "${input.email}" already exists`);
    }
    if (input.userId && await this.repository.findByUserId(tenantId, input.userId)) {
      throw new WorkforceValidationError("That user is already linked to an employee record");
    }
    if (input.managerId) await this.validateManager(tenantId, null, input.managerId);

    const employee = Employee.create({ tenantId, ...input });
    await this.repository.save(employee);
    await this.record(tenantId, actorUserId, "employee.created", employee.id, {
      employeeNumber: employee.employeeNumber,
      userId: employee.userId,
      departmentId: employee.departmentId,
      branchId: employee.branchId,
    });
    return employee.toState();
  }

  async get(tenantId: string, id: string): Promise<EmployeeState> {
    const employee = await this.requireEmployee(tenantId, id);
    return employee.toState();
  }

  async getByUserId(tenantId: string, userId: string): Promise<EmployeeState | null> {
    return (await this.repository.findByUserId(tenantId, userId))?.toState() ?? null;
  }

  async list(tenantId: string, options?: EmployeeFilterOptions): Promise<{ data: EmployeeState[]; total: number; limit: number; offset: number }> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const offset = Math.max(options?.offset ?? 0, 0);
    const normalized = { ...options, limit, offset };
    const [employees, total] = await Promise.all([
      this.repository.list(tenantId, normalized),
      this.repository.count(tenantId, options),
    ]);
    return { data: employees.map((employee) => employee.toState()), total, limit, offset };
  }

  async update(
    tenantId: string,
    actorUserId: string | null,
    id: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeState> {
    const employee = await this.requireEmployee(tenantId, id);
    if (input.email && input.email.toLowerCase() !== employee.email.toLowerCase()) {
      const existing = await this.repository.findByEmail(tenantId, input.email);
      if (existing && existing.id !== id) throw new WorkforceValidationError(`Employee email "${input.email}" already exists`);
    }
    if (input.userId !== undefined && input.userId !== employee.userId && input.userId !== null) {
      const existing = await this.repository.findByUserId(tenantId, input.userId);
      if (existing && existing.id !== id) throw new WorkforceValidationError("That user is already linked to an employee record");
    }
    if (input.managerId !== undefined && input.managerId !== employee.managerId && input.managerId !== null) {
      await this.validateManager(tenantId, id, input.managerId);
    }

    employee.updateProfile(input);
    employee.setPlacement(input);
    if (input.userId !== undefined) employee.linkUser(input.userId);
    await this.repository.save(employee);
    await this.record(tenantId, actorUserId, "employee.updated", employee.id, { changes: { ...input } });
    return employee.toState();
  }

  async changeStatus(
    tenantId: string,
    actorUserId: string | null,
    id: string,
    status: EmploymentStatus,
    terminationDate?: string,
  ): Promise<EmployeeState> {
    const employee = await this.requireEmployee(tenantId, id);
    if (status === "terminated") employee.terminate(terminationDate ?? new Date().toISOString().slice(0, 10));
    else employee.setStatus(status);
    await this.repository.save(employee);
    await this.record(tenantId, actorUserId, "employee.status_changed", id, {
      employmentStatus: status,
      terminationDate: employee.terminationDate,
    });
    return employee.toState();
  }

  async remove(tenantId: string, actorUserId: string | null, id: string): Promise<void> {
    await this.requireEmployee(tenantId, id);
    const deleted = await this.repository.delete(tenantId, id);
    if (!deleted) throw new EmployeeNotFoundError(id);
    await this.record(tenantId, actorUserId, "employee.deleted", id);
  }

  private async requireEmployee(tenantId: string, id: string): Promise<Employee> {
    const employee = await this.repository.findById(tenantId, id);
    if (!employee) throw new EmployeeNotFoundError(id);
    return employee;
  }

  private async validateManager(tenantId: string, employeeId: string | null, proposedManagerId: string): Promise<void> {
    let cursor: string | null = proposedManagerId;
    const visited = new Set<string>();
    for (let depth = 0; cursor; depth += 1) {
      if (depth >= 100) throw new WorkforceValidationError("Manager hierarchy exceeds the maximum supported depth");
      if (employeeId && cursor === employeeId) throw new WorkforceValidationError("Manager assignment would create a reporting cycle");
      if (visited.has(cursor)) throw new WorkforceValidationError("Existing manager hierarchy already contains a reporting cycle");
      visited.add(cursor);
      const manager = await this.repository.findById(tenantId, cursor);
      if (!manager) throw new WorkforceValidationError(`Manager "${cursor}" was not found for this tenant`);
      if (manager.employmentStatus === "terminated") throw new WorkforceValidationError("A terminated employee cannot be assigned as manager");
      cursor = manager.managerId;
    }
  }

  private async record(
    tenantId: string,
    actorUserId: string | null,
    action: string,
    targetId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    if (!this.audit) return;
    await this.audit.record({ tenantId, actorUserId, action, targetType: "employee", targetId, metadata });
  }
}
