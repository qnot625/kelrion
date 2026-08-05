# Klerion Engineering Design Specification: TSK-EMP-006 — Employee Directory Component & End-to-End Test Suite

**Task ID**: TSK-EMP-006  
**Task Name**: Employee Directory Component & End-to-End Test Suite  
**Milestone**: Milestone 5 — Employee Directory & Attendance UI  
**Author**: Developer 3 (Workforce Core, Employee Master Records, Time & Attendance)  
**Date**: 2026-08-01  
**Status**: DESIGN COMPLETE — AWAITING PHASE 3 ARCHITECTURE REVIEW & PHASE 4 APPROVAL  

---

## 1. Purpose & Scope

### 1.1 Purpose
`TSK-EMP-006 — Employee Directory Component & End-to-End Test Suite` provides automated frontend testing coverage for the Employee Directory view (`EmployeeDirectoryView.tsx`) and its interactive modal dialogs delivered in `TSK-EMP-005`.

While domain logic in `@adminops/workforce-core` (33 unit tests) and REST API endpoints in `@adminops/api` (19 integration tests) maintain 100% test pass rates, `apps/web` currently has zero frontend automated component or view integration tests. TSK-EMP-006 fills this coverage gap by creating a lightweight, automated frontend test suite in `apps/web` without adding heavy external browser binaries or destabilizing existing project build pipelines.

### 1.2 Deliverables
1. **Frontend Test Suite**: `apps/web/tests/employee-directory.test.ts` providing automated test coverage for:
   - `hasPermission` RBAC evaluation helper function across `owner`, `staff`, `member`, and custom role arrays.
   - `EmployeeDirectoryView` container state rendering, search debounce, department/status filter evaluation, and pagination state.
   - Table vs Grid view mode rendering switchers.
   - Modal form workflows (`CreateEmployeeModal`, `EditEmployeeModal`, `AssignManagerModal`, `UpdateStatusModal`, `DeleteEmployeeModal`).
   - Circular reporting hierarchy error response handling (HTTP 409 / domain error catching).
   - Multi-tenant request header injection verification and Demo mode vs Live mode fallbacks.
2. **Workspace Test Command**: Configured `npm test` script in `apps/web/package.json` integrated into the monorepo-wide test runner command (`npm test`).

---

## 2. Existing Test Architecture & Current Coverage

### 2.1 Workspace Overview
- **Monorepo Structure**: npm workspaces with Node.js native test runner (`node --import tsx --test`).
- **Domain Package (`@adminops/workforce-core`)**: 33 unit tests covering aggregates, domain events, value objects, `EmployeeService`, and circular manager hierarchy algorithms.
- **Persistence Package (`@adminops/persistence`)**: PGlite in-memory database tests covering Drizzle ORM schema and `postgres-employee-repository.ts`.
- **API Package (`@adminops/api`)**: 19 integration tests using Fastify `inject()` covering REST endpoints, tenant middleware, RBAC enforcement, and audit logs.
- **Frontend Package (`apps/web`)**: React 19 + Vite 8. Currently lacks test execution scripts and test files.

---

## 3. Proposed Frontend Test Architecture

### 3.1 Harness Strategy
To align with the project's zero-heavy-binary constraint and leverage Node.js 22 native test runner (`node --import tsx --test`), the frontend testing strategy for `apps/web` will utilize a mock-driven, React component unit and integration testing harness in `apps/web/tests/employee-directory.test.ts`.

### 3.2 Mock & Fixture Strategy
- **Session Fixtures**:
  - `OWNER_SESSION`: `{ tenantSlug: "test-tenant", roles: ["owner"], mode: "demo" }`
  - `STAFF_SESSION`: `{ tenantSlug: "test-tenant", roles: ["staff"], mode: "demo" }`
  - `MEMBER_SESSION`: `{ tenantSlug: "test-tenant", roles: ["member"], mode: "demo" }`
- **Employee Dataset Fixtures**: Mock collection of `ApiEmployee` entities representing active, on-leave, suspended, and terminated employees across various departments.
- **API Mocking**: Mocking `klerionApi` methods (`listEmployees`, `createEmployee`, `updateEmployee`, `assignManager`, `updateEmployeeStatus`, `deleteEmployee`) to test success, validation failures, and HTTP error handling.

---

## 4. Component Test Design

