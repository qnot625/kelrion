# TSK-EMP-003: Postgres Employee Repository (Tenant-Isolated Persistence Layer) — Engineering Design Document

**Task ID**: TSK-EMP-003  
**Milestone**: Milestone 3 — Employee Persistence Layer  
**Domain Module**: `@adminops/workforce-core`  
**Infrastructure Package**: `@adminops/persistence`  
**Author**: Developer 3 (Senior Software Architect & DDD Engineer)  
**Date**: 2026-07-31  
**Status**: DESIGN SUBMITTED FOR REVIEW (PHASE 2)  

---

## 1. Purpose

### Problem Statement
The workforce domain (`@adminops/workforce-core`) currently features a fully verified, pure aggregate root (`Employee`) and circular manager hierarchy validation logic. However, employee aggregates are currently operating only in-memory. To support enterprise operations in Klerion (AdminOps OS), employee master records must be durably stored, queried, updated, and reconstituted from a PostgreSQL database with strict multi-tenant isolation.

### Scope
- **In-Scope**:
  - Defining the `EmployeeRepository` interface contract within `@adminops/workforce-core` (or `@adminops/persistence`).
  - Implementing `PostgresEmployeeRepository` in `@adminops/persistence` using Drizzle ORM against the `employees` table schema.
  - Bidirectional mapping between raw Postgres database rows (`employees` table) and the pure domain `Employee` aggregate root (`Employee.reconstitute`).
  - Strict tenant isolation filtering (`tenant_id`) on all queries, updates, deletes, and exists checks.
  - Implementation of `ManagerHierarchyProvider` and `ManagerLookupFn` using the Postgres repository to support circular reporting validation against live database records.
  - Domain error mapping (e.g., PostgreSQL unique constraint violations mapped to `EmployeeDomainError`, `DuplicateEmployeeNumberError`, `DuplicateEmployeeEmailError`).
  - Comprehensive unit test suite covering CRUD operations, tenant isolation protection, transaction handling, and aggregate reconstitution.
- **Out-of-Scope**:
  - HTTP REST endpoints (owned by Task TSK-EMP-004 in Milestone 4).
  - UI directory views (owned by Task TSK-EMP-005 in Milestone 5).
  - Attendance sync engine (owned by Milestone 6).

---

## 2. Repository Responsibilities

### What the Repository OWNS:
1. **Durable Persistence**: Saving new `Employee` aggregates and persisting state updates to the `employees` table in Postgres.
2. **Aggregate Reconstitution**: Loading row state from Postgres and reconstituting pure `Employee` aggregate instances using `Employee.reconstitute(state)`.
3. **Tenant Boundary Enforcement**: Guaranteeing that every query (`select`, `insert`, `update`, `delete`, `count`) includes `tenantId` in its SQL `WHERE` clause.
4. **Query & Filtering Operations**: Providing paginated listing, status filtering, department filtering, and manager lookups per tenant.
5. **Manager Hierarchy Node Lookup**: Implementing `ManagerLookupFn` to provide upward manager node state (`employeeId`, `tenantId`, `managerId`, `employmentStatus`) for circular hierarchy validation.
6. **Infrastructure Error Translation**: Intercepting low-level Postgres/Drizzle database errors (e.g. `23505` unique constraint, `23503` FK constraint) and re-throwing clear domain errors.

### What the Repository DOES NOT OWN:
1. **Business Rules & State Machine Protections**: Status transitions (`active` -> `suspended` -> `terminated`), self-management rules, and profile validation are enforced by the `Employee` aggregate root, NOT SQL triggers or repository setters.
2. **Domain Event Emission**: Domain events recorded on `employee.getUncommittedEvents()` are dispatched by application services/use-cases, not directly by `save()`.
3. **HTTP / API Concerns**: Request parsing, JSON responses, status codes, and JWT extraction reside strictly in `apps/api`.

---

## 3. DDD Repository Design & Dependency Inversion

To maintain pure domain boundaries and compliance with Clean Architecture / DDD principles:

```
+-------------------------------------------------------------+
|              Domain Layer (@adminops/workforce-core)        |
|                                                             |
|   +-----------------------+     +-----------------------+   |
|   |   Employee Aggregate  |     |  EmployeeRepository   |   |
|   |        (Entity)       |     |      (Interface)      |   |
|   +-----------------------+     +-----------------------+   |
+---------------------------------------------^---------------+
                                              | (Implements)
+---------------------------------------------|---------------+
|          Infrastructure Layer (@adminops/persistence)       |
|                                                             |
|   +-----------------------------------------------------+   |
|   |             PostgresEmployeeRepository              |   |
|   |         (Drizzle ORM + node-postgres / PGlite)       |   |
|   +-----------------------------------------------------+   |
+-------------------------------------------------------------+
```

1. **Repository Interface Location**: The `EmployeeRepository` interface and `EmployeeFilterOptions` types are exported from `@adminops/workforce-core` (or re-exported by persistence), ensuring domain code only depends on interface contracts.
2. **Infrastructure Implementation Location**: `PostgresEmployeeRepository` resides in `@adminops/persistence` alongside Drizzle ORM `employees` schema definitions.
3. **Persistence Ignorance**: The `Employee` aggregate has zero awareness of SQL, Drizzle, or PostgreSQL. Reconstitution occurs via `Employee.reconstitute(state)`.

