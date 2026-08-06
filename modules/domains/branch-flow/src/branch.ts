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
  const byDay = new Map<number, OperatingWindow[]>();
  for (const window of windows) {
    if (!Number.isInteger(window.dayOfWeek) || window.dayOfWeek < 0 || window.dayOfWeek > 6) {
      throw new InvalidOperatingWindowError("dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday).");
    }
    if (!Number.isInteger(window.openMinutes) || window.openMinutes < 0 || window.openMinutes >= 1440) {
      throw new InvalidOperatingWindowError("openMinutes must be an integer between 0 and 1439 inclusive.");
    }
    if (!Number.isInteger(window.closeMinutes) || window.closeMinutes <= window.openMinutes || window.closeMinutes > 1440) {
      throw new InvalidOperatingWindowError("closeMinutes must be an integer greater than openMinutes and up to 1440 inclusive.");
    }
    const day = byDay.get(window.dayOfWeek) ?? [];
    day.push(window);
    byDay.set(window.dayOfWeek, day);
  }

  for (const day of byDay.values()) {
    const sorted = [...day].sort((a, b) => a.openMinutes - b.openMinutes);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous && current && current.openMinutes < previous.closeMinutes) {
        throw new InvalidOperatingWindowError("Operating windows on the same day must not overlap.");
      }
    }
  }
}

export function validateHolidayRange(startAt: Date, endAt: Date): void {
  if (startAt.getTime() >= endAt.getTime()) {
    throw new InvalidHolidayRangeError("Holiday startAt must be strictly before endAt.");
  }
}