### 4.1 `EmployeeDirectoryView` Main View
- **Search & Filtering**: Tests verifying that input query strings filter employees by name, email, or employee number; department dropdowns filter by department ID; status dropdowns filter by `employmentStatus`.
- **View Toggle**: Tests verifying state transitions between `"table"` and `"grid"` presentation modes.
- **Pagination**: Tests verifying limit/offset calculation, Previous/Next page button disabling logic, and total count text calculation.

### 4.2 `CreateEmployeeModal`
- **Required Fields**: Tests checking validation of `employeeNumber`, `firstName`, `lastName`, `email`, and `hireDate`.
- **API Submission**: Tests checking proper formatting of `POST /employees` request body and updating state upon success.

### 4.3 `EditEmployeeModal`
- **Pre-Population**: Tests verifying that existing employee properties populate form inputs.
- **Disabled Inputs**: Verification that `employeeNumber` remains disabled during editing.

### 4.4 `AssignManagerModal`
- **Manager Filtering**: Verification that the current employee and terminated employees are excluded from the manager candidates dropdown.
- **Circular Hierarchy Error**: Verification that receiving a HTTP 409 or circular reporting hierarchy error from the backend renders the inline error alert.

### 4.5 `UpdateStatusModal`
- **Action Options**: Verification of lifecycle transitions (`suspend`, `reactivate`, `terminate`).
- **Conditional Fields**: Verification that selecting `terminate` requires a termination date input field.

### 4.6 `DeleteEmployeeModal`
- **Destructive Confirmation**: Verification that confirming deletion triggers `deleteEmployee` API call and removes the employee record from UI state.

---

## 5. RBAC & Multi-Tenant Test Strategy

### 5.1 RBAC Control Verification
- **Owner Role**: Full access to all action buttons (Add Employee, Edit, Manager, Status, Delete).
- **Staff Role**: Access to Add, Edit, Manager, Status buttons. Delete button suppressed.
- **Member Role**: Read-only view. All mutating action buttons completely suppressed from DOM. Access restricted banner shown when `employees:read` permission is missing.

### 5.2 Multi-Tenant Header & Demo Mode Verification
- Verification that requests pass `tenantSlug` in `X-Tenant-Slug` header.
- Verification that when `session.mode === "demo"`, state mutations execute against in-memory state without HTTP failures.

---

## 6. Accessibility & UI Interaction Test Strategy

- **Form Labels**: Verification that all modal input controls possess explicit labels and accessible name bindings.
- **Status Contrast**: Verification that status badges use high-contrast color classes for screen readability (`active`, `on_leave`, `suspended`, `terminated`).
- **Keyboard & Modal Backdrop**: Verification that clicking backdrop overlay or close button closes active modals.

---

## 7. Performance & Future Integration

- **Debounce Buffer**: Verification of 300ms search input debouncing to avoid API thrashing.
- **Minimal Rerenders**: Server-driven pagination maintaining max 10 DOM rows/cards per view page.
- **Future Integration**: Ensures Employee Directory state DTOs remain 100% compatible with upcoming Attendance UI (M5/M6) and Workforce Analytics (M9).

---

## 8. Implementation Scope Lock (MANDATORY)

### 8.1 In Scope
- Creating `apps/web/tests/employee-directory.test.ts`.
- Updating `apps/web/package.json` to add `"test": "node --import tsx --test tests/**/*.test.ts"` test script.
- Integrating `apps/web` into the monorepo root test script (`npm test`).

### 8.2 Out of Scope
- **STRICTLY FORBIDDEN**: Modifying backend packages (`@adminops/workforce-core`, `@adminops/persistence`, `@adminops/api`).
- **STRICTLY FORBIDDEN**: Modifying production business logic in `apps/web/src/views/EmployeeDirectoryView.tsx` unless fixing a blocking defect discovered during test execution.
- **STRICTLY FORBIDDEN**: Installing external binary headless browser engines (Playwright/Cypress/Puppeteer) that breach container limits.
- **STRICTLY FORBIDDEN**: Modifying database schemas or REST API endpoints.

---

## 9. Risks & Mitigations

| Identified Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **DOM Environment Missing in Node Test Runner** | Medium | Use pure TypeScript unit and harness test assertions for view logic, RBAC helpers, state transitions, and API client mocks without requiring full browser binaries. |
| **Monorepo Test Command Failure** | Low | Ensure `apps/web/package.json` test script exits with code 0 upon clean execution, seamlessly passing `npm test` across all workspaces. |

---

## 10. Open Questions
- None. The scope is fully locked and aligned with Developer 3 monorepo architecture.
