import {
  BranchNotFoundError,
  DuplicateBranchSlugError,
  InvalidCoordinateError,
  InvalidHolidayRangeError,
  InvalidOperatingWindowError,
  DepartmentNotFoundError,
  DuplicateDepartmentSlugError,
  InvalidDepartmentCapacityError,
} from "@adminops/branch-flow";

// ============================================================================
// UUID & SLUG REGEX & HELPERS
// ============================================================================

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_REGEX = /^[a-z0-9-]+$/;

export function isUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function isSlug(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && SLUG_REGEX.test(value);
}

export function validateUUIDParam(value: unknown, paramName = "id"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SchemaValidationError(`${paramName} must be a non-empty string`);
  }
  return value;
}

// ============================================================================
// CUSTOM SCHEMA VALIDATION ERROR
// ============================================================================

export class SchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaValidationError";
  }
}

// ============================================================================
// SHARED RESPONSE & ERROR SCHEMAS & INTERFACES
// ============================================================================

export interface SuccessResponse {
  success: true;
}

export interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const SuccessResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    success: { type: "boolean", enum: [true] },
  },
  required: ["success"],
  additionalProperties: false,
} as const;

export const ErrorResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    error: { type: "string" },
    code: { type: "string" },
    message: { type: "string" },
    details: { type: "object", additionalProperties: true },
  },
  required: ["error", "code", "message"],
  additionalProperties: false,
} as const;

export function formatErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ErrorResponse {
  return {
    error: message,
    code,
    message,
    ...(details ? { details } : {}),
  };
}

export function handleBranchDomainError(
  error: unknown,
): { status: number; body: ErrorResponse } | undefined {
  if (error instanceof SchemaValidationError) {
    return {
      status: 400,
      body: formatErrorResponse("VALIDATION_ERROR", (error as Error).message),
    };
  }
  if (error instanceof InvalidCoordinateError) {
    return {
      status: 400,
      body: formatErrorResponse("INVALID_COORDINATES", (error as Error).message),
    };
  }
  if (error instanceof InvalidOperatingWindowError) {
    return {
      status: 400,
      body: formatErrorResponse("INVALID_OPERATING_WINDOW", (error as Error).message),
    };
  }
  if (error instanceof InvalidHolidayRangeError) {
    return {
      status: 400,
      body: formatErrorResponse("INVALID_HOLIDAY_RANGE", (error as Error).message),
    };
  }
  if (error instanceof DuplicateBranchSlugError) {
    return {
      status: 409,
      body: formatErrorResponse("DUPLICATE_BRANCH_SLUG", (error as Error).message),
    };
  }
  if (error instanceof BranchNotFoundError) {
    return {
      status: 404,
      body: formatErrorResponse("BRANCH_NOT_FOUND", (error as Error).message),
    };
  }
  if (error instanceof InvalidDepartmentCapacityError) {
    return {
      status: 400,
      body: formatErrorResponse("INVALID_DEPARTMENT_CAPACITY", (error as Error).message),
    };
  }
  if (error instanceof DuplicateDepartmentSlugError) {
    return {
      status: 409,
      body: formatErrorResponse("DUPLICATE_DEPARTMENT_SLUG", (error as Error).message),
    };
  }
  if (error instanceof DepartmentNotFoundError) {
    return {
      status: 404,
      body: formatErrorResponse("DEPARTMENT_NOT_FOUND", (error as Error).message),
    };
  }
  return undefined;
}


// ============================================================================
// ROUTE PARAMETERS INTERFACES & SCHEMAS
// ============================================================================

export interface BranchIdParam {
  id: string;
}

export interface BranchIdRouteParam {
  branchId: string;
}

export interface HolidayIdParam {
  id: string;
}

export interface HolidayIdRouteParam {
  holidayId: string;
}

export const BranchIdParamSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    id: { type: "string", pattern: UUID_REGEX.source },
  },
  required: ["id"],
  additionalProperties: false,
} as const;

export const HolidayIdParamSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    id: { type: "string", pattern: UUID_REGEX.source },
  },
  required: ["id"],
  additionalProperties: false,
} as const;

