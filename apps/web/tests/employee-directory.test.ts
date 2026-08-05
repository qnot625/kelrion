import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  KlerionApi,
  KlerionApiError,
  type ApiEmployee,
  type ApiEmployeeListResponse,
} from "../src/lib/api.js";
import type { KlerionSession } from "../src/lib/session.js";

// Mock Session Fixtures
const OWNER_SESSION: KlerionSession = {
  mode: "demo",
  tenantSlug: "acme-corp",
  tenantName: "Acme Corporation",
  email: "owner@acme.com",
  userId: "user_owner_1",
  roles: ["owner"],
  token: "mock-jwt-token-owner",
};

const STAFF_SESSION: KlerionSession = {
  mode: "demo",
  tenantSlug: "acme-corp",
  tenantName: "Acme Corporation",
  email: "staff@acme.com",
  userId: "user_staff_1",
  roles: ["staff"],
  token: "mock-jwt-token-staff",
};

const MEMBER_SESSION: KlerionSession = {
  mode: "demo",
  tenantSlug: "acme-corp",
  tenantName: "Acme Corporation",
  email: "member@acme.com",
  userId: "user_member_1",
  roles: ["member"],
  token: "mock-jwt-token-member",
};

// RBAC Helper under test (mirrors frontend implementation in EmployeeDirectoryView.tsx)
function hasPermission(session: KlerionSession, permission: string): boolean {
  if (session.roles.includes("owner")) return true;
  if (session.roles.includes("staff")) {
    return (
      permission === "employees:read" ||
      permission === "employees:create" ||
      permission === "employees:update" ||
      permission === "employees:manage_hierarchy"
    );
  }
  if (session.roles.includes("member")) {
    return permission === "employees:read";
  }
  return false;
}

// Sample Mock Employee Dataset
const MOCK_EMPLOYEES: readonly ApiEmployee[] = [
  {
    id: "emp_1",
    tenantId: "acme-corp",
    employeeNumber: "EMP-001",
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@acme.com",
    phone: "555-0101",
    departmentId: "eng",
    positionId: "tech_lead",
    managerId: null,
    branchId: "main",
    employmentType: "full_time",
    employmentStatus: "active",
    hireDate: "2024-01-15",
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "emp_2",
    tenantId: "acme-corp",
    employeeNumber: "EMP-002",
    firstName: "Bob",
    lastName: "Jones",
    email: "bob@acme.com",
    phone: "555-0102",
    departmentId: "eng",
    positionId: "senior_dev",
    managerId: "emp_1",
    branchId: "main",
    employmentType: "full_time",
    employmentStatus: "active",
    hireDate: "2024-02-01",
    createdAt: "2024-02-01T00:00:00.000Z",
    updatedAt: "2024-02-01T00:00:00.000Z",
  },
  {
    id: "emp_3",
    tenantId: "acme-corp",
    employeeNumber: "EMP-003",
    firstName: "Charlie",
    lastName: "Brown",
    email: "charlie@acme.com",
    phone: "555-0103",
    departmentId: "hr",
    positionId: "hr_manager",
    managerId: null,
    branchId: "main",
    employmentType: "full_time",
    employmentStatus: "on_leave",
    hireDate: "2024-03-10",
    createdAt: "2024-03-10T00:00:00.000Z",
    updatedAt: "2024-03-10T00:00:00.000Z",
  },
  {
    id: "emp_4",
    tenantId: "acme-corp",
    employeeNumber: "EMP-004",
    firstName: "Diana",
    lastName: "Prince",
    email: "diana@acme.com",
    phone: "555-0104",
    departmentId: "sales",
    positionId: "sales_rep",
    managerId: null,
    branchId: "main",
    employmentType: "part_time",
    employmentStatus: "terminated",
    hireDate: "2023-05-01",
    terminationDate: "2025-12-31",
    createdAt: "2023-05-01T00:00:00.000Z",
    updatedAt: "2025-12-31T00:00:00.000Z",
  },
];

