import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
} from "./contracts.js";
import {
  createWorkforceDomainEvent,
  WORKFORCE_EVENT_TYPES,
  type WorkforceDomainEvent,
} from "./events.js";
import type {
  EmployeeRef,
  EmploymentPlacement,
  EmploymentStatus,
  EmploymentType,
} from "./types.js";

export class EmployeeDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeDomainError";
  }
}

export interface EmployeeState {
  id: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  branchId: string | null;
  terminationDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeeProps {
  id?: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  employmentType: EmploymentType;
  employmentStatus?: EmploymentStatus;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  branchId?: string | null;
}

const DateRegex = /^\d{4}-\d{2}-\d{2}$/;
const UuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class Employee {
  private props: EmployeeState;
  private _uncommittedEvents: WorkforceDomainEvent[] = [];

  private constructor(state: EmployeeState) {
    this.props = { ...state };
  }

  // ---------------------------------------------------------------------------
  // Factory Methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new Employee aggregate root instance and record an EmployeeCreated event.
   */
  public static create(input: CreateEmployeeProps): Employee {
    const id = input.id ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const validatedInput = CreateEmployeeSchema.safeParse({
      tenantId: input.tenantId,
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      hireDate: input.hireDate,
      employmentType: input.employmentType,
      departmentId: input.departmentId ?? undefined,
      positionId: input.positionId ?? undefined,
      managerId: input.managerId ?? undefined,
      branchId: input.branchId ?? undefined,
    });

    if (!validatedInput.success) {
      const errorMsg = validatedInput.error.errors.map((e) => e.message).join(", ");
      throw new EmployeeDomainError(`Invalid employee creation input: ${errorMsg}`);
    }

    if (!UuidRegex.test(id)) {
      throw new EmployeeDomainError("Employee ID must be a valid UUID");
    }

    const data = validatedInput.data;

    if (data.managerId && data.managerId === id) {
      throw new EmployeeDomainError("An employee cannot be assigned as their own manager");
    }

    const state: EmployeeState = {
      id,
      tenantId: data.tenantId,
      employeeNumber: data.employeeNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      hireDate: data.hireDate,
      employmentType: data.employmentType as EmploymentType,
      employmentStatus: input.employmentStatus ?? "active",
      departmentId: data.departmentId ?? null,
      positionId: data.positionId ?? null,
      managerId: data.managerId ?? null,
      branchId: data.branchId ?? null,
      terminationDate: null,
      createdAt: now,
      updatedAt: now,
    };

    const employee = new Employee(state);

    const createdEvent = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
      tenantId: state.tenantId,
      aggregateId: state.id,
      occurredAt: now,
      payload: {
        employeeId: state.id,
        tenantId: state.tenantId,
        employeeNumber: state.employeeNumber,
        firstName: state.firstName,
        lastName: state.lastName,
        email: state.email,
        hireDate: state.hireDate,
        employmentType: state.employmentType,
        employmentStatus: state.employmentStatus,
        departmentId: state.departmentId,
        positionId: state.positionId,
        managerId: state.managerId,
        branchId: state.branchId,
      },
    });