export function validateBranchIdParam(params: unknown): string {
  if (!params || typeof params !== "object") {
    throw new SchemaValidationError("Route params are required");
  }
  const obj = params as Record<string, unknown>;
  const idValue = obj.id ?? obj.branchId;
  return validateUUIDParam(idValue, "branchId");
}

export function validateHolidayIdParam(params: unknown): string {
  if (!params || typeof params !== "object") {
    throw new SchemaValidationError("Route params are required");
  }
  const obj = params as Record<string, unknown>;
  const idValue = obj.id ?? obj.holidayId;
  return validateUUIDParam(idValue, "holidayId");
}

// ============================================================================
// BRANCH SCHEMAS & INTERFACES
// ============================================================================

export type BranchStatus = "active" | "inactive";

export interface CreateBranchBody {
  name: string;
  slug: string;
  address: string;
  latitude: number;
  longitude: number;
  status?: BranchStatus;
}

export interface UpdateBranchBody {
  name?: string;
  slug?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  status?: BranchStatus;
}

export interface BranchResponse {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: BranchStatus;
  address: string;
  latitude: number;
  longitude: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export type BranchCollectionResponse = BranchResponse[];

export const CreateBranchRequestSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    slug: { type: "string", minLength: 1, pattern: SLUG_REGEX.source },
    address: { type: "string", minLength: 1 },
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    status: { type: "string", enum: ["active", "inactive"] },
  },
  required: ["name", "slug", "address", "latitude", "longitude"],
  additionalProperties: false,
} as const;

export const UpdateBranchRequestSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    slug: { type: "string", minLength: 1, pattern: SLUG_REGEX.source },
    address: { type: "string", minLength: 1 },
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    status: { type: "string", enum: ["active", "inactive"] },
  },
  minProperties: 1,
  additionalProperties: false,
} as const;

export const BranchResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    id: { type: "string", pattern: UUID_REGEX.source },
    tenantId: { type: "string", pattern: UUID_REGEX.source },
    slug: { type: "string" },
    name: { type: "string" },
    status: { type: "string", enum: ["active", "inactive"] },
    address: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
    metadata: { type: "object", additionalProperties: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "tenantId", "slug", "name", "status", "address", "latitude", "longitude"],
  additionalProperties: false,
} as const;

export const BranchCollectionResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "array",
  items: BranchResponseSchema,
} as const;

export function validateCreateBranchBody(body: unknown): CreateBranchBody {
  if (!body || typeof body !== "object") {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    throw new SchemaValidationError("name is required and must be a non-empty string");
  }
  if (!isSlug(obj.slug)) {
    throw new SchemaValidationError("slug is required and must match lowercase alphanumeric characters and hyphens (^[a-z0-9-]+$)");
  }
  if (typeof obj.address !== "string" || obj.address.trim().length === 0) {
    throw new SchemaValidationError("address is required and must be a non-empty string");
  }
  if (typeof obj.latitude !== "number" || Number.isNaN(obj.latitude) || obj.latitude < -90 || obj.latitude > 90) {
    throw new SchemaValidationError("latitude is required and must be a number between -90 and 90");
  }
  if (typeof obj.longitude !== "number" || Number.isNaN(obj.longitude) || obj.longitude < -180 || obj.longitude > 180) {
    throw new SchemaValidationError("longitude is required and must be a number between -180 and 180");
  }
  if (obj.status !== undefined && obj.status !== "active" && obj.status !== "inactive") {
    throw new SchemaValidationError("status must be active or inactive");
  }

  return {
    name: obj.name,
    slug: obj.slug,
    address: obj.address,
    latitude: obj.latitude,
    longitude: obj.longitude,
    ...(obj.status !== undefined ? { status: obj.status as BranchStatus } : {}),
  };
}

