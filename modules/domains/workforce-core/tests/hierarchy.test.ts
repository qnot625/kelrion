import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EmployeeDomainError,
  validateBatchHierarchy,
  validateManagerHierarchy,
  type ManagerHierarchyProvider,
  type ManagerLookupFn,
  type ManagerNode,
} from "../src/index.js";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";

const EMP_1 = "11111111-1111-4111-8111-111111111111"; // e.g. CEO
const EMP_2 = "22222222-2222-4222-8222-222222222222"; // e.g. VP
const EMP_3 = "33333333-3333-4333-8333-333333333333"; // e.g. Director
const EMP_4 = "44444444-4444-4444-8444-444444444444"; // e.g. Manager
const EMP_5 = "55555555-5555-4555-8555-555555555555"; // e.g. Staff

class InMemoryManagerProvider implements ManagerHierarchyProvider {
  private nodes = new Map<string, ManagerNode>();

  public setNode(node: ManagerNode): void {
    this.nodes.set(node.employeeId, node);
  }

  public getNode: ManagerLookupFn = (employeeId: string, _tenantId: string) => {
    return this.nodes.get(employeeId) ?? null;
  };
}

// -----------------------------------------------------------------------------
// Positive Scenarios
// -----------------------------------------------------------------------------

test("validateManagerHierarchy: clearing manager (proposedManagerId = null) is valid", async () => {
  const provider = new InMemoryManagerProvider();

  const result = await validateManagerHierarchy({
    tenantId: TENANT_A,
    employeeId: EMP_2,
    proposedManagerId: null,
    provider,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.traversedPath, []);
});

test("validateManagerHierarchy: valid direct assignment (EMP_2 reports to EMP_1)", async () => {
  const provider = new InMemoryManagerProvider();
  provider.setNode({
    employeeId: EMP_1,
    tenantId: TENANT_A,
    managerId: null,
    employmentStatus: "active",
  });

  const result = await validateManagerHierarchy({
    tenantId: TENANT_A,
    employeeId: EMP_2,
    proposedManagerId: EMP_1,
    provider,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.traversedPath, [EMP_1]);
});

test("validateManagerHierarchy: valid linear hierarchy (EMP_5 -> EMP_4 -> EMP_3 -> EMP_2 -> EMP_1)", async () => {
  const provider = new InMemoryManagerProvider();
  provider.setNode({ employeeId: EMP_1, tenantId: TENANT_A, managerId: null, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_2, tenantId: TENANT_A, managerId: EMP_1, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_3, tenantId: TENANT_A, managerId: EMP_2, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_4, tenantId: TENANT_A, managerId: EMP_3, employmentStatus: "active" });

  const result = await validateManagerHierarchy({
    tenantId: TENANT_A,
    employeeId: EMP_5,
    proposedManagerId: EMP_4,
    provider,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.traversedPath, [EMP_4, EMP_3, EMP_2, EMP_1]);
});

test("validateManagerHierarchy: supports functional ManagerLookupFn directly", async () => {
  const lookupFn: ManagerLookupFn = (id, tId) => {
    if (id === EMP_1 && tId === TENANT_A) {
      return { employeeId: EMP_1, tenantId: TENANT_A, managerId: null, employmentStatus: "active" };
    }
    return null;
  };

  const result = await validateManagerHierarchy({
    tenantId: TENANT_A,
    employeeId: EMP_2,
    proposedManagerId: EMP_1,
    provider: lookupFn,
  });

  assert.equal(result.valid, true);
});

// -----------------------------------------------------------------------------
// Negative Invariant Scenarios
// -----------------------------------------------------------------------------

test("validateManagerHierarchy: rejects self-management (EMP_1 -> EMP_1)", async () => {
  const provider = new InMemoryManagerProvider();

  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_1,
        proposedManagerId: EMP_1,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /cannot be assigned as their own manager/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: rejects direct 2-node cycle (EMP_1 -> EMP_2 -> EMP_1)", async () => {
  const provider = new InMemoryManagerProvider();
  // EMP_2 reports to EMP_1
  provider.setNode({ employeeId: EMP_2, tenantId: TENANT_A, managerId: EMP_1, employmentStatus: "active" });

  // Try assigning EMP_2 as manager for EMP_1
  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_1,
        proposedManagerId: EMP_2,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Circular reporting hierarchy detected/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: rejects 3-node cycle (EMP_1 -> EMP_2 -> EMP_3 -> EMP_1)", async () => {
  const provider = new InMemoryManagerProvider();
  provider.setNode({ employeeId: EMP_3, tenantId: TENANT_A, managerId: EMP_2, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_2, tenantId: TENANT_A, managerId: EMP_1, employmentStatus: "active" });

  // Try assigning EMP_3 as manager for EMP_1
  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_1,
        proposedManagerId: EMP_3,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Circular reporting hierarchy detected/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: rejects deep 10-node cycle", async () => {
  const provider = new InMemoryManagerProvider();
  const ids: string[] = [];
  for (let i = 0; i < 10; i++) {
    ids.push(`a0000000-0000-4000-8000-00000000000${i}`);
  }

  // Create chain: ids[1] -> ids[2] -> ... -> ids[9] -> ids[0]
  for (let i = 1; i < 10; i++) {
    const mgr = i === 9 ? ids[0] : ids[i + 1];
    provider.setNode({ employeeId: ids[i], tenantId: TENANT_A, managerId: mgr, employmentStatus: "active" });
  }

  // Try assigning ids[9] as manager for ids[0]
  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: ids[0],
        proposedManagerId: ids[9],
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Circular reporting hierarchy detected/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: rejects proposed manager belonging to different tenant", async () => {
  const provider = new InMemoryManagerProvider();
  provider.setNode({ employeeId: EMP_1, tenantId: TENANT_B, managerId: null, employmentStatus: "active" });

  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_2,
        proposedManagerId: EMP_1,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Tenant mismatch: Proposed manager belongs to a different tenant/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: rejects ancestor belonging to different tenant", async () => {
  const provider = new InMemoryManagerProvider();
  provider.setNode({ employeeId: EMP_2, tenantId: TENANT_A, managerId: EMP_1, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_1, tenantId: TENANT_B, managerId: null, employmentStatus: "active" });

  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_3,
        proposedManagerId: EMP_2,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Tenant mismatch detected in manager chain/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: rejects non-existent manager ID", async () => {
  const provider = new InMemoryManagerProvider();

  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_2,
        proposedManagerId: EMP_1,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Proposed manager .* does not exist/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: rejects terminated employee as proposed manager", async () => {
  const provider = new InMemoryManagerProvider();
  provider.setNode({ employeeId: EMP_1, tenantId: TENANT_A, managerId: null, employmentStatus: "terminated" });

  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_2,
        proposedManagerId: EMP_1,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Cannot assign a terminated employee as manager/i);
      return true;
    }
  );
});

