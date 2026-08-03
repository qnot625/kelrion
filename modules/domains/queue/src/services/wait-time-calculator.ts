import { Queue } from "../aggregates/queue.js";
import { QueueTicket } from "../aggregates/queue-ticket.js";
import { TicketStatus } from "../enums/ticket-status.js";
import { QueuePriority } from "../enums/queue-priority.js";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface WaitTimeResult {
  minimumMinutes: number;
  maximumMinutes: number;
  estimatedMinutes: number;
  confidenceLevel: ConfidenceLevel;
  formattedDisplay: string;
  historicalSampleSize: number;
  effectiveAvgServiceTimeMinutes: number;
  positionInQueue: number;
}

export interface WaitTimeCalculatorConfig {
  /**
   * Default fallback service time per ticket in minutes when no history or queue default exists.
   * Default: 5 minutes.
   */
  defaultAvgServiceTimeMinutes?: number;
  /**
   * Maximum number of recent completed tickets to use for moving average calculation.
   * Default: 20 tickets.
   */
  movingAverageWindowSize?: number;
  /**
   * Minimum span between minimum and maximum range in minutes.
   * Default: 3 minutes.
   */
  minRangeSpanMinutes?: number;
  /**
   * Lower bounds factor for estimation range (e.g., 0.85 = 85% of estimated time).
   * Default: 0.85.
   */
  varianceLowerFactor?: number;
  /**
   * Upper bounds factor for estimation range (e.g., 1.25 = 125% of estimated time).
   * Default: 1.25.
   */
  varianceUpperFactor?: number;
}

const DEFAULT_CONFIG: Required<WaitTimeCalculatorConfig> = {
  defaultAvgServiceTimeMinutes: 5,
  movingAverageWindowSize: 20,
  minRangeSpanMinutes: 3,
  varianceLowerFactor: 0.85,
  varianceUpperFactor: 1.25,
};

const PRIORITY_MULTIPLIERS: Record<QueuePriority, number> = {
  [QueuePriority.EMERGENCY]: 1.5,
  [QueuePriority.APPOINTMENT]: 1.2,
  [QueuePriority.VIP]: 1.1,
  [QueuePriority.STANDARD]: 1.0,
};

export class WaitTimeCalculator {
  /**
   * Calculates historical moving average service duration in minutes from completed tickets.
   */
  static calculateMovingAverageServiceTime(
    completedTickets: QueueTicket[] = [],
    fallbackAvgMinutes = 5,
    windowSize = 20
  ): { avgMinutes: number; sampleSize: number } {
    if (!completedTickets || completedTickets.length === 0) {
      return { avgMinutes: Math.max(1, fallbackAvgMinutes), sampleSize: 0 };
    }

    const validDurationsMinutes: number[] = [];

    // Filter completed tickets and extract valid durations
    for (const ticket of completedTickets) {
      if (ticket.status !== TicketStatus.COMPLETED || !ticket.completedAt) {
        continue;
      }

      const startTimestamp = ticket.serviceStartedAt?.getTime() ?? ticket.calledAt?.getTime();
      if (!startTimestamp) {
        continue;
      }

      const endTimestamp = ticket.completedAt.getTime();
      const durationMs = endTimestamp - startTimestamp;
      const durationMinutes = durationMs / (1000 * 60);

      // Sanity check: duration must be positive and within realistic limits (<= 24 hours)
      if (durationMinutes > 0 && durationMinutes <= 1440) {
        validDurationsMinutes.push(durationMinutes);
      }
    }

    if (validDurationsMinutes.length === 0) {
      return { avgMinutes: Math.max(1, fallbackAvgMinutes), sampleSize: 0 };
    }

    // Take the most recent N completed tickets
    const recentDurations = validDurationsMinutes.slice(-windowSize);
    const sum = recentDurations.reduce((acc, curr) => acc + curr, 0);
    const avg = sum / recentDurations.length;

    return {
      avgMinutes: Math.max(1, Math.round(avg * 10) / 10), // Round to 1 decimal place, min 1 min
      sampleSize: recentDurations.length,
    };
  }