export function validateUpdateBranchBody(body: unknown): UpdateBranchBody {
  if (!body || typeof body !== "object") {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;

  const hasAtLeastOneField =
    obj.name !== undefined ||
    obj.slug !== undefined ||
    obj.address !== undefined ||
    obj.latitude !== undefined ||
    obj.longitude !== undefined ||
    obj.status !== undefined;

  if (!hasAtLeastOneField) {
    throw new SchemaValidationError("At least one branch field must be provided for update");
  }

  if (obj.name !== undefined && (typeof obj.name !== "string" || obj.name.trim().length === 0)) {
    throw new SchemaValidationError("name must be a non-empty string");
  }
  if (obj.slug !== undefined && !isSlug(obj.slug)) {
    throw new SchemaValidationError("slug must match lowercase alphanumeric characters and hyphens (^[a-z0-9-]+$)");
  }
  if (obj.address !== undefined && (typeof obj.address !== "string" || obj.address.trim().length === 0)) {
    throw new SchemaValidationError("address must be a non-empty string");
  }
  if (obj.latitude !== undefined && (typeof obj.latitude !== "number" || Number.isNaN(obj.latitude) || obj.latitude < -90 || obj.latitude > 90)) {
    throw new SchemaValidationError("latitude must be a number between -90 and 90");
  }
  if (obj.longitude !== undefined && (typeof obj.longitude !== "number" || Number.isNaN(obj.longitude) || obj.longitude < -180 || obj.longitude > 180)) {
    throw new SchemaValidationError("longitude must be a number between -180 and 180");
  }
  if (obj.status !== undefined && obj.status !== "active" && obj.status !== "inactive") {
    throw new SchemaValidationError("status must be active or inactive");
  }

  return {
    ...(obj.name !== undefined ? { name: obj.name as string } : {}),
    ...(obj.slug !== undefined ? { slug: obj.slug as string } : {}),
    ...(obj.address !== undefined ? { address: obj.address as string } : {}),
    ...(obj.latitude !== undefined ? { latitude: obj.latitude as number } : {}),
    ...(obj.longitude !== undefined ? { longitude: obj.longitude as number } : {}),
    ...(obj.status !== undefined ? { status: obj.status as BranchStatus } : {}),
  };
}

// ============================================================================
// OPERATING WINDOWS SCHEMAS & INTERFACES
// ============================================================================

export interface OperatingWindowInput {
  dayOfWeek: number;
  openMinutes: number;
  closeMinutes: number;
}

export type PutOperatingWindowsBody = { windows: OperatingWindowInput[] };

export interface OperatingWindowResponse {
  dayOfWeek: number;
  openMinutes: number;
  closeMinutes: number;
}

export type OperatingWindowCollectionResponse = OperatingWindowResponse[];

export const PutOperatingWindowsRequestSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    windows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
          openMinutes: { type: "integer", minimum: 0, maximum: 1439 },
          closeMinutes: { type: "integer", minimum: 1, maximum: 1440 },
        },
        required: ["dayOfWeek", "openMinutes", "closeMinutes"],
        additionalProperties: false,
      },
    },
  },
  required: ["windows"],
  additionalProperties: false,
} as const;

export const OperatingWindowResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
    openMinutes: { type: "integer", minimum: 0, maximum: 1439 },
    closeMinutes: { type: "integer", minimum: 1, maximum: 1440 },
  },
  required: ["dayOfWeek", "openMinutes", "closeMinutes"],
  additionalProperties: false,
} as const;

export const OperatingWindowCollectionResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "array",
  items: OperatingWindowResponseSchema,
} as const;

export function validatePutOperatingWindowsBody(body: unknown): OperatingWindowInput[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SchemaValidationError("Request body is required and must be an object with { windows: [] }");
  }

  const rawArray =
    "windows" in body && Array.isArray((body as { windows: unknown }).windows)
      ? (body as { windows: unknown[] }).windows
      : undefined;

  if (!rawArray) {
    throw new SchemaValidationError("Request body must be an object containing a windows array: { windows: [] }");
  }

  return rawArray.map((item, idx) => {
    if (!item || typeof item !== "object") {
      throw new SchemaValidationError(`Operating window at index ${idx} must be an object`);
    }
    const win = item as Record<string, unknown>;

    if (
      typeof win.dayOfWeek !== "number" ||
      !Number.isInteger(win.dayOfWeek) ||
      win.dayOfWeek < 0 ||
      win.dayOfWeek > 6
    ) {
      throw new SchemaValidationError(
        `Operating window at index ${idx}: dayOfWeek must be an integer between 0 and 6`,
      );
    }
    if (
      typeof win.openMinutes !== "number" ||
      !Number.isInteger(win.openMinutes) ||
      win.openMinutes < 0 ||
      win.openMinutes > 1439
    ) {
      throw new SchemaValidationError(
        `Operating window at index ${idx}: openMinutes must be an integer between 0 and 1439`,
      );
    }
    if (
      typeof win.closeMinutes !== "number" ||
      !Number.isInteger(win.closeMinutes) ||
      win.closeMinutes < 1 ||
      win.closeMinutes > 1440
    ) {
      throw new SchemaValidationError(
        `Operating window at index ${idx}: closeMinutes must be an integer between 1 and 1440`,
      );
    }

    return {
      dayOfWeek: win.dayOfWeek,
      openMinutes: win.openMinutes,
      closeMinutes: win.closeMinutes,
    };
  });
}

