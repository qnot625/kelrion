import { EmployeeDomainError } from "./employee.js";
import type { EmploymentStatus } from "./types.js";

export const DEFAULT_MAX_HIERARCHY_DEPTH = 50;
export const ABSOLUTE_MAX_HIERARCHY_DEPTH = 100;

export interface ManagerNode {
  employeeId: string;
  tenantId: string;
  managerId: string | null;
  employmentStatus: EmploymentStatus;
}

export type ManagerLookupFn = (
  employeeId: string,
  tenantId: string
) => Promise<ManagerNode | null> | ManagerNode | null;

export interface ManagerHierarchyProvider {
  getNode: ManagerLookupFn;
}

export interface HierarchyValidationOptions {
  maxDepth?: number;
}

export interface HierarchyValidationResult {
  valid: boolean;
  reason?: string;
  traversedPath: string[];
}

export interface ValidateManagerHierarchyParams {
  tenantId: string;
  employeeId?: string | null;
  proposedManagerId: string | null;
  provider: ManagerHierarchyProvider | ManagerLookupFn;
  options?: HierarchyValidationOptions;
}

export interface BatchImportRecord {
  recordIndex: number;
  employeeId: string;
  tenantId: string;
  proposedManagerId: string | null;
  employmentStatus?: EmploymentStatus;
}

export interface BatchHierarchyValidationError {
  recordIndex: number;
  employeeId: string;
  proposedManagerId: string | null;
  errorType:
    | "CYCLE_DETECTED"
    | "MISSING_MANAGER"
    | "TENANT_MISMATCH"
    | "TERMINATED_MANAGER"
    | "SELF_MANAGEMENT"
    | "MAX_DEPTH_EXCEEDED";
  message: string;
  cyclePath?: string[];
}

export interface BatchHierarchyValidationReport {
  valid: boolean;
  totalRecordsProcessed: number;
  errors: BatchHierarchyValidationError[];
}

export interface ValidateBatchHierarchyParams {
  tenantId: string;
  records: BatchImportRecord[];
  provider?: ManagerHierarchyProvider | ManagerLookupFn;
  options?: HierarchyValidationOptions;
}

/**
  Validate a single proposed manager assignment to detect circular reporting,
  tenant boundaries, terminated manager status, and hierarchy depth caps.
 */
export async function validateManagerHierarchy(
  params: ValidateManagerHierarchyParams
): Promise<HierarchyValidationResult> {
  const { tenantId, employeeId, proposedManagerId, provider, options } = params;

  // 1. Clearing Manager (proposedManagerId is null)
  if (proposedManagerId === null) {
    return {
      valid: true,
      traversedPath: [],
    };
  }

  // 2. Self-Management Check
  if (Boolean(employeeId) && employeeId === proposedManagerId) {
    throw new EmployeeDomainError("An employee cannot be assigned as their own manager");
  }

  // Resolve lookup function from provider
  const lookupFn: ManagerLookupFn =
    typeof provider === "function" ? provider : provider.getNode.bind(provider);

  // 3. Retrieve proposed manager node
  const proposedManager = await lookupFn(proposedManagerId, tenantId);
  if (!proposedManager) {
    throw new EmployeeDomainError(`Proposed manager [${proposedManagerId}] does not exist`);
  }

  // 4. Tenant Isolation Check
  if (proposedManager.tenantId !== tenantId) {
    throw new EmployeeDomainError(
      "Tenant mismatch: Proposed manager belongs to a different tenant"
    );
  }

  // 5. Active Manager Status Check
  if (proposedManager.employmentStatus === "terminated") {
    throw new EmployeeDomainError("Cannot assign a terminated employee as manager");
  }

  // 6. Upward Ancestor Path Traversal
  const maxDepthOption = options?.maxDepth ?? DEFAULT_MAX_HIERARCHY_DEPTH;
  const maxDepth = Math.min(Math.max(1, maxDepthOption), ABSOLUTE_MAX_HIERARCHY_DEPTH);

  const visitedSet = new Set<string>();
  const traversedPath: string[] = [];

  let current: ManagerNode | null = proposedManager;

  while (current !== null) {
    // Cycle check against target employee
    if (Boolean(employeeId) && current.employeeId === employeeId) {
      throw new EmployeeDomainError(
        `Circular reporting hierarchy detected: Employee [${employeeId}] is in manager chain of [${proposedManagerId}]`
      );
    }

    // Pre-existing corruption check in visited ancestors
    if (visitedSet.has(current.employeeId)) {
      throw new EmployeeDomainError(
        "Corrupted reporting hierarchy detected in ancestor chain"
      );
    }

    visitedSet.add(current.employeeId);
    traversedPath.push(current.employeeId);

    // Check depth cap limit
    if (traversedPath.length > maxDepth) {
      throw new EmployeeDomainError(
        `Maximum hierarchy depth of ${maxDepth} exceeded or corrupted loop detected`
      );
    }

    // Advance to next manager up the chain
    if (!current.managerId) {
      break;
    }

    const nextManagerId: string = current.managerId;

    // Check if next manager is the target employee
    if (nextManagerId === employeeId) {
      throw new EmployeeDomainError(
        `Circular reporting hierarchy detected: Employee [${employeeId}] is in manager chain of [${proposedManagerId}]`
      );
    }

    const nextNode = await lookupFn(nextManagerId, tenantId);
    if (!nextNode) {
      // Tree boundary reached / missing ancestor handled gracefully as tree root
      break;
    }

    // Tenant consistency check on ancestor node
    if (nextNode.tenantId !== tenantId) {
      throw new EmployeeDomainError(
        "Tenant mismatch detected in manager chain"
      );
    }

    current = nextNode;
  }

  return {
    valid: true,
    traversedPath,
  };
}

