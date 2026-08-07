import { WorkforceValidationError } from "./contracts.js";
import type { EmployeeState, EmploymentStatus, EmploymentType } from "./types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPLOYEE_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const EMPLOYMENT_TYPES: readonly EmploymentType[] = ["full_time", "part_time", "contract", "intern", "temporary"];

function requireUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new WorkforceValidationError(`${label} must be a valid UUID`);
}

function requireOptionalUuid(value: string | null | undefined, label: string): void {
  if (value != null) requireUuid(value, label);
}

function requireDate(value: string, label: string): void {
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())) {
    throw new WorkforceValidationError(`${label} must be a valid YYYY-MM-DD date`);
  }
}

function requireName(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) throw new WorkforceValidationError(`${label} must be between 1 and 100 characters`);
  return normalized;
}

function requireEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
    throw new WorkforceValidationError("email must be a valid email address");
  }
  return normalized;
}

export interface CreateEmployeeInput {
  readonly id?: string;
  readonly tenantId: string;
  readonly userId?: string | null;
  readonly employeeNumber: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly hireDate: string;
  readonly employmentType: EmploymentType;
  readonly employmentStatus?: EmploymentStatus;
  readonly departmentId?: string | null;
  readonly positionId?: string | null;
  readonly managerId?: string | null;
  readonly branchId?: string | null;
}

export interface UpdateEmployeeProfileInput {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly employmentType?: EmploymentType;
}

export interface UpdateEmployeePlacementInput {
  readonly departmentId?: string | null;
  readonly positionId?: string | null;
  readonly managerId?: string | null;
  readonly branchId?: string | null;
}

export class Employee {
  private state: EmployeeState;

  private constructor(state: EmployeeState) {
    this.state = { ...state };
  }

  static create(input: CreateEmployeeInput): Employee {
    const id = input.id ?? crypto.randomUUID();
    requireUuid(id, "employee id");
    requireUuid(input.tenantId, "tenant id");
    requireOptionalUuid(input.userId, "user id");
    requireOptionalUuid(input.departmentId, "department id");
    requireOptionalUuid(input.positionId, "position id");
    requireOptionalUuid(input.managerId, "manager id");
    requireOptionalUuid(input.branchId, "branch id");
    if (input.managerId === id) throw new WorkforceValidationError("An employee cannot manage themselves");
    if (!EMPLOYEE_NUMBER_PATTERN.test(input.employeeNumber)) {
      throw new WorkforceValidationError("employeeNumber must be 1-40 characters using letters, digits, period, underscore or hyphen");
    }
    requireDate(input.hireDate, "hireDate");
    if (!EMPLOYMENT_TYPES.includes(input.employmentType)) throw new WorkforceValidationError("Invalid employment type");
    const now = new Date();
    return new Employee({
      id,
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      employeeNumber: input.employeeNumber.trim(),
      firstName: requireName(input.firstName, "firstName"),
      lastName: requireName(input.lastName, "lastName"),
      email: requireEmail(input.email),
      hireDate: input.hireDate,
      employmentType: input.employmentType,
      employmentStatus: input.employmentStatus ?? "active",
      departmentId: input.departmentId ?? null,
      positionId: input.positionId ?? null,
      managerId: input.managerId ?? null,
      branchId: input.branchId ?? null,
      terminationDate: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(state: EmployeeState): Employee {
    requireUuid(state.id, "employee id");
    requireUuid(state.tenantId, "tenant id");
    if (state.managerId === state.id) throw new WorkforceValidationError("An employee cannot manage themselves");
    return new Employee(state);
  }

  get id(): string { return this.state.id; }
  get tenantId(): string { return this.state.tenantId; }
  get userId(): string | null { return this.state.userId; }
  get employeeNumber(): string { return this.state.employeeNumber; }
  get firstName(): string { return this.state.firstName; }
  get lastName(): string { return this.state.lastName; }
  get email(): string { return this.state.email; }
  get hireDate(): string { return this.state.hireDate; }
  get employmentType(): EmploymentType { return this.state.employmentType; }
  get employmentStatus(): EmploymentStatus { return this.state.employmentStatus; }
  get departmentId(): string | null { return this.state.departmentId; }
  get positionId(): string | null { return this.state.positionId; }
  get managerId(): string | null { return this.state.managerId; }
  get branchId(): string | null { return this.state.branchId; }
  get terminationDate(): string | null { return this.state.terminationDate; }

  toState(): EmployeeState {
    return { ...this.state };
  }

  updateProfile(input: UpdateEmployeeProfileInput): void {
    this.requireMutable();
    const nextFirst = input.firstName === undefined ? this.state.firstName : requireName(input.firstName, "firstName");
    const nextLast = input.lastName === undefined ? this.state.lastName : requireName(input.lastName, "lastName");
    const nextEmail = input.email === undefined ? this.state.email : requireEmail(input.email);
    const nextType = input.employmentType ?? this.state.employmentType;
    if (!EMPLOYMENT_TYPES.includes(nextType)) throw new WorkforceValidationError("Invalid employment type");
    this.state = {
      ...this.state,
      firstName: nextFirst,
      lastName: nextLast,
      email: nextEmail,
      employmentType: nextType,
      updatedAt: new Date(),
    };
  }

  linkUser(userId: string | null): void {
    this.requireMutable();
    requireOptionalUuid(userId, "user id");
    this.state = { ...this.state, userId, updatedAt: new Date() };
  }

  setPlacement(input: UpdateEmployeePlacementInput): void {
    this.requireMutable();
    requireOptionalUuid(input.departmentId, "department id");
    requireOptionalUuid(input.positionId, "position id");
    requireOptionalUuid(input.managerId, "manager id");
    requireOptionalUuid(input.branchId, "branch id");
    if (input.managerId === this.state.id) throw new WorkforceValidationError("An employee cannot manage themselves");
    this.state = {
      ...this.state,
      departmentId: input.departmentId === undefined ? this.state.departmentId : input.departmentId,
      positionId: input.positionId === undefined ? this.state.positionId : input.positionId,
      managerId: input.managerId === undefined ? this.state.managerId : input.managerId,
      branchId: input.branchId === undefined ? this.state.branchId : input.branchId,
      updatedAt: new Date(),
    };
  }

  setStatus(status: Exclude<EmploymentStatus, "terminated">): void {
    this.requireMutable();
    this.state = { ...this.state, employmentStatus: status, updatedAt: new Date() };
  }

  terminate(terminationDate: string): void {
    if (this.state.employmentStatus === "terminated") throw new WorkforceValidationError("Employee is already terminated");
    requireDate(terminationDate, "terminationDate");
    if (terminationDate < this.state.hireDate) throw new WorkforceValidationError("terminationDate cannot be before hireDate");
    this.state = {
      ...this.state,
      employmentStatus: "terminated",
      terminationDate,
      updatedAt: new Date(),
    };
  }

  private requireMutable(): void {
    if (this.state.employmentStatus === "terminated") {
      throw new WorkforceValidationError("Terminated employee records cannot be modified");
    }
  }
}
