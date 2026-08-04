import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateLoadLevel,
  InMemoryBranchRepository,
} from "../src/index.js";

test("calculateLoadLevel correctly categorizes capacity load thresholds", () => {
  // Low load (<= 40%)
  assert.equal(calculateLoadLevel(0, 10), "low");
  assert.equal(calculateLoadLevel(2, 10), "low");
  assert.equal(calculateLoadLevel(4, 10), "low");

  // Medium load (41% - 80%)
  assert.equal(calculateLoadLevel(5, 10), "medium");
  assert.equal(calculateLoadLevel(8, 10), "medium");

  // High load (> 80%)
  assert.equal(calculateLoadLevel(9, 10), "high");
  assert.equal(calculateLoadLevel(10, 10), "high");
  assert.equal(calculateLoadLevel(15, 10), "high");

  // Edge case: zero capacity
  assert.equal(calculateLoadLevel(0, 0), "high");
});

test("InMemoryBranchRepository aggregates branch capacity with strict tenant isolation", async () => {
  const repo = new InMemoryBranchRepository();
  const tenant1 = "tenant-1";
  const tenant2 = "tenant-2";

  // Create branches for tenant1
  const b1 = await repo.createBranch({
    tenantId: tenant1,
    slug: "branch-1",
    name: "Central Clinic",
    status: "active",
    address: "123 Main St",
    latitude: 51.5074,
    longitude: -0.1278,
  });

  const b2 = await repo.createBranch({
    tenantId: tenant1,
    slug: "branch-2",
    name: "Westside Clinic",
    status: "active",
    address: "456 West St",
    latitude: 51.5100,
    longitude: -0.1300,
  });

  // Create branch for tenant2
  await repo.createBranch({
    tenantId: tenant2,
    slug: "branch-t2",
    name: "Other Tenant Clinic",
    status: "active",
    address: "789 East St",
    latitude: 51.5200,
    longitude: -0.1400,
  });

  // Add departments to branch 1 (total capacity: 15)
  await repo.createDepartment({
    tenantId: tenant1,
    branchId: b1.id,
    name: "Reception",
    slug: "reception",
    capacity: 5,
  });
  await repo.createDepartment({
    tenantId: tenant1,
    branchId: b1.id,
    name: "Consultation",
    slug: "consultation",
    capacity: 10,
  });

  // Assign service to branch 1
  repo.setBranchServiceMapping(tenant1, b1.id, "service-general");

  // Fetch aggregates for tenant1
  const tenant1Aggregates = await repo.getBranchCapacityAggregates(tenant1);
  assert.equal(tenant1Aggregates.length, 2);

  const b1Agg = tenant1Aggregates.find((a) => a.branchId === b1.id);
  assert.ok(b1Agg);
  assert.equal(b1Agg.totalCapacity, 15);
  assert.deepEqual(b1Agg.offeredServiceIds, ["service-general"]);

  const b2Agg = tenant1Aggregates.find((a) => a.branchId === b2.id);
  assert.ok(b2Agg);
  assert.equal(b2Agg.totalCapacity, 0);

  // Service filter check
  const filteredAggregates = await repo.getBranchCapacityAggregates(tenant1, "service-general");
  assert.equal(filteredAggregates.length, 1);
  assert.equal(filteredAggregates[0].branchId, b1.id);

  // Tenant isolation check
  const tenant2Aggregates = await repo.getBranchCapacityAggregates(tenant2);
  assert.equal(tenant2Aggregates.length, 1);
  assert.equal(tenant2Aggregates[0].branchName, "Other Tenant Clinic");
});

test("discoverBranches prioritizes low-load branches over high-load and sorts by distance", async () => {
  const repo = new InMemoryBranchRepository();
  const tenantId = "tenant-routing";

  // Low load branch (capacity 10, 2 active bookings = 20% load)
  const bLow = await repo.createBranch({
    tenantId,
    slug: "b-low",
    name: "Low Load Branch",
    status: "active",
    address: "Low St",
    latitude: 51.5000,
    longitude: -0.1000,
  });
  await repo.createDepartment({ tenantId, branchId: bLow.id, name: "Dept", slug: "dept", capacity: 10 });
  repo.setActiveBookingsCount(tenantId, bLow.id, 2);

  // High load branch (capacity 10, 9 active bookings = 90% load)
  const bHigh = await repo.createBranch({
    tenantId,
    slug: "b-high",
    name: "High Load Branch",
    status: "active",
    address: "High St",
    latitude: 51.5010, // closer coordinates
    longitude: -0.1010,
  });
  await repo.createDepartment({ tenantId, branchId: bHigh.id, name: "Dept", slug: "dept", capacity: 10 });
  repo.setActiveBookingsCount(tenantId, bHigh.id, 9);

  const discovered = await (await import("../src/index.js")).discoverBranches(repo, tenantId, {
    latitude: 51.5005,
    longitude: -0.1005,
  });

  assert.equal(discovered.length, 2);
  assert.equal(discovered[0].branchId, bLow.id);
  assert.equal(discovered[0].loadLevel, "low");
  assert.equal(discovered[1].branchId, bHigh.id);
  assert.equal(discovered[1].loadLevel, "high");
  assert.ok(typeof discovered[0].distanceKm === "number");
});

