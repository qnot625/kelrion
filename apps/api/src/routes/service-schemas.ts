import {
  BranchNotFoundError,
  DuplicateBranchServiceMappingError,
  DuplicateServiceCodeError,
  InvalidServiceCodeError,
  InvalidServiceDurationError,
  ServiceNotFoundError,
  validateServiceCode,
  validateServiceDuration,
} from "@adminops/branch-flow";
import {
  formatErrorResponse,
  SchemaValidationError,
  type ErrorResponse,
} from "./branch-schemas.js";

export function handleServiceDomainError(
  error: unknown,
): { status: number; body: ErrorResponse } | undefined {
  if (error instanceof SchemaValidationError) {
    return {
      status: 400,
      body: formatErrorResponse("VALIDATION_ERROR", (error as Error).message),
    };
  }
  if (error instanceof InvalidServiceDurationError) {
    return {
      status: 400,
      body: formatErrorResponse("INVALID_SERVICE_DURATION", (error as Error).message),
    };
  }
  if (error instanceof InvalidServiceCodeError) {
    return {
      status: 400,
      body: formatErrorResponse("INVALID_SERVICE_CODE", (error as Error).message),
    };
  }
  if (error instanceof DuplicateServiceCodeError) {
    return {
      status: 409,
      body: formatErrorResponse("DUPLICATE_SERVICE_CODE", (error as Error).message),
    };
  }
  if (error instanceof ServiceNotFoundError) {
    return {
      status: 404,
      body: formatErrorResponse("SERVICE_NOT_FOUND", (error as Error).message),
    };
  }
  if (error instanceof DuplicateBranchServiceMappingError) {
    return {
      status: 409,
      body: formatErrorResponse("DUPLICATE_BRANCH_SERVICE_MAPPING", (error as Error).message),
    };
  }
  if (error instanceof BranchNotFoundError) {
    return {
      status: 404,
      body: formatErrorResponse("BRANCH_NOT_FOUND", (error as Error).message),
    };
  }
  return undefined;
}

export interface ServiceRequirementInput {
  photoIdRequired: boolean;
  minAge?: number | null;
  maxAge?: number | null;
  requiredDocuments: string[];
  customNotes?: string | null;
}

export interface CreateServiceBody {
  code: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  status: "active" | "inactive";
  requirements?: ServiceRequirementInput;
}

export interface UpdateServiceBody {
  code?: string;
  name?: string;
  description?: string | null;
  durationMinutes?: number;
  status?: "active" | "inactive";
}

export interface AssignServiceToBranchBody {
  serviceId: string;
}

function validateRequirement(value: unknown, prefix = "requirements"): ServiceRequirementInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SchemaValidationError(`${prefix} must be an object`);
  }
  const reqObj = value as Record<string, unknown>;
  if (reqObj.photoIdRequired !== undefined && typeof reqObj.photoIdRequired !== "boolean") {
    throw new SchemaValidationError(`${prefix}.photoIdRequired must be a boolean`);
  }
  for (const key of ["minAge", "maxAge"] as const) {
    const item = reqObj[key];
    if (item !== undefined && item !== null && (typeof item !== "number" || !Number.isInteger(item) || item < 0)) {
      throw new SchemaValidationError(`${prefix}.${key} must be a non-negative integer or null`);
    }
  }
  if (typeof reqObj.minAge === "number" && typeof reqObj.maxAge === "number" && reqObj.maxAge < reqObj.minAge) {
    throw new SchemaValidationError(`${prefix}.maxAge must be greater than or equal to minAge`);
  }
  if (reqObj.requiredDocuments !== undefined && (!Array.isArray(reqObj.requiredDocuments) || !reqObj.requiredDocuments.every((doc) => typeof doc === "string"))) {
    throw new SchemaValidationError(`${prefix}.requiredDocuments must be an array of strings`);
  }
  if (reqObj.customNotes !== undefined && reqObj.customNotes !== null && typeof reqObj.customNotes !== "string") {
    throw new SchemaValidationError(`${prefix}.customNotes must be a string or null`);
  }
  return {
    photoIdRequired: typeof reqObj.photoIdRequired === "boolean" ? reqObj.photoIdRequired : false,
    minAge: (reqObj.minAge as number | null | undefined) ?? null,
    maxAge: (reqObj.maxAge as number | null | undefined) ?? null,
    requiredDocuments: Array.isArray(reqObj.requiredDocuments) ? reqObj.requiredDocuments as string[] : [],
    customNotes: (reqObj.customNotes as string | null | undefined) ?? null,
  };
}