// ============================================================================
// HOLIDAYS SCHEMAS & INTERFACES
// ============================================================================

export interface CreateBranchHolidayBody {
  name: string;
  startAt: string;
  endAt: string;
}

export interface CreateTenantHolidayBody {
  name: string;
  startAt: string;
  endAt: string;
  branchId?: string | null;
}

export interface HolidayResponse {
  id: string;
  tenantId: string;
  branchId: string | null;
  name: string;
  startAt: string;
  endAt: string;
}

export type HolidayCollectionResponse = HolidayResponse[];

export const CreateBranchHolidayRequestSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    startAt: { type: "string", format: "date-time" },
    endAt: { type: "string", format: "date-time" },
  },
  required: ["name", "startAt", "endAt"],
  additionalProperties: false,
} as const;

export const CreateTenantHolidayRequestSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    startAt: { type: "string", format: "date-time" },
    endAt: { type: "string", format: "date-time" },
    branchId: { type: ["string", "null"], pattern: UUID_REGEX.source },
  },
  required: ["name", "startAt", "endAt"],
  additionalProperties: false,
} as const;

export const HolidayResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    id: { type: "string", pattern: UUID_REGEX.source },
    tenantId: { type: "string", pattern: UUID_REGEX.source },
    branchId: { type: ["string", "null"], pattern: UUID_REGEX.source },
    name: { type: "string" },
    startAt: { type: "string", format: "date-time" },
    endAt: { type: "string", format: "date-time" },
  },
  required: ["id", "tenantId", "branchId", "name", "startAt", "endAt"],
  additionalProperties: false,
} as const;

export const HolidayCollectionResponseSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "array",
  items: HolidayResponseSchema,
} as const;

export function validateCreateBranchHolidayBody(body: unknown): CreateBranchHolidayBody {
  if (!body || typeof body !== "object") {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    throw new SchemaValidationError("name is required and must be a non-empty string");
  }
  if (typeof obj.startAt !== "string" || Number.isNaN(Date.parse(obj.startAt))) {
    throw new SchemaValidationError("startAt must be a valid ISO-8601 date-time string");
  }
  if (typeof obj.endAt !== "string" || Number.isNaN(Date.parse(obj.endAt))) {
    throw new SchemaValidationError("endAt must be a valid ISO-8601 date-time string");
  }

  return {
    name: obj.name,
    startAt: obj.startAt,
    endAt: obj.endAt,
  };
}

export function validateCreateTenantHolidayBody(body: unknown): CreateTenantHolidayBody {
  if (!body || typeof body !== "object") {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    throw new SchemaValidationError("name is required and must be a non-empty string");
  }
  if (typeof obj.startAt !== "string" || Number.isNaN(Date.parse(obj.startAt))) {
    throw new SchemaValidationError("startAt must be a valid ISO-8601 date-time string");
  }
  if (typeof obj.endAt !== "string" || Number.isNaN(Date.parse(obj.endAt))) {
    throw new SchemaValidationError("endAt must be a valid ISO-8601 date-time string");
  }
  if (obj.branchId !== undefined && obj.branchId !== null && !isUUID(obj.branchId)) {
    throw new SchemaValidationError("branchId must be a valid UUID string or null");
  }

  return {
    name: obj.name,
    startAt: obj.startAt,
    endAt: obj.endAt,
    ...(obj.branchId !== undefined ? { branchId: obj.branchId as string | null } : {}),
  };
}