  /**
   * Estimates wait time for a ticket or queue position.
   */
  static calculateWaitTime(options: {
    queue: Queue;
    targetTicket?: QueueTicket;
    waitingTickets?: QueueTicket[];
    inServiceTickets?: QueueTicket[];
    completedTickets?: QueueTicket[];
    activeCounters?: number;
    isQueuePaused?: boolean;
    config?: WaitTimeCalculatorConfig;
  }): WaitTimeResult {
    const {
      queue,
      targetTicket,
      waitingTickets = [],
      completedTickets = [],
      activeCounters = 1,
      isQueuePaused = false,
    } = options;

    const config = { ...DEFAULT_CONFIG, ...options.config };
    const effectiveCounters = Math.max(1, activeCounters);

    // Queue inactive or paused
    if (!queue.isActive) {
      return {
        minimumMinutes: 0,
        maximumMinutes: 0,
        estimatedMinutes: 0,
        confidenceLevel: "HIGH",
        formattedDisplay: "Queue Inactive",
        historicalSampleSize: 0,
        effectiveAvgServiceTimeMinutes: queue.avgServiceTimeMinutes || config.defaultAvgServiceTimeMinutes,
        positionInQueue: 0,
      };
    }

    if (isQueuePaused) {
      return {
        minimumMinutes: 0,
        maximumMinutes: 0,
        estimatedMinutes: 0,
        confidenceLevel: "HIGH",
        formattedDisplay: "Queue Paused",
        historicalSampleSize: 0,
        effectiveAvgServiceTimeMinutes: queue.avgServiceTimeMinutes || config.defaultAvgServiceTimeMinutes,
        positionInQueue: 0,
      };
    }

    // Determine moving average service time
    const fallbackDefault = queue.avgServiceTimeMinutes > 0 ? queue.avgServiceTimeMinutes : config.defaultAvgServiceTimeMinutes;
    const { avgMinutes: avgServiceTime, sampleSize } = this.calculateMovingAverageServiceTime(
      completedTickets,
      fallbackDefault,
      config.movingAverageWindowSize
    );

    // Determine confidence level
    let confidenceLevel: ConfidenceLevel = "LOW";
    if (sampleSize >= 10) {
      confidenceLevel = "HIGH";
    } else if (sampleSize >= 3) {
      confidenceLevel = "MEDIUM";
    }

    // Filter waiting tickets
    const activeWaitingTickets = waitingTickets.filter((t) => t.status === TicketStatus.WAITING);

    // Sort waiting tickets by priority order (Emergency > Appointment > VIP > Standard)
    const sortedWaiting = Queue.sortTicketsByPriority(activeWaitingTickets);

    let positionInQueue = 0;
    let ticketsAheadCount = 0;
    let weightedQueueWorkload = 0;

    if (targetTicket) {
      // Find position of target ticket among sorted waiting tickets
      const targetIndex = sortedWaiting.findIndex((t) => t.id.equals(targetTicket.id));
      if (targetIndex >= 0) {
        positionInQueue = targetIndex + 1;
        ticketsAheadCount = targetIndex;
        // Calculate workload for tickets ahead
        const ticketsAhead = sortedWaiting.slice(0, targetIndex);
        weightedQueueWorkload = ticketsAhead.reduce((acc, t) => {
          const multiplier = PRIORITY_MULTIPLIERS[t.priority] ?? 1.0;
          return acc + multiplier;
        }, 0);
      } else if (targetTicket.status === TicketStatus.CALLED || targetTicket.status === TicketStatus.IN_SERVICE) {
        // Ticket is currently being served or called
        positionInQueue = 0;
        ticketsAheadCount = 0;
        weightedQueueWorkload = 0;
      } else {
        // Target ticket not in waiting list, assume placed at end of queue
        positionInQueue = sortedWaiting.length + 1;
        ticketsAheadCount = sortedWaiting.length;
        weightedQueueWorkload = sortedWaiting.reduce((acc, t) => acc + (PRIORITY_MULTIPLIERS[t.priority] ?? 1.0), 0);
      }
    } else {
      // General queue depth estimation for a new ticket joining at the end
      positionInQueue = sortedWaiting.length + 1;
      ticketsAheadCount = sortedWaiting.length;
      weightedQueueWorkload = sortedWaiting.reduce((acc, t) => acc + (PRIORITY_MULTIPLIERS[t.priority] ?? 1.0), 0);
    }

    // If queue is empty or customer is first/being served
    if (ticketsAheadCount === 0 && positionInQueue <= 1) {
      if (positionInQueue === 0) {
        return {
          minimumMinutes: 0,
          maximumMinutes: 0,
          estimatedMinutes: 0,
          confidenceLevel: "HIGH",
          formattedDisplay: "Currently Serving",
          historicalSampleSize: sampleSize,
          effectiveAvgServiceTimeMinutes: avgServiceTime,
          positionInQueue: 0,
        };
      }

      return {
        minimumMinutes: 0,
        maximumMinutes: Math.max(1, Math.round(avgServiceTime / effectiveCounters)),
        estimatedMinutes: Math.round((avgServiceTime / effectiveCounters) / 2),
        confidenceLevel,
        formattedDisplay: "0–5 mins",
        historicalSampleSize: sampleSize,
        effectiveAvgServiceTimeMinutes: avgServiceTime,
        positionInQueue: 1,
      };
    }

    // Calculate base estimated wait minutes
    const baseWaitMinutes = (weightedQueueWorkload * avgServiceTime) / effectiveCounters;
    const roundedEstimated = Math.round(baseWaitMinutes);

    // Calculate range boundaries
    let minMinutes = Math.floor(baseWaitMinutes * config.varianceLowerFactor);
    let maxMinutes = Math.ceil(baseWaitMinutes * config.varianceUpperFactor);

    // Ensure range span meets minimum width
    if (maxMinutes - minMinutes < config.minRangeSpanMinutes) {
      maxMinutes = minMinutes + config.minRangeSpanMinutes;
    }

    // Ensure non-negative bounds
    minMinutes = Math.max(0, minMinutes);
    maxMinutes = Math.max(minMinutes + 1, maxMinutes);

    const formattedDisplay = `${minMinutes}–${maxMinutes} mins`;

    return {
      minimumMinutes: minMinutes,
      maximumMinutes: maxMinutes,
      estimatedMinutes: roundedEstimated,
      confidenceLevel,
      formattedDisplay,
      historicalSampleSize: sampleSize,
      effectiveAvgServiceTimeMinutes: avgServiceTime,
      positionInQueue,
    };
  }
}
