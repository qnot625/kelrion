export interface BranchRef {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: "active" | "inactive";
  address: string;
  latitude: number;
  longitude: number;
}

export interface OperatingWindow {
  dayOfWeek: number; // 0 (Sunday) to 6 (Saturday)
  openMinutes: number; // minutes from midnight (0 to 1440)
  closeMinutes: number; // minutes from midnight (0 to 1440)
}

export interface Holiday {
  id: string;
  tenantId: string;
  branchId: string | null; // null represents tenant-wide closure
  name: string;
  startAt: Date;
  endAt: Date;
}

// Custom domain-specific errors
export class InvalidCoordinateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCoordinateError";
  }
}

export class InvalidOperatingWindowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOperatingWindowError";
  }
}

export class InvalidHolidayRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidHolidayRangeError";
  }
}

export class DuplicateBranchSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateBranchSlugError";
  }
}

export class BranchNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BranchNotFoundError";
  }
}

export function validateCoordinates(latitude: number, longitude: number): void {
  if (latitude < -90 || latitude > 90) {
    throw new InvalidCoordinateError("Latitude must be between -90 and 90 degrees inclusive.");
  }
  if (longitude < -180 || longitude > 180) {
    throw new InvalidCoordinateError("Longitude must be between -180 and 180 degrees inclusive.");
  }
}

export function validateOperatingWindows(windows: OperatingWindow[]): void {
  for (const window of windows) {
    if (window.dayOfWeek < 0 || window.dayOfWeek > 6) {
      throw new InvalidOperatingWindowError("dayOfWeek must be between 0 (Sunday) and 6 (Saturday).");
    }
    if (window.openMinutes < 0 || window.openMinutes >= 1440) {
      throw new InvalidOperatingWindowError("openMinutes must be between 0 and 1439 inclusive.");
    }
    if (window.closeMinutes <= window.openMinutes || window.closeMinutes > 1440) {
      throw new InvalidOperatingWindowError("closeMinutes must be greater than openMinutes and up to 1440 inclusive.");
    }
  }
}

export function validateHolidayRange(startAt: Date, endAt: Date): void {
  if (startAt.getTime() >= endAt.getTime()) {
    throw new InvalidHolidayRangeError("Holiday startAt must be strictly before endAt.");
  }
}