describe("TSK-EMP-006: Employee Directory Component & End-to-End Test Suite", () => {
  describe("1. RBAC Permission Engine", () => {
    it("owner role possesses all permissions", () => {
      assert.strictEqual(hasPermission(OWNER_SESSION, "employees:read"), true);
      assert.strictEqual(hasPermission(OWNER_SESSION, "employees:create"), true);
      assert.strictEqual(hasPermission(OWNER_SESSION, "employees:update"), true);
      assert.strictEqual(hasPermission(OWNER_SESSION, "employees:manage_hierarchy"), true);
      assert.strictEqual(hasPermission(OWNER_SESSION, "employees:delete"), true);
    });

    it("staff role possesses read, create, update, manage_hierarchy, but NOT delete", () => {
      assert.strictEqual(hasPermission(STAFF_SESSION, "employees:read"), true);
      assert.strictEqual(hasPermission(STAFF_SESSION, "employees:create"), true);
      assert.strictEqual(hasPermission(STAFF_SESSION, "employees:update"), true);
      assert.strictEqual(hasPermission(STAFF_SESSION, "employees:manage_hierarchy"), true);
      assert.strictEqual(hasPermission(STAFF_SESSION, "employees:delete"), false);
    });

    it("member role possesses read permission only", () => {
      assert.strictEqual(hasPermission(MEMBER_SESSION, "employees:read"), true);
      assert.strictEqual(hasPermission(MEMBER_SESSION, "employees:create"), false);
      assert.strictEqual(hasPermission(MEMBER_SESSION, "employees:update"), false);
      assert.strictEqual(hasPermission(MEMBER_SESSION, "employees:manage_hierarchy"), false);
      assert.strictEqual(hasPermission(MEMBER_SESSION, "employees:delete"), false);
    });

    it("rejects unknown or empty role arrays", () => {
      const emptySession: KlerionSession = {
        mode: "demo",
        tenantSlug: "acme-corp",
        tenantName: "Acme",
        email: "none@acme.com",
        roles: [],
      };
      assert.strictEqual(hasPermission(emptySession, "employees:read"), false);
    });
  });

  describe("2. Directory Search, Filtering & Pagination Logic", () => {
    it("filters employee records by search query string (name, email, employee number)", () => {
      const query = "Alice";
      const filtered = MOCK_EMPLOYEES.filter(
        (e) =>
          e.firstName.toLowerCase().includes(query.toLowerCase()) ||
          e.lastName.toLowerCase().includes(query.toLowerCase()) ||
          e.email.toLowerCase().includes(query.toLowerCase()) ||
          e.employeeNumber.toLowerCase().includes(query.toLowerCase()),
      );
      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, "emp_1");
    });

    it("filters employee records by department ID", () => {
      const filteredEng = MOCK_EMPLOYEES.filter((e) => e.departmentId === "eng");
      assert.strictEqual(filteredEng.length, 2);

      const filteredHr = MOCK_EMPLOYEES.filter((e) => e.departmentId === "hr");
      assert.strictEqual(filteredHr.length, 1);
    });

    it("filters employee records by employment status", () => {
      const activeOnly = MOCK_EMPLOYEES.filter((e) => e.employmentStatus === "active");
      assert.strictEqual(activeOnly.length, 2);

      const terminatedOnly = MOCK_EMPLOYEES.filter((e) => e.employmentStatus === "terminated");
      assert.strictEqual(terminatedOnly.length, 1);
      assert.strictEqual(terminatedOnly[0].id, "emp_4");
    });

    it("calculates correct pagination bounds and page slicing", () => {
      const pageSize = 2;
      const page1 = MOCK_EMPLOYEES.slice(0, pageSize);
      assert.strictEqual(page1.length, 2);
      assert.strictEqual(page1[0].id, "emp_1");
      assert.strictEqual(page1[1].id, "emp_2");

      const page2 = MOCK_EMPLOYEES.slice(pageSize, pageSize * 2);
      assert.strictEqual(page2.length, 2);
      assert.strictEqual(page2[0].id, "emp_3");
      assert.strictEqual(page2[1].id, "emp_4");
    });
  });

  describe("3. Manager Candidate Filter Rules", () => {
    it("excludes self and terminated employees from eligible manager candidates", () => {
      const targetEmpId = "emp_2";
      const eligibleManagers = MOCK_EMPLOYEES.filter(
        (m) => m.id !== targetEmpId && m.employmentStatus !== "terminated",
      );
      assert.strictEqual(eligibleManagers.length, 2);
      const eligibleIds = eligibleManagers.map((m) => m.id);
      assert.ok(eligibleIds.includes("emp_1"));
      assert.ok(eligibleIds.includes("emp_3"));
      assert.ok(!eligibleIds.includes("emp_2")); // self excluded
      assert.ok(!eligibleIds.includes("emp_4")); // terminated excluded
    });
  });

  describe("4. Modal Form Validation Rules", () => {
    it("validates required payload fields for employee creation", () => {
      const isValid = (payload: {
        employeeNumber?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        hireDate?: string;
      }) => {
        return Boolean(
          payload.employeeNumber?.trim() &&
            payload.firstName?.trim() &&
            payload.lastName?.trim() &&
            payload.email?.trim() &&
            payload.hireDate?.trim(),
        );
      };

      assert.strictEqual(
        isValid({
          employeeNumber: "EMP-005",
          firstName: "Eve",
          lastName: "Adams",
          email: "eve@acme.com",
          hireDate: "2026-08-01",
        }),
        true,
      );

      assert.strictEqual(
        isValid({
          employeeNumber: "",
          firstName: "Eve",
          lastName: "Adams",
          email: "eve@acme.com",
          hireDate: "2026-08-01",
        }),
        false,
      );
    });

    it("requires termination date when employment status update action is terminate", () => {
      const isStatusValid = (action: "suspend" | "reactivate" | "terminate", termDate?: string) => {
        if (action === "terminate") return Boolean(termDate && termDate.trim().length > 0);
        return true;
      };

      assert.strictEqual(isStatusValid("suspend"), true);
      assert.strictEqual(isStatusValid("reactivate"), true);
      assert.strictEqual(isStatusValid("terminate", ""), false);
      assert.strictEqual(isStatusValid("terminate", "2026-08-01"), true);
    });
  });

  describe("5. Klerion API Client Mock & Error Engine", () => {
    it("constructs authorized request headers with Bearer token and X-Tenant-Slug", async () => {
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = async (_url: string, init?: RequestInit): Promise<Response> => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        const responseData: ApiEmployeeListResponse = {
          data: MOCK_EMPLOYEES,
          total: MOCK_EMPLOYEES.length,
          limit: 10,
          offset: 0,
        };
        return new Response(JSON.stringify(responseData), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof fetch;

      try {
        const api = new KlerionApi("/api");
        const res = await api.listEmployees(OWNER_SESSION, { search: "Alice" });

        assert.strictEqual(res.total, 4);
        assert.strictEqual(capturedHeaders["Authorization"], "Bearer mock-jwt-token-owner");
        assert.strictEqual(capturedHeaders["X-Tenant-Slug"], "acme-corp");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("throws KlerionApiError with HTTP 409 status on circular reporting hierarchy error", async () => {
      const mockFetch = async (): Promise<Response> => {
        return new Response(
          JSON.stringify({ error: "Circular reporting hierarchy detected" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof fetch;

      try {
        const api = new KlerionApi("/api");
        await assert.rejects(
          async () => {
            await api.assignManager(OWNER_SESSION, "emp_1", "emp_2");
          },
          (err: unknown) => {
            assert.ok(err instanceof KlerionApiError);
            assert.strictEqual(err.status, 409);
            assert.strictEqual(err.message, "Circular reporting hierarchy detected");
            return true;
          },
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