---

## 4. Employee Aggregate Mapping Design

### Domain Aggregate (`Employee`) vs. Database Schema (`employees`)

| Employee Aggregate Field | Drizzle Table Column (`employees`) | DB Type | Nullable? | Transformation / Handling |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `id` | `uuid` | No | Direct UUID v4 string |
| `tenantId` | `tenant_id` | `uuid` | No | Direct UUID v4 string |
| `employeeNumber` | `employee_number` | `text` | No | String |
| `firstName` | `first_name` | `text` | No | String |
| `lastName` | `last_name` | `text` | No | String |
| `email` | `email` | `text` | No | String (normalized lowercase) |
| `hireDate` | `hire_date` | `text` | No | ISO Date string (`YYYY-MM-DD`) |
| `employmentType` | `employment_type` | `text` | No | `EmploymentType` enum string |
| `employmentStatus` | `employment_status` | `text` | No | `EmploymentStatus` enum string |
| `departmentId` | `department_id` | `uuid` | Yes | UUID string or `null` |
| `positionId` | `position_id` | `uuid` | Yes | UUID string or `null` |
| `managerId` | `manager_id` | `uuid` | Yes | UUID string or `null` |
| `branchId` | `branch_id` | `text` | Yes | String or `null` |
| `terminationDate` | `termination_date` | `text` | Yes | ISO Date string (`YYYY-MM-DD`) or `null` |
| `createdAt` | `created_at` | `timestamp with tz` | No | ISO Date string (`Date.toISOString()`) |
| `updatedAt` | `updated_at` | `timestamp with tz` | No | ISO Date string (`Date.toISOString()`) |

### Mapper Implementation Functions
- **`toRow(employee: Employee)`**: Converts domain `Employee` aggregate to Drizzle `InsertModel<typeof employees>`.
- **`toDomain(row: EmployeeRow)`**: Converts raw DB row into `EmployeeState` and returns `Employee.reconstitute(state)`.

---

## 5. Tenant Isolation Design

Multi-tenancy security is a critical priority in Klerion.

### Guarantees:
1. **Mandatory Context Parameter**: Every repository method requires `tenantId: string` as its first argument (or inside parameter options).
2. **SQL Predicate Enforcement**: Every single Drizzle query appends `eq(employees.tenantId, tenantId)`.
3. **Cross-Tenant Guarding**:
   ```typescript
   // Example single lookup query
   await this.db
     .select()
     .from(employees)
     .where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))
     .limit(1);
   ```
4. **Tenant Isolation Testing**: The test suite includes explicit cross-tenant negative tests verifying that Tenant A cannot read, update, or check existence of Tenant B's employees.

---

## 6. Transaction Strategy

1. **Transaction Handle Support**: `PostgresEmployeeRepository` can be instantiated with standard `Database` handle or a Drizzle transaction client `tx`.
2. **Atomic Aggregate Save**: When saving or updating an employee record, operations are executed within a single SQL statement (`INSERT ... ON CONFLICT (id) DO UPDATE` or separate `insert`/`update` queries).
3. **Batch Operations**: Bulk imports leverage Drizzle transactions (`db.transaction(async (tx) => { ... })`) to ensure atomic commit or rollback.

---

## 7. Index Strategy & Performance

The `employees` table schema in `packages/persistence/src/schema.ts` includes the following indexes:

| Index Name | Column(s) | Type | Purpose |
| :--- | :--- | :--- | :--- |
| `employees_tenant_number_key` | `(tenant_id, employee_number)` | `UNIQUE INDEX` | Prevents duplicate employee numbers per tenant; fast lookup by number |
| `employees_tenant_email_key` | `(tenant_id, email)` | `UNIQUE INDEX` | Prevents duplicate employee emails per tenant; fast lookup by email |
| `employees_tenant_status_idx` | `(tenant_id, employment_status)` | `INDEX` | Accelerates active/suspended/terminated list filtering |
| `employees_tenant_dept_idx` | `(tenant_id, department_id)` | `INDEX` | Accelerates department roster queries |
| `employees_tenant_branch_idx` | `(tenant_id, branch_id)` | `INDEX` | Accelerates branch location roster queries |

---

## 8. Error Handling & Mapping Strategy

Low-level PostgreSQL errors are intercepted and translated into structured domain/repository errors:

```typescript
try {
  // DB Operation
} catch (error) {
  if (isUniqueViolation(error)) {
    // Inspect constraint name or message
    if (error.message.includes("employee_number")) {
      throw new EmployeeDomainError(`Employee number already exists for tenant`);
    }
    if (error.message.includes("email")) {
      throw new EmployeeDomainError(`Employee email already exists for tenant`);
    }
    throw new EmployeeDomainError(`Duplicate key violation in employee persistence`);
  }
  throw error;
}
```

---

## 9. Repository API Contract (`EmployeeRepository`)