    employee.recordEvent(createdEvent);
    return employee;
  }

  /**
   * Reconstitute an existing Employee aggregate from persistent state without emitting events.
   */
  public static reconstitute(state: EmployeeState): Employee {
    if (!UuidRegex.test(state.id)) {
      throw new EmployeeDomainError("Employee ID must be a valid UUID");
    }
    if (!UuidRegex.test(state.tenantId)) {
      throw new EmployeeDomainError("Tenant ID must be a valid UUID");
    }
    if (state.managerId && state.managerId === state.id) {
      throw new EmployeeDomainError("An employee cannot be assigned as their own manager");
    }

    return new Employee(state);
  }

  // ---------------------------------------------------------------------------
  // Getters / Value Objects
  // ---------------------------------------------------------------------------

  public get id(): string {
    return this.props.id;
  }

  public get tenantId(): string {
    return this.props.tenantId;
  }

  public get employeeNumber(): string {
    return this.props.employeeNumber;
  }

  public get firstName(): string {
    return this.props.firstName;
  }

  public get lastName(): string {
    return this.props.lastName;
  }

  public get email(): string {
    return this.props.email;
  }

  public get hireDate(): string {
    return this.props.hireDate;
  }

  public get employmentType(): EmploymentType {
    return this.props.employmentType;
  }

  public get employmentStatus(): EmploymentStatus {
    return this.props.employmentStatus;
  }

  public get departmentId(): string | null {
    return this.props.departmentId;
  }

  public get positionId(): string | null {
    return this.props.positionId;
  }

  public get managerId(): string | null {
    return this.props.managerId;
  }

  public get branchId(): string | null {
    return this.props.branchId;
  }

  public get terminationDate(): string | null {
    return this.props.terminationDate;
  }

  public get createdAt(): string {
    return this.props.createdAt;
  }

  public get updatedAt(): string {
    return this.props.updatedAt;
  }

  public toState(): EmployeeState {
    return { ...this.props };
  }

  public toRef(): EmployeeRef {
    return {
      id: this.props.id,
      tenantId: this.props.tenantId,
      employeeNumber: this.props.employeeNumber,
      firstName: this.props.firstName,
      lastName: this.props.lastName,
      email: this.props.email,
    };
  }

  public toPlacement(): EmploymentPlacement {
    return {
      employeeId: this.props.id,
      tenantId: this.props.tenantId,
      departmentId: this.props.departmentId,
      positionId: this.props.positionId,
      managerId: this.props.managerId,
      branchId: this.props.branchId,
      employmentType: this.props.employmentType,
      employmentStatus: this.props.employmentStatus,
      hireDate: this.props.hireDate,
      terminationDate: this.props.terminationDate,
    };
  }

  public getUncommittedEvents(): WorkforceDomainEvent[] {
    return [...this._uncommittedEvents];
  }

  public clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }

  // ---------------------------------------------------------------------------
  // Aggregate Behaviors & Invariant Protections
  // ---------------------------------------------------------------------------

  /**
   * Update basic profile information.
   */
  public updateProfile(params: {
    firstName?: string;
    lastName?: string;
    email?: string;
    employmentType?: EmploymentType;
  }): void {
    this.ensureNotTerminated("update profile");

    const validated = UpdateEmployeeSchema.safeParse({
      tenantId: this.props.tenantId,
      employeeId: this.props.id,
      ...params,
    });
    if (!validated.success) {
      const errorMsg = validated.error.errors.map((e) => e.message).join(", ");
      throw new EmployeeDomainError(`Invalid update profile params: ${errorMsg}`);
    }

    const changes: Record<string, unknown> = {};

    if (params.firstName !== undefined && params.firstName !== this.props.firstName) {
      changes.firstName = params.firstName;
      this.props.firstName = params.firstName;
    }
    if (params.lastName !== undefined && params.lastName !== this.props.lastName) {
      changes.lastName = params.lastName;
      this.props.lastName = params.lastName;
    }
    if (params.email !== undefined && params.email !== this.props.email) {
      changes.email = params.email;
      this.props.email = params.email;
    }
    if (
      params.employmentType !== undefined &&
      params.employmentType !== this.props.employmentType
    ) {
      changes.employmentType = params.employmentType;
      this.props.employmentType = params.employmentType;
    }

    if (Object.keys(changes).length === 0) {
      return;
    }

    this.props.updatedAt = new Date().toISOString();

    const updatedEvent = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_UPDATED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        changes,
      },
    });

    this.recordEvent(updatedEvent);
  }

  /**
   * Activate a suspended or on-leave employee.
   */
  public activate(reason?: string): void {
    this.ensureNotTerminated("activate");

    if (this.props.employmentStatus === "active") {
      throw new EmployeeDomainError("Employee is already active");
    }

    const previousStatus = this.props.employmentStatus;
    this.props.employmentStatus = "active";
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_ACTIVATED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        previousStatus,
        reason,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Suspend an employee.
   */
  public suspend(reason: string): void {
    this.ensureNotTerminated("suspend");

    if (!reason || reason.trim().length === 0) {
      throw new EmployeeDomainError("Suspension reason is required");
    }

    if (this.props.employmentStatus === "suspended") {
      throw new EmployeeDomainError("Employee is already suspended");
    }

    this.props.employmentStatus = "suspended";
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_SUSPENDED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        reason: reason.trim(),
      },
    });

    this.recordEvent(event);
  }

  /**
   * Terminate an employee.
   */
  public terminate(params: { terminationDate: string; reason?: string }): void {
    if (this.props.employmentStatus === "terminated") {
      throw new EmployeeDomainError("Employee is already terminated");
    }

    if (!DateRegex.test(params.terminationDate)) {
      throw new EmployeeDomainError("Termination date must be in YYYY-MM-DD format");
    }

    this.props.employmentStatus = "terminated";
    this.props.terminationDate = params.terminationDate;
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_TERMINATED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        terminationDate: params.terminationDate,
        reason: params.reason,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Transfer employee to a new branch or site.
   */
  public transfer(params: { toBranchId: string | null; effectiveDate: string }): void {
    this.ensureNotTerminated("transfer");

    if (!DateRegex.test(params.effectiveDate)) {
      throw new EmployeeDomainError("Effective date must be in YYYY-MM-DD format");
    }

    const fromBranchId = this.props.branchId;
    this.props.branchId = params.toBranchId;
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_TRANSFERRED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        fromBranchId,
        toBranchId: params.toBranchId,
        effectiveDate: params.effectiveDate,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Assign employee to a department.
   */
  public assignDepartment(departmentId: string | null): void {
    this.ensureNotTerminated("assign department");

    if (departmentId !== null && !UuidRegex.test(departmentId)) {
      throw new EmployeeDomainError("Department ID must be a valid UUID or null");
    }

    const previousDepartmentId = this.props.departmentId;
    this.props.departmentId = departmentId;
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.DEPARTMENT_ASSIGNED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        previousDepartmentId,
        newDepartmentId: departmentId,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Assign employee to a position.
   */
  public assignPosition(positionId: string | null): void {
    this.ensureNotTerminated("assign position");

    if (positionId !== null && !UuidRegex.test(positionId)) {
      throw new EmployeeDomainError("Position ID must be a valid UUID or null");
    }

    const previousPositionId = this.props.positionId;
    this.props.positionId = positionId;
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.POSITION_ASSIGNED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        previousPositionId,
        newPositionId: positionId,
      },
    });

    this.recordEvent(event);
  }

  /**
   * Assign manager to employee.
   */
  public assignManager(managerId: string | null): void {
    this.ensureNotTerminated("assign manager");

    if (managerId !== null) {
      if (!UuidRegex.test(managerId)) {
        throw new EmployeeDomainError("Manager ID must be a valid UUID or null");
      }
      if (managerId === this.props.id) {
        throw new EmployeeDomainError("An employee cannot be assigned as their own manager");
      }
    }

    const previousManagerId = this.props.managerId;
    this.props.managerId = managerId;
    this.props.updatedAt = new Date().toISOString();

    const event = createWorkforceDomainEvent({
      eventType: WORKFORCE_EVENT_TYPES.MANAGER_ASSIGNED,
      tenantId: this.props.tenantId,
      aggregateId: this.props.id,
      occurredAt: this.props.updatedAt,
      payload: {
        employeeId: this.props.id,
        tenantId: this.props.tenantId,
        previousManagerId,
        newManagerId: managerId,
      },
    });

    this.recordEvent(event);
  }

  // ---------------------------------------------------------------------------
  // Helper Private Methods
  // ---------------------------------------------------------------------------

  private ensureNotTerminated(action: string): void {
    if (this.props.employmentStatus === "terminated") {
      throw new EmployeeDomainError(`Cannot ${action} of a terminated employee`);
    }
  }

  private recordEvent(event: WorkforceDomainEvent): void {
    this._uncommittedEvents.push(event);
  }
}
