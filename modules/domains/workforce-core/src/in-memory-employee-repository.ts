import type { Employee } from "./employee.js";
import type { EmployeeFilterOptions, EmployeeRepository } from "./contracts.js";
import type { ManagerHierarchyProvider, ManagerNode } from "./hierarchy.js";

export class InMemoryEmployeeRepository implements EmployeeRepository, ManagerHierarchyProvider {
  private employees = new Map<string, Employee>();

  public async save(employee: Employee): Promise<void> {
    this.employees.set(employee.id, employee);
  }

  public async findById(tenantId: string, id: string): Promise<Employee | null> {
    const employee = this.employees.get(id);
    if (!employee || employee.tenantId !== tenantId) {
      return null;
    }
    return employee;
  }

  public async findByEmployeeNumber(tenantId: string, employeeNumber: string): Promise<Employee | null> {
    for (const employee of this.employees.values()) {
      if (
        employee.tenantId === tenantId &&
        employee.employeeNumber.toLowerCase() === employeeNumber.toLowerCase()
      ) {
        return employee;
      }
    }
    return null;
  }

  public async findByEmail(tenantId: string, email: string): Promise<Employee | null> {
    for (const employee of this.employees.values()) {
      if (
        employee.tenantId === tenantId &&
        employee.email.toLowerCase() === email.toLowerCase()
      ) {
        return employee;
      }
    }
    return null;
  }

  public async list(tenantId: string, options?: EmployeeFilterOptions): Promise<Employee[]> {
    const result: Employee[] = [];

    for (const employee of this.employees.values()) {
      if (employee.tenantId !== tenantId) {
        continue;
      }
      if (options?.departmentId && employee.departmentId !== options.departmentId) {
        continue;
      }
      if (options?.positionId && employee.positionId !== options.positionId) {
        continue;
      }
      if (options?.managerId && employee.managerId !== options.managerId) {
        continue;
      }
      if (options?.branchId && employee.branchId !== options.branchId) {
        continue;
      }
      if (options?.employmentStatus && employee.employmentStatus !== options.employmentStatus) {
        continue;
      }
      if (options?.search) {
        const query = options.search.toLowerCase();
        const matchesName =
          employee.firstName.toLowerCase().includes(query) ||
          employee.lastName.toLowerCase().includes(query);
        const matchesEmail = employee.email.toLowerCase().includes(query);
        const matchesNumber = employee.employeeNumber.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail && !matchesNumber) {
          continue;
        }
      }
      result.push(employee);
    }

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return result.slice(offset, offset + limit);
  }

  public async count(tenantId: string, options?: EmployeeFilterOptions): Promise<number> {
    const list = await this.list(tenantId, { ...options, offset: 0, limit: Number.MAX_SAFE_INTEGER });
    return list.length;
  }

  public async exists(tenantId: string, id: string): Promise<boolean> {
    const emp = await this.findById(tenantId, id);
    return emp !== null;
  }

  public async getManagerNode(tenantId: string, employeeId: string): Promise<ManagerNode | null> {
    const emp = await this.findById(tenantId, employeeId);
    if (!emp) {
      return null;
    }
    return {
      employeeId: emp.id,
      tenantId: emp.tenantId,
      managerId: emp.managerId,
      employmentStatus: emp.employmentStatus,
    };
  }

  public async getNode(employeeId: string, tenantId: string): Promise<ManagerNode | null> {
    return this.getManagerNode(tenantId, employeeId);
  }

  public async delete(tenantId: string, id: string): Promise<boolean> {
    const emp = await this.findById(tenantId, id);
    if (!emp) {
      return false;
    }
    this.employees.delete(id);
    return true;
  }
}
