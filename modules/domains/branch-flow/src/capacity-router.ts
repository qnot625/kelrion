import type { BranchRepository } from "./branch-repository.js";

export type LoadLevel = "low" | "medium" | "high";


export interface BranchCapacityAggregate {
  branchId: string;
  tenantId: string;
  branchName: string;
  status: "active" | "inactive";
  address: string;
  latitude: number;
  longitude: number;
  totalCapacity: number;
  activeBookingsCount: number;
  offeredServiceIds: string[];
}

export interface DiscoveredBranch extends BranchCapacityAggregate {
  loadLevel: LoadLevel;
  loadRatio: number;
  distanceKm?: number;
}

export interface DiscoverBranchesOptions {
  serviceId?: string;
  latitude?: number;
  longitude?: number;
  maxResults?: number;
}

/**
 * Calculates the load level category based on active bookings vs total department capacity.
 * Thresholds:
 * - Low: <= 40% (0.40)
 * - Medium: <= 80% (0.80)
 * - High: > 80% (or totalCapacity <= 0)
 */
export function calculateLoadLevel(activeBookings: number, totalCapacity: number): LoadLevel {
  if (totalCapacity <= 0) {
    return "high";
  }
  const ratio = activeBookings / totalCapacity;
  if (ratio <= 0.40) {
    return "low";
  }
  if (ratio <= 0.80) {
    return "medium";
  }
  return "high";
}

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

const LOAD_ORDER: Record<LoadLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Routes and prioritizes branches based on capacity load (low -> medium -> high),
 * distance (if coordinates supplied), and load ratio.
 */
export async function discoverBranches(
  repo: BranchRepository,
  tenantId: string,
  options: DiscoverBranchesOptions = {}
): Promise<DiscoveredBranch[]> {
  const aggregates = await repo.getBranchCapacityAggregates(tenantId, options.serviceId);

  const discovered: DiscoveredBranch[] = aggregates.map((agg) => {
    const loadLevel = calculateLoadLevel(agg.activeBookingsCount, agg.totalCapacity);
    const loadRatio = agg.totalCapacity > 0 ? agg.activeBookingsCount / agg.totalCapacity : 1.0;

    let distanceKm: number | undefined;
    if (options.latitude !== undefined && options.longitude !== undefined) {
      distanceKm = calculateHaversineDistanceKm(options.latitude, options.longitude, agg.latitude, agg.longitude);
    }

    return {
      ...agg,
      loadLevel,
      loadRatio,
      ...(distanceKm !== undefined ? { distanceKm } : {}),
    };
  });

  discovered.sort((a, b) => {
    const loadDiff = LOAD_ORDER[a.loadLevel] - LOAD_ORDER[b.loadLevel];
    if (loadDiff !== 0) {
      return loadDiff;
    }

    if (a.distanceKm !== undefined && b.distanceKm !== undefined) {
      const distDiff = a.distanceKm - b.distanceKm;
      if (distDiff !== 0) {
        return distDiff;
      }
    }

    const ratioDiff = a.loadRatio - b.loadRatio;
    if (ratioDiff !== 0) {
      return ratioDiff;
    }

    return a.branchName.localeCompare(b.branchName);
  });

  if (options.maxResults && options.maxResults > 0) {
    return discovered.slice(0, options.maxResults);
  }

  return discovered;
}

