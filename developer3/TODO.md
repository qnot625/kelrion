# Developer 3 Master TODO List

This document maintains the complete granular task list for Developer 3 (Workforce Core, Employee Master Records, Time & Attendance). Every task is designed to be independently buildable, reviewable, testable, and mergeable.

---

## Task Summary Table

| Task ID | Milestone | Feature Name | Priority | Complexity | Dependencies | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TSK-WFC-001** | M1 | Database Schema Definition | High | Medium | None | Completed |
| **TSK-WFC-002** | M1 | Domain Value Objects & Contracts | High | Low | TSK-WFC-001 | Completed |
| **TSK-WFC-003** | M1 | Domain Events Definition | High | Low | TSK-WFC-002 | Completed |
| **TSK-EMP-001** | M2 | Employee Aggregate & Entities | High | Medium | TSK-WFC-002 | Completed |
| **TSK-EMP-002** | M2 | Employee Domain Invariants & Rules | High | Medium | TSK-EMP-001 | Completed |
| **TSK-EMP-003** | M3 | Postgres Employee Repository | High | High | TSK-EMP-001, TSK-WFC-001 | Completed |
| **TSK-EMP-004** | M4 | Employee REST API Routes | High | High | TSK-EMP-003 | Completed |
| **TSK-EMP-005** | M5 | Employee Directory UI Component | Medium | Medium | TSK-EMP-004 | Completed |
| **TSK-EMP-006** | M5 | Employee Directory Component & End-to-End Test Suite | Medium | Medium | TSK-EMP-005 | Completed |
| **TSK-ATT-001** | M6 | Attendance Domain Aggregate & Events | High | High | TSK-WFC-002 | Completed |
| **TSK-ATT-002** | M6 | Idempotency Engine & Clock Logic | High | High | TSK-ATT-001 | Completed |
| **TSK-ATT-003** | M7 | Postgres Attendance Repository | High | High | TSK-ATT-001, TSK-WFC-001 | Completed |
| **TSK-ATT-004** | M8 | Attendance REST API & Sync Routes | High | High | TSK-ATT-003 | Completed |
| **TSK-ATT-005** | M8 | Attendance Correction Workflow API | High | Medium | TSK-ATT-004 | Completed |
| **TSK-ATT-006** | M9 | Real-time Clock-In / Clock-Out UI Widget & Local Queue Sync | Medium | High | TSK-ATT-004 | Completed |
| **TSK-ATT-007** | M9 | Attendance Timesheet & Corrections UI | Medium | Medium | TSK-ATT-005 | Completed |
| **TSK-INT-001** | M10 | Cross-Tenant & Audit Validation | High | Medium | All Tasks | Completed |

---

## Detailed Task Specifications

### Task ID: TSK-WFC-001
- **Feature**: Workforce Database Schema Definition
- **Objective**: Define Drizzle ORM database schemas for `employees`, `departments`, `positions`, `attendance_events`, `attendance_summaries`, and `attendance_corrections` in `packages/persistence/src/schema.ts`.
- **Files Expected to be Created**: None
- **Files Expected to be Modified**: `packages/persistence/src/schema.ts`, `packages/persistence/src/index.ts`
- **Dependencies**: None
- **Estimated Complexity**: Medium
- **Definition of Done**: Schema exported with primary keys, `tenant_id` column, foreign key constraints, indexes on `(tenant_id, employee_number)` and `(tenant_id, idempotency_key)`, and compilation succeeds.
- **Risks**: Syntax mismatch with Drizzle ORM postgres-core types.
- **Notes**: Ensure `tenant_id` is included on every table for multi-tenant isolation.

---

### Task ID: TSK-WFC-002
- **Feature**: Domain Value Objects & Contracts
- **Objective**: Create type definitions and contract schemas for `EmployeeRef`, `EmploymentPlacement`, `AttendanceEvent`, and `AttendanceSummary`.
- **Files Expected to be Created**: `modules/domains/workforce-core/src/types.ts`, `modules/domains/workforce-core/src/contracts.ts`
- **Files Expected to be Modified**: `modules/domains/workforce-core/src/index.ts`
- **Dependencies**: TSK-WFC-001
- **Estimated Complexity**: Low
- **Definition of Done**: Clean TypeScript interfaces and Zod validation schemas defined and exported.
- **Risks**: Type drift between persistence models and domain contracts.
- **Notes**: Must be accessible for external consumption across domain boundaries.

---

