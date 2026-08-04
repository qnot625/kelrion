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

export interface AssignServiceToBranchBody {
  serviceId: string;
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

  let requirements: ServiceRequirementInput | undefined;
  if (obj.requirements !== undefined && obj.requirements !== null) {
    if (typeof obj.requirements !== "object") {
      throw new SchemaValidationError("requirements must be an object");
    }
    const reqObj = obj.requirements as Record<string, unknown>;

    if (reqObj.photoIdRequired !== undefined && typeof reqObj.photoIdRequired !== "boolean") {
      throw new SchemaValidationError("requirements.photoIdRequired must be a boolean");
    }

    if (reqObj.minAge !== undefined && reqObj.minAge !== null) {
      if (typeof reqObj.minAge !== "number" || !Number.isInteger(reqObj.minAge) || reqObj.minAge < 0) {
        throw new SchemaValidationError("requirements.minAge must be a non-negative integer or null");
      }
    }

    if (reqObj.maxAge !== undefined && reqObj.maxAge !== null) {
      if (typeof reqObj.maxAge !== "number" || !Number.isInteger(reqObj.maxAge) || reqObj.maxAge < 0) {
        throw new SchemaValidationError("requirements.maxAge must be a non-negative integer or null");
      }
    }

    if (
      typeof reqObj.minAge === "number" &&
      typeof reqObj.maxAge === "number" &&
      reqObj.maxAge < reqObj.minAge
    ) {
      throw new SchemaValidationError("requirements.maxAge must be greater than or equal to minAge");
    }

    if (reqObj.requiredDocuments !== undefined) {
      if (!Array.isArray(reqObj.requiredDocuments) || !reqObj.requiredDocuments.every((doc) => typeof doc === "string")) {
        throw new SchemaValidationError("requirements.requiredDocuments must be an array of strings");
      }
    }

    if (reqObj.customNotes !== undefined && reqObj.customNotes !== null && typeof reqObj.customNotes !== "string") {
      throw new SchemaValidationError("requirements.customNotes must be a string or null");
    }

    requirements = {
      photoIdRequired: typeof reqObj.photoIdRequired === "boolean" ? reqObj.photoIdRequired : false,
      minAge: (reqObj.minAge as number | null | undefined) ?? null,
      maxAge: (reqObj.maxAge as number | null | undefined) ?? null,
      requiredDocuments: Array.isArray(reqObj.requiredDocuments) ? (reqObj.requiredDocuments as string[]) : [],
      customNotes: (reqObj.customNotes as string | null | undefined) ?? null,
    };
  }

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
