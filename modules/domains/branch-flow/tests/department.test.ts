import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InvalidDepartmentCapacityError,
  DuplicateDepartmentSlugError,
  validateDepartmentCapacity,
} from "../src/department.js";

import { InMemoryBranchRepository } from "../src/in-memory-branch-repository.js";

test("validateDepartmentCapacity enforces strictly positive integers", () => {
  assert.doesNotThrow(() => validateDepartmentCapacity(1));
  assert.doesNotThrow(() => validateDepartmentCapacity(100));

  assert.throws(
    () => validateDepartmentCapacity(0),
    InvalidDepartmentCapacityError
  );
  assert.throws(
    () => validateDepartmentCapacity(-5),
    InvalidDepartmentCapacityError
  );
  assert.throws(
    () => validateDepartmentCapacity(2.5),
    InvalidDepartmentCapacityError
  );
});

test("InMemoryBranchRepository creates and queries departments under tenant containment", async () => {
  const repo = new InMemoryBranchRepository();

  const branch = await repo.createBranch({
    tenantId: "tenant-1",
    slug: "main-branch",
    name: "Main Branch",
    status: "active",
    address: "123 Main St",
    latitude: 51.5,
    longitude: -0.1,
  });

  const dept1 = await repo.createDepartment({
    tenantId: "tenant-1",
    branchId: branch.id,
    name: "Triage & Intake",
    slug: "triage",
    capacity: 10,
  });

  assert.equal(dept1.name, "Triage & Intake");
  assert.equal(dept1.capacity, 10);
  assert.equal(dept1.branchId, branch.id);

  const list = await repo.getDepartmentsByBranch(branch.id, "tenant-1");
  assert.equal(list.length, 1);
  assert.equal(list[0]?.id, dept1.id);

  // Tenant isolation test
  const wrongTenantList = await repo.getDepartmentsByBranch(branch.id, "tenant-2");
  assert.equal(wrongTenantList.length, 0);
});

test("InMemoryBranchRepository rejects duplicate department slug in same branch", async () => {
  const repo = new InMemoryBranchRepository();

  const branch = await repo.createBranch({
    tenantId: "tenant-1",
    slug: "main-branch",
    name: "Main Branch",
    status: "active",
    address: "123 Main St",
    latitude: 51.5,
    longitude: -0.1,
  });

  await repo.createDepartment({
    tenantId: "tenant-1",
    branchId: branch.id,
    name: "Consultation A",
    slug: "consultation",
    capacity: 5,
  });

  await assert.rejects(
    () =>
      repo.createDepartment({
        tenantId: "tenant-1",
        branchId: branch.id,
        name: "Consultation B",
        slug: "consultation",
        capacity: 8,
      }),
    DuplicateDepartmentSlugError
  );
});

test("InMemoryBranchRepository rejects invalid department capacity on create and update", async () => {
  const repo = new InMemoryBranchRepository();

  const branch = await repo.createBranch({
    tenantId: "tenant-1",
    slug: "main-branch",
    name: "Main Branch",
    status: "active",
    address: "123 Main St",
    latitude: 51.5,
    longitude: -0.1,
  });

  await assert.rejects(
    () =>
      repo.createDepartment({
        tenantId: "tenant-1",
        branchId: branch.id,
        name: "Invalid Dept",
        slug: "invalid",
        capacity: 0,
      }),
    InvalidDepartmentCapacityError
  );

  const dept = await repo.createDepartment({
    tenantId: "tenant-1",
    branchId: branch.id,
    name: "Valid Dept",
    slug: "valid",
    capacity: 5,
  });

  await assert.rejects(
    () =>
      repo.updateDepartment(dept.id, "tenant-1", { capacity: -1 }),
    InvalidDepartmentCapacityError
  );
});