### Task ID: TSK-WFC-003
- **Feature**: Domain Events Definition
- **Objective**: Implement strong typed events `employee.created.v1`, `employee.placement_changed.v1`, `attendance.clocked_in.v1`, `attendance.clocked_out.v1`, and `attendance.exception_detected.v1`.
- **Files Expected to be Created**: `modules/domains/workforce-core/src/events.ts`
- **Files Expected to be Modified**: `modules/domains/workforce-core/src/index.ts`
- **Dependencies**: TSK-WFC-002
- **Estimated Complexity**: Low
- **Definition of Done**: Event payload interfaces defined and event factory functions provided.
- **Risks**: Payload missing required `tenantId` or `timestamp`.
- **Notes**: Follow Klerion's standard event structure (`eventId`, `tenantId`, `eventType`, `payload`, `timestamp`).

---

### Task ID: TSK-EMP-001
- **Feature**: Employee Aggregate & Entities
- **Objective**: Implement the domain aggregate `Employee` entity with methods for creation, update details, change placement, status transition, and direct reports management.
- **Files Expected to be Created**: `modules/domains/workforce-core/src/employee.ts`
- **Files Expected to be Modified**: `modules/domains/workforce-core/src/index.ts`
- **Dependencies**: TSK-WFC-002
- **Estimated Complexity**: Medium
- **Definition of Done**: Aggregate encapsulates entity state, guards invariants (e.g. self-manager prevention), and emits domain events on state change.
- **Risks**: Allowing direct state mutation without invariant checking.
- **Notes**: Immutable state getters with strict mutator methods.

---

### Task ID: TSK-EMP-002
- **Feature**: Employee Domain Invariants & Rules
- **Objective**: Implement domain validators for employee duplicate checks, email validity, circular reporting hierarchy detection, and employment status transitions.
- **Files Expected to be Created**: `modules/domains/workforce-core/src/employee-rules.ts`
- **Files Expected to be Modified**: `modules/domains/workforce-core/src/employee.ts`
- **Dependencies**: TSK-EMP-001
- **Estimated Complexity**: Medium
- **Definition of Done**: Circular manager detection algorithm implemented; domain unit tests passing for all valid and invalid state transitions.
- **Risks**: Infinite recursion in tree traversal when detecting circular hierarchy.
- **Notes**: Depth limit or visited map for graph traversal safety.

---

### Task ID: TSK-EMP-003
- **Feature**: Postgres Employee Repository
- **Objective**: Create `IEmployeeRepository` interface and implement `PostgresEmployeeRepository` with Drizzle ORM query layer.
- **Files Expected to be Created**: `packages/persistence/src/postgres-employee-repository.ts`, `modules/domains/workforce-core/src/employee-repository.ts`
- **Files Expected to be Modified**: `packages/persistence/src/index.ts`
- **Dependencies**: TSK-EMP-001, TSK-WFC-001
- **Estimated Complexity**: High
- **Definition of Done**: Full CRUD, tenant-isolated lookups, employee number uniqueness checks, and department/branch filtered queries implemented.
- **Risks**: Unintended cross-tenant data access if `tenant_id` filter is omitted in subqueries.
- **Notes**: All queries must enforce `where(and(eq(schema.employees.tenantId, tenantId), ...))`.

---

### Task ID: TSK-EMP-004
- **Feature**: Employee REST API Routes
- **Objective**: Implement Fastify route handlers in `apps/api/src/routes/employees.ts` with RBAC and validation.
- **Files Expected to be Created**: `apps/api/src/routes/employees.ts`
- **Files Expected to be Modified**: `apps/api/src/routes/index.ts` or server registration
- **Dependencies**: TSK-EMP-003
- **Estimated Complexity**: High
- **Definition of Done**: Routes `/api/v1/employees` (POST, GET), `/api/v1/employees/:id` (GET, PUT), and `/api/v1/employees/:id/placement` (PUT) implemented with Zod validation, `authGuard`, `requirePermission`, and audit logging.
- **Risks**: Missing authorization checks on employee placement modifications.
- **Notes**: Require `employees:read`, `employees:write`, `employees:manage`.

---

### Task ID: TSK-EMP-005
- **Feature**: Employee Directory UI Component
- **Objective**: Build the Employee Directory view with search, filter by department/branch/status, grid/table view toggle, and pagination.
- **Files Expected to be Created**: `apps/web/src/features/employees/components/EmployeeDirectory.tsx`, `apps/web/src/features/employees/hooks/useEmployees.ts`
- **Files Expected to be Modified**: `apps/web/src/views/EmployeesView.tsx`
- **Dependencies**: TSK-EMP-004
- **Estimated Complexity**: Medium
- **Definition of Done**: Clean responsive UI rendered with Tailwind CSS, supporting loading skeleton, empty state, search filtering, and view options.
- **Risks**: Performance degradation with large employee lists.
- **Notes**: Debounce search input and handle server-side pagination.