/**
  Validate a bulk batch of manager assignments (e.g. CSV import) and collect
  all detected problems without failing fast.
 */
export async function validateBatchHierarchy(
  params: ValidateBatchHierarchyParams
): Promise<BatchHierarchyValidationReport> {
  const { tenantId, records, provider, options } = params;

  const errors: BatchHierarchyValidationError[] = [];
  const maxDepthOption = options?.maxDepth ?? DEFAULT_MAX_HIERARCHY_DEPTH;
  const maxDepth = Math.min(Math.max(1, maxDepthOption), ABSOLUTE_MAX_HIERARCHY_DEPTH);

  // Build in-memory lookup map from records
  const batchMap = new Map<string, BatchImportRecord>();
  for (const rec of records) {
    batchMap.set(rec.employeeId, rec);
  }

  const lookupFn: ManagerLookupFn | null = provider
    ? typeof provider === "function"
      ? provider
      : provider.getNode.bind(provider)
    : null;

  async function getManagerNode(id: string): Promise<{
    tenantId: string;
    managerId: string | null;
    employmentStatus: EmploymentStatus;
  } | null> {
    if (batchMap.has(id)) {
      const rec = batchMap.get(id)!;
      return {
        tenantId: rec.tenantId,
        managerId: rec.proposedManagerId,
        employmentStatus: rec.employmentStatus ?? "active",
      };
    }
    if (lookupFn) {
      const node = await lookupFn(id, tenantId);
      if (node) {
        return {
          tenantId: node.tenantId,
          managerId: node.managerId,
          employmentStatus: node.employmentStatus,
        };
      }
    }
    return null;
  }

  for (const record of records) {
    const { recordIndex, employeeId, proposedManagerId } = record;

    // Tenant check
    if (record.tenantId !== tenantId) {
      errors.push({
        recordIndex,
        employeeId,
        proposedManagerId,
        errorType: "TENANT_MISMATCH",
        message: `Record tenantId [${record.tenantId}] does not match batch tenantId [${tenantId}]`,
      });
      continue;
    }

    if (proposedManagerId === null) {
      continue;
    }

    // Self-management check
    if (employeeId === proposedManagerId) {
      errors.push({
        recordIndex,
        employeeId,
        proposedManagerId,
        errorType: "SELF_MANAGEMENT",
        message: "An employee cannot be assigned as their own manager",
      });
      continue;
    }

    const managerNode = await getManagerNode(proposedManagerId);
    if (!managerNode) {
      errors.push({
        recordIndex,
        employeeId,
        proposedManagerId,
        errorType: "MISSING_MANAGER",
        message: `Proposed manager [${proposedManagerId}] does not exist`,
      });
      continue;
    }

    if (managerNode.tenantId !== tenantId) {
      errors.push({
        recordIndex,
        employeeId,
        proposedManagerId,
        errorType: "TENANT_MISMATCH",
        message: "Proposed manager belongs to a different tenant",
      });
      continue;
    }

    if (managerNode.employmentStatus === "terminated") {
      errors.push({
        recordIndex,
        employeeId,
        proposedManagerId,
        errorType: "TERMINATED_MANAGER",
        message: "Cannot assign a terminated employee as manager",
      });
      continue;
    }

    // Upward path traversal for cycle detection in batch
    const visitedInWalk = new Set<string>();
    const path: string[] = [employeeId, proposedManagerId];
    visitedInWalk.add(employeeId);
    visitedInWalk.add(proposedManagerId);

    let currId: string | null = managerNode.managerId;

    while (currId !== null) {
      if (currId === employeeId) {
        path.push(currId);
        errors.push({
          recordIndex,
          employeeId,
          proposedManagerId,
          errorType: "CYCLE_DETECTED",
          message: `Circular reporting hierarchy detected in batch import`,
          cyclePath: path,
        });
        break;
      }

      if (visitedInWalk.has(currId)) {
        // Pre-existing or duplicate loop within walk
        path.push(currId);
        errors.push({
          recordIndex,
          employeeId,
          proposedManagerId,
          errorType: "CYCLE_DETECTED",
          message: `Corrupted cycle detected in manager chain`,
          cyclePath: path,
        });
        break;
      }

      if (path.length > maxDepth) {
        errors.push({
          recordIndex,
          employeeId,
          proposedManagerId,
          errorType: "MAX_DEPTH_EXCEEDED",
          message: `Maximum hierarchy depth of ${maxDepth} exceeded`,
          cyclePath: path,
        });
        break;
      }

      visitedInWalk.add(currId);
      path.push(currId);

      const nextNode = await getManagerNode(currId);
      if (!nextNode) {
        break;
      }
      if (nextNode.tenantId !== tenantId) {
        errors.push({
          recordIndex,
          employeeId,
          proposedManagerId,
          errorType: "TENANT_MISMATCH",
          message: "Tenant mismatch detected in manager chain",
        });
        break;
      }

      currId = nextNode.managerId;
    }
  }

  return {
    valid: errors.length === 0,
    totalRecordsProcessed: records.length,
    errors,
  };
}
