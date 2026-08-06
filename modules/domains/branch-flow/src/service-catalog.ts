export interface ServiceRef {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  status: "active" | "inactive";
}

export interface ServiceRequirement {
  id?: string;
  tenantId?: string;
  serviceId?: string;
  photoIdRequired: boolean;
  minAge?: number | null;
  maxAge?: number | null;
  requiredDocuments: string[];
  customNotes?: string | null;
}

export interface BranchServiceRef {
  id: string;
  tenantId: string;
  branchId: string;
  serviceId: string;
  status: "active" | "inactive";
}

export class InvalidServiceDurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidServiceDurationError";
  }
}

export class InvalidServiceCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidServiceCodeError";
  }
}

export class DuplicateServiceCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateServiceCodeError";
  }
}

export class ServiceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceNotFoundError";
  }
}

export class DuplicateBranchServiceMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateBranchServiceMappingError";
  }
}

export function validateServiceDuration(durationMinutes: number): void {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    throw new InvalidServiceDurationError(
      "Service durationMinutes must be an integer between 1 and 480 minutes (8 hours)."
    );
  }
}

export function validateServiceCode(code: string): void {
  if (!code || typeof code !== "string") {
    throw new InvalidServiceCodeError("Service code must be a non-empty string.");
  }
  const codeRegex = /^[a-zA-Z0-9_-]+$/;
  if (!codeRegex.test(code)) {
    throw new InvalidServiceCodeError(
      "Service code must contain only letters, numbers, hyphens, and underscores."
    );
  }
}

export interface ServiceRepository {
  createService(
    service: Omit<ServiceRef, "id">,
    requirement?: Omit<ServiceRequirement, "id" | "tenantId" | "serviceId">
  ): Promise<{ service: ServiceRef; requirement: ServiceRequirement | null }>;

  getServiceById(id: string, tenantId: string): Promise<ServiceRef | null>;
  getServiceByCode(code: string, tenantId: string): Promise<ServiceRef | null>;
  getServices(tenantId: string): Promise<ServiceRef[]>;
  updateService(
    id: string,
    tenantId: string,
    updates: Partial<Omit<ServiceRef, "id" | "tenantId">>
  ): Promise<ServiceRef>;

  getServiceRequirement(serviceId: string, tenantId: string): Promise<ServiceRequirement | null>;
  setServiceRequirement(
    serviceId: string,
    tenantId: string,
    requirement: Omit<ServiceRequirement, "id" | "tenantId" | "serviceId">
  ): Promise<ServiceRequirement>;

  assignServiceToBranch(
    tenantId: string,
    branchId: string,
    serviceId: string
  ): Promise<BranchServiceRef>;

  removeServiceFromBranch(
    tenantId: string,
    branchId: string,
    serviceId: string
  ): Promise<void>;

  getBranchServices(branchId: string, tenantId: string): Promise<ServiceRef[]>;
}