---

### Task ID: TSK-EMP-006
- **Feature**: Employee Directory Component & End-to-End Test Suite
- **Objective**: Create comprehensive frontend component, RBAC, search/filter, pagination, modal workflow, and API mock integration tests in `apps/web`.
- **Files Expected to be Created**: `apps/web/tests/employee-directory.test.ts`
- **Files Expected to be Modified**: `apps/web/package.json`, `package.json`, `apps/web/src/lib/api.ts`
- **Dependencies**: TSK-EMP-005
- **Estimated Complexity**: Medium
- **Definition of Done**: 13/13 frontend test assertions passing via Node test runner, integrated into monorepo root `npm test`.
- **Risks**: None.
- **Notes**: Completed & verified. 0 lint errors, clean applet build.

---

### Task ID: TSK-ATT-001
- **Feature**: Attendance Domain Aggregate & Events
- **Objective**: Implement `AttendanceRecord` domain aggregate and event classes for clock operations and break handling.
- **Files Expected to be Created**: `modules/domains/workforce-core/src/attendance.ts`
- **Files Expected to be Modified**: `modules/domains/workforce-core/src/index.ts`
- **Dependencies**: TSK-WFC-002
- **Estimated Complexity**: High
- **Definition of Done**: Handles clock-in, clock-out, break-start, break-end, calculates active duration, and detects exceptions (e.g. late, missing clock-out).
- **Risks**: Shift boundary calculation edge cases (e.g., overnight shifts spanning midnight).
- **Notes**: Store timestamps in ISO 8601 UTC.

---

### Task ID: TSK-ATT-002
- **Feature**: Idempotency Engine & Clock Logic
- **Objective**: Implement offline-safe event synchronization engine utilizing client-side generated `idempotencyKey`.
- **Files Expected to be Created**: `modules/domains/workforce-core/src/attendance-sync.ts`
- **Files Expected to be Modified**: `modules/domains/workforce-core/src/index.ts`
- **Dependencies**: TSK-ATT-001
- **Estimated Complexity**: High
- **Definition of Done**: Batch sync accepts array of events, processes them in timestamp order, skips duplicate idempotency keys without throwing error, and returns sync result report.
- **Risks**: Out-of-order event delivery during batch sync.
- **Notes**: Events must be sorted by `timestamp` ascending before applying to aggregate state.

---

### Task ID: TSK-ATT-003
- **Feature**: Postgres Attendance Repository
- **Objective**: Implement `IAttendanceRepository` interface and `PostgresAttendanceRepository`.
- **Files Expected to be Created**: `packages/persistence/src/postgres-attendance-repository.ts`, `modules/domains/workforce-core/src/attendance-repository.ts`
- **Files Expected to be Modified**: `packages/persistence/src/index.ts`
- **Dependencies**: TSK-ATT-001, TSK-WFC-001
- **Estimated Complexity**: High
- **Definition of Done**: Idempotent insert of attendance events, daily summary rollups, and date-range timecard queries per employee and per tenant.
- **Risks**: Concurrent event insert with same idempotency key causing database deadlock.
- **Notes**: Use `ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`.

---

### Task ID: TSK-ATT-004
- **Feature**: Attendance REST API & Sync Routes
- **Objective**: Implement Fastify route handlers in `apps/api/src/routes/attendance.ts`.
- **Files Expected to be Created**: `apps/api/src/routes/attendance.ts`, `apps/api/tests/attendance-routes.test.ts`
- **Files Expected to be Modified**: `apps/api/src/context.ts`, `apps/api/src/server.ts`, `modules/platform/identity/src/permission.ts`, `apps/api/package.json`
- **Dependencies**: TSK-ATT-003
- **Estimated Complexity**: High
- **Definition of Done**: Routes `/attendance/clock-in` (POST), `/attendance/clock-out` (POST), `/attendance/break-start` (POST), `/attendance/break-end` (POST), `/attendance/sync` (POST), `/attendance/summary` (GET), `/attendance/employee/:id` (GET) created with Zod validation, RBAC, multi-tenant isolation, audit logging, and 100% test pass rate.
- **Risks**: Cross-tenant data leakage or batch idempotency duplicate key conflicts.
- **Notes**: Completed & verified. Phase 6 audit confirmed 100% test pass rate (21 API integration tests, 48 domain unit tests, 22 persistence tests, 13 frontend tests). 0 lint errors, clean applet build. Published Verification Report (`TSK-ATT-004_VERIFICATION_REPORT.md`) and Task Closure Report (`TSK-ATT-004_TASK_CLOSURE_REPORT.md`).