```typescript
export interface EmployeeFilterOptions {
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  branchId?: string;
  employmentStatus?: EmploymentStatus;
  search?: string; // Search across name/email/number
  limit?: number;
  offset?: number;
}

export interface EmployeeRepository {
  /** Save a new or existing Employee aggregate root. */
  save(employee: Employee): Promise<void>;

  /** Find an employee aggregate by ID within tenant boundary. */
  findById(tenantId: string, id: string): Promise<Employee | null>;

  /** Find an employee aggregate by employee number within tenant boundary. */
  findByEmployeeNumber(tenantId: string, employeeNumber: string): Promise<Employee | null>;

  /** Find an employee aggregate by email within tenant boundary. */
  findByEmail(tenantId: string, email: string): Promise<Employee | null>;

  /** List employees for a tenant with optional filters and pagination. */
  list(tenantId: string, options?: EmployeeFilterOptions): Promise<Employee[]>;

  /** Count total employees for a tenant matching filter options. */
  count(tenantId: string, options?: EmployeeFilterOptions): Promise<number>;

  /** Check if an employee ID exists within tenant boundary. */
  exists(tenantId: string, id: string): Promise<boolean>;

  /** Get manager node details for hierarchy validation. */
  getManagerNode(tenantId: string, employeeId: string): Promise<ManagerNode | null>;

  /** Delete an employee record within tenant boundary (primarily for testing/hard purge). */
  delete(tenantId: string, id: string): Promise<boolean>;
}
```

---

## 10. Testing Strategy

1. **Unit & Integration Tests (`tests/postgres-employee-repository.test.ts`)**:
   - Uses `@electric-sql/pglite` (real in-memory WASM PostgreSQL instance) to run tests fast without external database dependencies.
2. **Test Cases**:
   - `save()` & `findById()`: Creates employee via aggregate, saves to DB, fetches by ID, verifies reconstituted properties match exact state.
   - `findByEmployeeNumber()` & `findByEmail()`: Verifies tenant-scoped lookups.
   - `list()` & `count()`: Verifies pagination (`limit`, `offset`) and filters (`departmentId`, `employmentStatus`, `branchId`).
   - Tenant Isolation: Tests that Tenant B cannot access Tenant A's employee record.
   - Unique Constraint Violation: Tests duplicate employee number and email rejection.
   - `getManagerNode()` Integration: Verifies `validateManagerHierarchy` works seamlessly with `PostgresEmployeeRepository.getManagerNode`.
   - Update Persistence: Tests state mutation (`updateProfile`, `suspend`, `terminate`, `transfer`) followed by `save()` and reconstitution.

---

## 11. Migration Compatibility

The `employees` database table is already defined in `packages/persistence/src/schema.ts` and reflected in SQL migration files. The repository implementation strictly targets existing column definitions without requiring DDL migration changes.

---

## 12. Security Review

- **Tenant Isolation**: Mandatory `tenantId` parameter enforced in every query clause.
- **SQL Injection Prevention**: All queries construct parameterized SQL via Drizzle ORM query builder.
- **Data Privacy / PII**: Direct logging of PII (emails, names) is avoided in error messages; standard sanitized UUID logging used.

---

## 13. Performance Analysis

- **Single Record Lookup**: $\mathcal{O}(1)$ via primary key `(id)` and unique indexes `(tenant_id, employee_number)` / `(tenant_id, email)`.
- **Filtered Roster Query**: Accelerated by compound composite indexes (`tenant_id`, `employment_status`), (`tenant_id`, `department_id`), (`tenant_id`, `branch_id`).
- **Hierarchy Walk Overhead**: Maximum upward traversal constrained to `MAX_DEPTH = 50`. Lookups per level take $<1\text{ms}$ in PGlite / Postgres index scan.

---

## 14. Future Integration Assessment

- **Milestone 4 (REST APIs)**: `PostgresEmployeeRepository` will be injected into API route handlers (`/api/v1/employees`).
- **Milestone 5 (Frontend UI)**: Powers employee directory queries, department filters, and employee profile editing.
- **Milestone 6 (Attendance)**: Serves as the canonical source for employee clock-in validation and placement lookups.

---

## 15. Open Questions & Architectural Decisions

- **Q1**: Should domain events recorded on `employee.getUncommittedEvents()` be automatically saved to an `outbox` or `audit_events` table during `repository.save()`?
  - *Recommendation*: Keep `EmployeeRepository.save()` focused purely on employee aggregate persistence. Outbox / Audit log dispatching should be handled by an application service wrapper to preserve single responsibility.
- **Q2**: Should `PostgresEmployeeRepository` reside in `@adminops/persistence` or `@adminops/workforce-core`?
  - *Recommendation*: Place the `PostgresEmployeeRepository` implementation in `@adminops/persistence` alongside other Postgres repositories (`PostgresUserRepository`, `PostgresAppointmentRepository`), while keeping the `EmployeeRepository` interface in domain contracts.

---
TargetFile: /developer3/design/TSK-EMP-003_DESIGN.md
toolAction: Creating design document for TSK-EMP-003
toolSummary: Create TSK-EMP-003 engineering design document