// -----------------------------------------------------------------------------
// Edge Cases & Safety Scenarios
// -----------------------------------------------------------------------------

test("validateManagerHierarchy: detects corrupted pre-existing loop in DB ancestor chain", async () => {
  const provider = new InMemoryManagerProvider();
  // Corrupted loop in DB: EMP_2 -> EMP_3 -> EMP_2
  provider.setNode({ employeeId: EMP_2, tenantId: TENANT_A, managerId: EMP_3, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_3, tenantId: TENANT_A, managerId: EMP_2, employmentStatus: "active" });

  // EMP_4 tries to assign EMP_2 as manager
  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_4,
        proposedManagerId: EMP_2,
        provider,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Corrupted reporting hierarchy detected in ancestor chain/i);
      return true;
    }
  );
});

test("validateManagerHierarchy: respects custom maxDepth option", async () => {
  const provider = new InMemoryManagerProvider();
  provider.setNode({ employeeId: EMP_1, tenantId: TENANT_A, managerId: null, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_2, tenantId: TENANT_A, managerId: EMP_1, employmentStatus: "active" });
  provider.setNode({ employeeId: EMP_3, tenantId: TENANT_A, managerId: EMP_2, employmentStatus: "active" });

  // Hierarchy length is 3 (EMP_3 -> EMP_2 -> EMP_1). If maxDepth = 2, it should reject
  await assert.rejects(
    async () => {
      await validateManagerHierarchy({
        tenantId: TENANT_A,
        employeeId: EMP_4,
        proposedManagerId: EMP_3,
        provider,
        options: { maxDepth: 2 },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof EmployeeDomainError);
      assert.match(err.message, /Maximum hierarchy depth of 2 exceeded/i);
      return true;
    }
  );
});

// -----------------------------------------------------------------------------
// Batch Validation Scenarios
// -----------------------------------------------------------------------------

test("validateBatchHierarchy: returns valid report for clean acyclic bulk import", async () => {
  const report = await validateBatchHierarchy({
    tenantId: TENANT_A,
    records: [
      { recordIndex: 0, employeeId: EMP_1, tenantId: TENANT_A, proposedManagerId: null },
      { recordIndex: 1, employeeId: EMP_2, tenantId: TENANT_A, proposedManagerId: EMP_1 },
      { recordIndex: 2, employeeId: EMP_3, tenantId: TENANT_A, proposedManagerId: EMP_2 },
    ],
  });

  assert.equal(report.valid, true);
  assert.equal(report.totalRecordsProcessed, 3);
  assert.equal(report.errors.length, 0);
});

test("validateBatchHierarchy: collects all errors in multi-problem import payload", async () => {
  const report = await validateBatchHierarchy({
    tenantId: TENANT_A,
    records: [
      // 0: Self management
      { recordIndex: 0, employeeId: EMP_1, tenantId: TENANT_A, proposedManagerId: EMP_1 },
      // 1: Tenant mismatch
      { recordIndex: 1, employeeId: EMP_2, tenantId: TENANT_B, proposedManagerId: EMP_1 },
      // 2 & 3: Cycle EMP_3 -> EMP_4 -> EMP_3
      { recordIndex: 2, employeeId: EMP_3, tenantId: TENANT_A, proposedManagerId: EMP_4 },
      { recordIndex: 3, employeeId: EMP_4, tenantId: TENANT_A, proposedManagerId: EMP_3 },
      // 4: Missing manager
      { recordIndex: 4, employeeId: EMP_5, tenantId: TENANT_A, proposedManagerId: "99999999-9999-4999-8999-999999999999" },
    ],
  });

  assert.equal(report.valid, false);
  assert.equal(report.totalRecordsProcessed, 5);
  assert.ok(report.errors.length >= 4);

  const errorTypes = report.errors.map((e) => e.errorType);
  assert.ok(errorTypes.includes("SELF_MANAGEMENT"));
  assert.ok(errorTypes.includes("TENANT_MISMATCH"));
  assert.ok(errorTypes.includes("CYCLE_DETECTED"));
  assert.ok(errorTypes.includes("MISSING_MANAGER"));
});