---

### Task ID: TSK-ATT-005
- **Feature**: Attendance Correction Workflow API
- **Objective**: Implement endpoints for submitting, reviewing, approving, and rejecting attendance correction requests.
- **Files Expected to be Created**: `apps/api/src/routes/attendance-corrections.ts`, `packages/persistence/src/postgres-attendance-correction-repository.ts`, `modules/domains/workforce-core/src/in-memory-attendance-correction-repository.ts`, `apps/api/tests/attendance-corrections.test.ts`
- **Files Expected to be Modified**: `apps/api/src/context.ts`, `apps/api/src/server.ts`, `packages/persistence/src/index.ts`, `modules/domains/workforce-core/src/index.ts`, `modules/domains/workforce-core/src/contracts.ts`
- **Dependencies**: TSK-ATT-004
- **Estimated Complexity**: Medium
- **Definition of Done**: Endpoints `/attendance/corrections` (POST, GET), `/attendance/corrections/:id` (GET), `/attendance/corrections/:id/approve` (POST), and `/attendance/corrections/:id/reject` (POST) created with Zod validation, manager approval permission checks (`attendance:manage`), multi-tenant isolation, audit logging (`attendance.correction_submitted`, `approved`, `rejected`), transactional aggregate status update, and 100% test pass rate.
- **Risks**: Cross-tenant record modification or invalid state re-approval.
- **Notes**: Completed & verified. Phase 6 audit confirmed 100% test pass rate across all suites, 0 lint errors, clean applet compilation. Published Verification Report (`TSK-ATT-005_VERIFICATION_REPORT.md`) and Task Closure Report (`TSK-ATT-005_TASK_CLOSURE_REPORT.md`).

---

### Task ID: TSK-ATT-006
- **Feature**: Clock-In / Clock-Out Widget UI
- **Objective**: Build interactive clock widget with real-time status indicator, break toggles, offline event queuing in LocalStorage, and sync status badge.
- **Files Expected to be Created**: `apps/web/src/features/attendance/components/ClockWidget.tsx`, `apps/web/src/features/attendance/hooks/useClockSync.ts`
- **Files Expected to be Modified**: `apps/web/src/views/AttendanceView.tsx`
- **Dependencies**: TSK-ATT-004
- **Estimated Complexity**: High
- **Definition of Done**: Responsive clock control allowing punch-in/out, break management, displaying local elapsed timer, and handling network offline/online auto-sync.
- **Risks**: Clock drift between client browser and server time.
- **Notes**: Use server timestamp for official log, browser timer for visual UI ticker.

---

### Task ID: TSK-ATT-007
- **Feature**: Attendance Timesheet & Corrections UI
- **Objective**: Build daily timesheet overview, exception list, and attendance correction request modal for employees and managers.
- **Files Expected to be Created**: `apps/web/src/features/attendance/components/TimesheetTable.tsx`, `apps/web/src/features/attendance/components/CorrectionModal.tsx`
- **Files Expected to be Modified**: `apps/web/src/views/AttendanceView.tsx`
- **Dependencies**: TSK-ATT-005
- **Estimated Complexity**: Medium
- **Definition of Done**: Display daily working hours, break durations, late/overtime flags, and allow submission & approval of punch corrections.
- **Risks**: Complex state updates when reviewing multiple correction items.
- **Notes**: Provide clear status badges (Pending, Approved, Rejected).

---

### Task ID: TSK-INT-001
- **Feature**: Cross-Tenant & Audit Validation
- **Objective**: Execute comprehensive security verification, cross-tenant isolation tests, RBAC access attempts, and audit trail verification for all Developer 3 features.
- **Files Expected to be Created**: `developer3/tests/security-validation.spec.ts`
- **Files Expected to be Modified**: `developer3/PROGRESS.md`
- **Dependencies**: All preceding tasks
- **Estimated Complexity**: Medium
- **Definition of Done**: 100% pass rate on cross-tenant isolation tests, RBAC rejection tests, and audit log generation assertions.
- **Risks**: Undetected permission leakage across tenant contexts.
- **Notes**: Final quality gate verification before milestone closure.