export function validateCreateServiceBody(body: unknown): CreateServiceBody {
  if (!body || typeof body !== "object") {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.code !== "string" || obj.code.trim().length === 0) {
    throw new SchemaValidationError("code is required and must be a non-empty string");
  }
  validateServiceCode(obj.code);

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    throw new SchemaValidationError("name is required and must be a non-empty string");
  }

  if (obj.description !== undefined && obj.description !== null && typeof obj.description !== "string") {
    throw new SchemaValidationError("description must be a string or null");
  }

  if (typeof obj.durationMinutes !== "number" || !Number.isInteger(obj.durationMinutes)) {
    throw new SchemaValidationError("durationMinutes is required and must be an integer");
  }
  validateServiceDuration(obj.durationMinutes);

  if (obj.status !== undefined && obj.status !== "active" && obj.status !== "inactive") {
    throw new SchemaValidationError("status must be active or inactive");
  }

  const requirements = obj.requirements === undefined || obj.requirements === null
    ? undefined
    : validateRequirement(obj.requirements);

  return {
    code: obj.code,
    name: obj.name,
    description: (obj.description as string | null | undefined) ?? null,
    durationMinutes: obj.durationMinutes,
    status: (obj.status as "active" | "inactive" | undefined) ?? "active",
    requirements,
  };
}

export function validateAssignServiceToBranchBody(body: unknown): AssignServiceToBranchBody {
  if (!body || typeof body !== "object") {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.serviceId !== "string" || obj.serviceId.trim().length === 0) {
    throw new SchemaValidationError("serviceId is required and must be a non-empty string");
  }

  return {
    serviceId: obj.serviceId as string,
  };
}


export function validateUpdateServiceBody(body: unknown): UpdateServiceBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;
  if (obj.code === undefined && obj.name === undefined && obj.description === undefined && obj.durationMinutes === undefined && obj.status === undefined) {
    throw new SchemaValidationError("At least one service field must be provided for update");
  }
  if (obj.code !== undefined) {
    if (typeof obj.code !== "string" || !obj.code.trim()) throw new SchemaValidationError("code must be a non-empty string");
    validateServiceCode(obj.code);
  }
  if (obj.name !== undefined && (typeof obj.name !== "string" || !obj.name.trim())) {
    throw new SchemaValidationError("name must be a non-empty string");
  }
  if (obj.description !== undefined && obj.description !== null && typeof obj.description !== "string") {
    throw new SchemaValidationError("description must be a string or null");
  }
  if (obj.durationMinutes !== undefined) {
    if (typeof obj.durationMinutes !== "number" || !Number.isInteger(obj.durationMinutes)) throw new SchemaValidationError("durationMinutes must be an integer");
    validateServiceDuration(obj.durationMinutes);
  }
  if (obj.status !== undefined && obj.status !== "active" && obj.status !== "inactive") {
    throw new SchemaValidationError("status must be active or inactive");
  }
  return {
    ...(obj.code !== undefined ? { code: obj.code as string } : {}),
    ...(obj.name !== undefined ? { name: obj.name as string } : {}),
    ...(obj.description !== undefined ? { description: obj.description as string | null } : {}),
    ...(obj.durationMinutes !== undefined ? { durationMinutes: obj.durationMinutes as number } : {}),
    ...(obj.status !== undefined ? { status: obj.status as "active" | "inactive" } : {}),
  };
}

export function validateServiceRequirementBody(body: unknown): ServiceRequirementInput {
  return validateRequirement(body, "requirement");
}