export interface CreateDepartmentBody {
  name: string;
  slug: string;
  capacity: number;
}

export type UpdateDepartmentBody = Partial<CreateDepartmentBody>;

export function validateCreateDepartmentBody(body: unknown): CreateDepartmentBody {
  if (!body || typeof body !== "object") {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
    throw new SchemaValidationError("name is required and must be a non-empty string");
  }

  if (typeof obj.slug !== "string" || !isSlug(obj.slug)) {
    throw new SchemaValidationError("slug must be lowercase alphanumeric characters and hyphens");
  }

  if (typeof obj.capacity !== "number" || !Number.isInteger(obj.capacity) || obj.capacity < 1) {
    throw new SchemaValidationError("capacity must be a strictly positive integer (>= 1)");
  }

  return {
    name: obj.name.trim(),
    slug: obj.slug.trim(),
    capacity: obj.capacity,
  };
}


export function validateUpdateDepartmentBody(body: unknown): UpdateDepartmentBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new SchemaValidationError("Request body is required and must be an object");
  }
  const obj = body as Record<string, unknown>;
  if (obj.name === undefined && obj.slug === undefined && obj.capacity === undefined) {
    throw new SchemaValidationError("At least one department field must be provided for update");
  }
  if (obj.name !== undefined && (typeof obj.name !== "string" || obj.name.trim().length === 0)) {
    throw new SchemaValidationError("name must be a non-empty string");
  }
  if (obj.slug !== undefined && (typeof obj.slug !== "string" || !isSlug(obj.slug))) {
    throw new SchemaValidationError("slug must be lowercase alphanumeric characters and hyphens");
  }
  if (obj.capacity !== undefined && (typeof obj.capacity !== "number" || !Number.isInteger(obj.capacity) || obj.capacity < 1)) {
    throw new SchemaValidationError("capacity must be a strictly positive integer (>= 1)");
  }
  return {
    ...(obj.name !== undefined ? { name: (obj.name as string).trim() } : {}),
    ...(obj.slug !== undefined ? { slug: (obj.slug as string).trim() } : {}),
    ...(obj.capacity !== undefined ? { capacity: obj.capacity as number } : {}),
  };
}

// ============================================================================
// DISCOVERY SCHEMAS & INTERFACES
// ============================================================================

export interface DiscoverBranchesQuery {
  serviceId?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
}

export function validateDiscoverBranchesQuery(query: unknown): DiscoverBranchesQuery {
  if (!query || typeof query !== "object") {
    return {};
  }
  const obj = query as Record<string, unknown>;
  const result: DiscoverBranchesQuery = {};

  if (obj.serviceId !== undefined) {
    if (typeof obj.serviceId !== "string" || obj.serviceId.trim().length === 0) {
      throw new SchemaValidationError("serviceId must be a non-empty string");
    }
    result.serviceId = obj.serviceId.trim();
  }

  if (obj.latitude !== undefined || obj.longitude !== undefined) {
    if (obj.latitude === undefined || obj.longitude === undefined) {
      throw new SchemaValidationError("Both latitude and longitude must be provided together");
    }
    const lat = typeof obj.latitude === "string" ? parseFloat(obj.latitude) : obj.latitude;
    const lon = typeof obj.longitude === "string" ? parseFloat(obj.longitude) : obj.longitude;

    if (typeof lat !== "number" || Number.isNaN(lat) || lat < -90 || lat > 90) {
      throw new SchemaValidationError("latitude must be a valid number between -90 and 90");
    }
    if (typeof lon !== "number" || Number.isNaN(lon) || lon < -180 || lon > 180) {
      throw new SchemaValidationError("longitude must be a valid number between -180 and 180");
    }
    result.latitude = lat;
    result.longitude = lon;
  }

  if (obj.limit !== undefined) {
    const lim = typeof obj.limit === "string" ? parseInt(obj.limit, 10) : obj.limit;
    if (typeof lim !== "number" || !Number.isInteger(lim) || lim < 1) {
      throw new SchemaValidationError("limit must be a positive integer");
    }
    result.limit = lim;
  }

  return result;
}


