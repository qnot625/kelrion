import type { Holiday, OperatingWindow } from "./branch.js";

export interface TimeSlot {
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface ExistingBookingSlot {
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface AvailabilityQueryOptions {
  /** Target start date/time (UTC) for the availability calculation window */
  readonly startDate: Date;
  /** Target end date/time (UTC) for the availability calculation window */
  readonly endDate: Date;
  /** Service duration in minutes */
  readonly serviceDurationMinutes: number;
  /** Step interval between slot starts in minutes (defaults to serviceDurationMinutes) */
  readonly slotIntervalMinutes?: number;
  /** Active weekly operating windows for the branch */
  readonly operatingWindows: readonly OperatingWindow[];
  /** Exceptional closed holidays (tenant-wide or branch-specific) */
  readonly holidays?: readonly Holiday[];
  /** List of existing active bookings/appointments */
  readonly existingBookings?: readonly ExistingBookingSlot[];
  /** Maximum concurrent capacity for the department/branch (defaults to 1) */
  readonly maxCapacity?: number;
}

/**
 * Validates and sanitizes availability query options.
 * Throws explicit Error if inputs are invalid or malformed.
 */
export function validateAvailabilityQueryOptions(options: AvailabilityQueryOptions): AvailabilityQueryOptions {
  if (!options || typeof options !== "object") {
    throw new Error("AvailabilityQueryOptions must be an object");
  }

  const startDate = options.startDate instanceof Date ? options.startDate : new Date(options.startDate);
  const endDate = options.endDate instanceof Date ? options.endDate : new Date(options.endDate);

  if (isNaN(startDate.getTime())) {
    throw new Error("Invalid startDate: must be a valid Date");
  }
  if (isNaN(endDate.getTime())) {
    throw new Error("Invalid endDate: must be a valid Date");
  }
  if (endDate.getTime() <= startDate.getTime()) {
    throw new Error("endDate must be after startDate");
  }

  if (
    typeof options.serviceDurationMinutes !== "number" ||
    !Number.isInteger(options.serviceDurationMinutes) ||
    options.serviceDurationMinutes <= 0 ||
    options.serviceDurationMinutes > 480
  ) {
    throw new Error("serviceDurationMinutes must be an integer between 1 and 480");
  }

  if (options.slotIntervalMinutes !== undefined) {
    if (
      typeof options.slotIntervalMinutes !== "number" ||
      !Number.isInteger(options.slotIntervalMinutes) ||
      options.slotIntervalMinutes <= 0
    ) {
      throw new Error("slotIntervalMinutes must be a positive integer");
    }
  }

  if (options.maxCapacity !== undefined) {
    if (
      typeof options.maxCapacity !== "number" ||
      !Number.isInteger(options.maxCapacity) ||
      options.maxCapacity <= 0
    ) {
      throw new Error("maxCapacity must be a positive integer");
    }
  }

  if (!Array.isArray(options.operatingWindows)) {
    throw new Error("operatingWindows must be an array");
  }

  for (const win of options.operatingWindows) {
    if (
      typeof win.dayOfWeek !== "number" ||
      !Number.isInteger(win.dayOfWeek) ||
      win.dayOfWeek < 0 ||
      win.dayOfWeek > 6
    ) {
      throw new Error("Operating window dayOfWeek must be an integer between 0 and 6");
    }
    if (
      typeof win.openMinutes !== "number" ||
      !Number.isInteger(win.openMinutes) ||
      win.openMinutes < 0 ||
      win.openMinutes >= 1440
    ) {
      throw new Error("Operating window openMinutes must be an integer between 0 and 1439");
    }
    if (
      typeof win.closeMinutes !== "number" ||
      !Number.isInteger(win.closeMinutes) ||
      win.closeMinutes <= 0 ||
      win.closeMinutes > 1440
    ) {
      throw new Error("Operating window closeMinutes must be an integer between 1 and 1440");
    }
    if (win.closeMinutes <= win.openMinutes) {
      throw new Error("Operating window closeMinutes must be greater than openMinutes");
    }
  }

  const holidays = (options.holidays || []).map((h) => {
    const startAt = h.startAt instanceof Date ? h.startAt : new Date(h.startAt);
    const endAt = h.endAt instanceof Date ? h.endAt : new Date(h.endAt);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw new Error("Holiday startAt and endAt must be valid Dates");
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new Error("Holiday endAt must be after startAt");
    }
    return { ...h, startAt, endAt };
  });

  const existingBookings = (options.existingBookings || []).map((b) => {
    const startAt = b.startAt instanceof Date ? b.startAt : new Date(b.startAt);
    const endAt = b.endAt instanceof Date ? b.endAt : new Date(b.endAt);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw new Error("Existing booking startAt and endAt must be valid Dates");
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new Error("Existing booking endAt must be after startAt");
    }
    return { ...b, startAt, endAt };
  });

  return {
    ...options,
    startDate,
    endDate,
    holidays,
    existingBookings,
  };
}

/**
 * Pure, deterministic availability calculation engine.
 * Computes available UTC time-slot intervals by calculating intersections of:
 * - Active operating windows for the specific day of week
 * - Exceptional closed holiday exclusions
 * - Maximum concurrent department/branch capacity constraints against existing bookings
 */
export function calculateAvailability(rawOptions: AvailabilityQueryOptions): TimeSlot[] {
  const options = validateAvailabilityQueryOptions(rawOptions);
  const {
    startDate,
    endDate,
    serviceDurationMinutes,
    slotIntervalMinutes,
    operatingWindows,
    holidays = [],
    existingBookings = [],
    maxCapacity = 1,
  } = options;

  const durationMs = serviceDurationMinutes * 60 * 1000;
  const stepMinutes = slotIntervalMinutes && slotIntervalMinutes > 0 ? slotIntervalMinutes : serviceDurationMinutes;
  const stepMs = stepMinutes * 60 * 1000;

  const results: TimeSlot[] = [];

  let currentStartMs = startDate.getTime();
  const endLimitMs = endDate.getTime();

  while (currentStartMs + durationMs <= endLimitMs) {
    const slotStart = new Date(currentStartMs);
    const slotEnd = new Date(currentStartMs + durationMs);

    // 1. Check operating windows
    const dayOfWeek = slotStart.getUTCDay();
    const slotStartMinutes = slotStart.getUTCHours() * 60 + slotStart.getUTCMinutes();
    const slotEndMinutes = slotStartMinutes + serviceDurationMinutes;

    const isWithinOperatingWindow = operatingWindows.some(
      (window) =>
        window.dayOfWeek === dayOfWeek &&
        slotStartMinutes >= window.openMinutes &&
        slotEndMinutes <= window.closeMinutes
    );

    if (isWithinOperatingWindow) {
      // 2. Check holiday exclusions
      const intersectsHoliday = holidays.some((holiday) => {
        const hStart = holiday.startAt.getTime();
        const hEnd = holiday.endAt.getTime();
        return slotStart.getTime() < hEnd && slotEnd.getTime() > hStart;
      });

      if (!intersectsHoliday) {
        // 3. Check existing booking capacity
        const overlappingBookingsCount = existingBookings.filter((booking) => {
          const bStart = booking.startAt.getTime();
          const bEnd = booking.endAt.getTime();
          return slotStart.getTime() < bEnd && slotEnd.getTime() > bStart;
        }).length;

        if (overlappingBookingsCount < maxCapacity) {
          results.push({
            startAt: slotStart,
            endAt: slotEnd,
          });
        }
      }
    }

    currentStartMs += stepMs;
  }

  return results;
}
