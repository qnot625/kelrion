import { Employee } from "./employee.js";
import {
  AttendanceCorrectionNotFoundError,
  type AttendanceCorrectionRepository,
  type AttendanceIdempotencyRecord,
  type AttendanceRepository,
  type CreateAttendanceCorrectionInput,
  type EmployeeRepository,
} from "./contracts.js";
import type {
  AttendanceCorrection,
  AttendanceCorrectionFilterOptions,
  AttendanceRecordFilterOptions,
  AttendanceRecordState,
  EmployeeFilterOptions,
} from "./types.js";

function employeeKey(tenantId: string, id: string): string { return `${tenantId}:${id}`; }
function attendanceKey(tenantId: string, employeeId: string, workDate: string): string { return `${tenantId}:${employeeId}:${workDate}`; }
function idempotencyKey(tenantId: string, key: string): string { return `${tenantId}:${key}`; }

function cloneAttendance(record: AttendanceRecordState): AttendanceRecordState {
  return {
    ...record,
    clockInAt: record.clockInAt ? new Date(record.clockInAt) : null,
    clockOutAt: record.clockOutAt ? new Date(record.clockOutAt) : null,
    breaks: record.breaks.map((item) => ({
      ...item,
      startedAt: new Date(item.startedAt),
      endedAt: item.endedAt ? new Date(item.endedAt) : null,
    })),
    exceptions: record.exceptions.map((item) => ({
      ...item,
      detectedAt: new Date(item.detectedAt),
      resolvedAt: item.resolvedAt ? new Date(item.resolvedAt) : null,
    })),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

export class InMemoryEmployeeRepository implements EmployeeRepository {
  private readonly records = new Map<string, Employee>();

  async save(employee: Employee): Promise<void> {
    this.records.set(employeeKey(employee.tenantId, employee.id), Employee.reconstitute(employee.toState()));
  }

  async findById(tenantId: string, id: string): Promise<Employee | null> {
    const employee = this.records.get(employeeKey(tenantId, id));
    return employee ? Employee.reconstitute(employee.toState()) : null;
  }

  async findByUserId(tenantId: string, userId: string): Promise<Employee | null> {
    return this.findOne(tenantId, (employee) => employee.userId === userId);
  }

  async findByEmployeeNumber(tenantId: string, employeeNumber: string): Promise<Employee | null> {
    return this.findOne(tenantId, (employee) => employee.employeeNumber.toLowerCase() === employeeNumber.toLowerCase());
  }

  async findByEmail(tenantId: string, email: string): Promise<Employee | null> {
    return this.findOne(tenantId, (employee) => employee.email.toLowerCase() === email.toLowerCase());
  }

  async list(tenantId: string, options: EmployeeFilterOptions = {}): Promise<Employee[]> {
    const search = options.search?.trim().toLowerCase();
    const rows = [...this.records.values()].filter((employee) => {
      if (employee.tenantId !== tenantId) return false;
      if (options.userId && employee.userId !== options.userId) return false;
      if (options.departmentId && employee.departmentId !== options.departmentId) return false;
      if (options.positionId && employee.positionId !== options.positionId) return false;
      if (options.managerId && employee.managerId !== options.managerId) return false;
      if (options.branchId && employee.branchId !== options.branchId) return false;
      if (options.employmentStatus && employee.employmentStatus !== options.employmentStatus) return false;
      if (search) {
        const haystack = `${employee.employeeNumber} ${employee.firstName} ${employee.lastName} ${employee.email}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    }).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? rows.length, 0), 200);
    return rows.slice(offset, offset + limit).map((employee) => Employee.reconstitute(employee.toState()));
  }

  async count(tenantId: string, options: EmployeeFilterOptions = {}): Promise<number> {
    const search = options.search?.trim().toLowerCase();
    let count = 0;
    for (const employee of this.records.values()) {
      if (employee.tenantId !== tenantId) continue;
      if (options.userId && employee.userId !== options.userId) continue;
      if (options.departmentId && employee.departmentId !== options.departmentId) continue;
      if (options.positionId && employee.positionId !== options.positionId) continue;
      if (options.managerId && employee.managerId !== options.managerId) continue;
      if (options.branchId && employee.branchId !== options.branchId) continue;
      if (options.employmentStatus && employee.employmentStatus !== options.employmentStatus) continue;
      if (search) {
        const haystack = `${employee.employeeNumber} ${employee.firstName} ${employee.lastName} ${employee.email}`.toLowerCase();
        if (!haystack.includes(search)) continue;
      }
      count += 1;
    }
    return count;
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const deleted = this.records.delete(employeeKey(tenantId, id));
    if (deleted) {
      for (const [key, employee] of this.records) {
        if (employee.tenantId === tenantId && employee.managerId === id) {
          const copy = Employee.reconstitute(employee.toState());
          copy.setPlacement({ managerId: null });
          this.records.set(key, copy);
        }
      }
    }
    return deleted;
  }

  private async findOne(tenantId: string, predicate: (employee: Employee) => boolean): Promise<Employee | null> {
    for (const employee of this.records.values()) {
      if (employee.tenantId === tenantId && predicate(employee)) return Employee.reconstitute(employee.toState());
    }
    return null;
  }
}

export class InMemoryAttendanceRepository implements AttendanceRepository {
  private readonly records = new Map<string, AttendanceRecordState>();
  private readonly recordsById = new Map<string, string>();
  private readonly idempotency = new Map<string, AttendanceIdempotencyRecord>();

  async saveRecord(record: AttendanceRecordState): Promise<void> {
    const key = attendanceKey(record.tenantId, record.employeeId, record.workDate);
    this.records.set(key, cloneAttendance(record));
    this.recordsById.set(employeeKey(record.tenantId, record.id), key);
  }

  async getRecord(tenantId: string, employeeId: string, workDate: string): Promise<AttendanceRecordState | null> {
    const record = this.records.get(attendanceKey(tenantId, employeeId, workDate));
    return record ? cloneAttendance(record) : null;
  }

  async getRecordById(tenantId: string, id: string): Promise<AttendanceRecordState | null> {
    const key = this.recordsById.get(employeeKey(tenantId, id));
    if (!key) return null;
    const record = this.records.get(key);
    return record ? cloneAttendance(record) : null;
  }

  async listRecords(tenantId: string, options: AttendanceRecordFilterOptions = {}): Promise<AttendanceRecordState[]> {
    const rows = [...this.records.values()].filter((record) => {
      if (record.tenantId !== tenantId) return false;
      if (options.employeeId && record.employeeId !== options.employeeId) return false;
      if (options.startDate && record.workDate < options.startDate) return false;
      if (options.endDate && record.workDate > options.endDate) return false;
      return true;
    }).sort((a, b) => b.workDate.localeCompare(a.workDate));
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return rows.slice(offset, offset + limit).map(cloneAttendance);
  }

  async findIdempotency(tenantId: string, key: string): Promise<AttendanceIdempotencyRecord | null> {
    const record = this.idempotency.get(idempotencyKey(tenantId, key));
    return record ? { ...record, createdAt: new Date(record.createdAt) } : null;
  }

  async saveIdempotency(record: AttendanceIdempotencyRecord): Promise<void> {
    this.idempotency.set(idempotencyKey(record.tenantId, record.key), { ...record, createdAt: new Date(record.createdAt) });
  }
}

export class InMemoryAttendanceCorrectionRepository implements AttendanceCorrectionRepository {
  private readonly records = new Map<string, AttendanceCorrection>();

  async create(input: CreateAttendanceCorrectionInput): Promise<AttendanceCorrection> {
    const now = new Date();
    const correction: AttendanceCorrection = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      requestedAction: input.requestedAction,
      requestedAt: new Date(input.requestedAt),
      reason: input.reason,
      status: "pending",
      reviewedByUserId: null,
      reviewNotes: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(employeeKey(input.tenantId, correction.id), correction);
    return this.clone(correction);
  }

  async findById(tenantId: string, id: string): Promise<AttendanceCorrection | null> {
    const record = this.records.get(employeeKey(tenantId, id));
    return record ? this.clone(record) : null;
  }

  async list(tenantId: string, options: AttendanceCorrectionFilterOptions = {}): Promise<AttendanceCorrection[]> {
    const rows = [...this.records.values()].filter((record) =>
      record.tenantId === tenantId &&
      (!options.employeeId || record.employeeId === options.employeeId) &&
      (!options.status || record.status === options.status)
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const offset = Math.max(options.offset ?? 0, 0);
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return rows.slice(offset, offset + limit).map((record) => this.clone(record));
  }

  async count(tenantId: string, options: AttendanceCorrectionFilterOptions = {}): Promise<number> {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.tenantId !== tenantId) continue;
      if (options.employeeId && record.employeeId !== options.employeeId) continue;
      if (options.status && record.status !== options.status) continue;
      count += 1;
    }
    return count;
  }

  async review(
    tenantId: string,
    id: string,
    status: "approved" | "rejected",
    reviewedByUserId: string,
    reviewNotes?: string,
  ): Promise<AttendanceCorrection> {
    const key = employeeKey(tenantId, id);
    const current = this.records.get(key);
    if (!current) throw new AttendanceCorrectionNotFoundError(id);
    const updated: AttendanceCorrection = {
      ...current,
      status,
      reviewedByUserId,
      reviewNotes: reviewNotes ?? null,
      updatedAt: new Date(),
    };
    this.records.set(key, updated);
    return this.clone(updated);
  }

  private clone(record: AttendanceCorrection): AttendanceCorrection {
    return {
      ...record,
      requestedAt: new Date(record.requestedAt),
      createdAt: new Date(record.createdAt),
      updatedAt: new Date(record.updatedAt),
    };
  }
}
