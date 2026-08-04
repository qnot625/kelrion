export interface DepartmentRef {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  slug: string;
  capacity: number;
}

export class InvalidDepartmentCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDepartmentCapacityError";
  }
}

export class DuplicateDepartmentSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateDepartmentSlugError";
  }
}

export class DepartmentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepartmentNotFoundError";
  }
}

export function validateDepartmentCapacity(capacity: number): void {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new InvalidDepartmentCapacityError("Department capacity must be a strictly positive integer (>= 1).");
  }
}
