# Klerion Engineering Analysis: TSK-EMP-006 — Employee Directory Component & End-to-End Test Suite

**Task ID**: TSK-EMP-006  
**Task Name**: Employee Directory Component & End-to-End Test Suite  
**Milestone**: Milestone 5 — Employee Directory & Attendance UI  
**Author**: Developer 3 (Workforce Core, Employee Master Records, Time & Attendance)  
**Date**: 2026-08-01  
**Status**: ANALYSIS COMPLETE (Awaiting Phase 2 Design Spec Approval)  

---

## 1. Executive Summary

This engineering analysis establishes the technical foundation for `TSK-EMP-006 — Employee Directory Component & End-to-End Test Suite`. Following the completion and closure of `TSK-EMP-005` (which delivered the `EmployeeDirectoryView` frontend presentation layer and interactive modal forms), `TSK-EMP-006` focuses on designing and implementing a robust frontend testing suite.

Through direct inspection of the monorepo codebase, we evaluated existing test infrastructure across domain, persistence, API, and frontend packages. While domain logic in `@adminops/workforce-core`, database persistence in `@adminops/persistence`, and REST API endpoints in `@adminops/api` feature high unit/integration test coverage (over 50 test cases across 3 packages), the frontend package (`apps/web`) currently has **zero** component or end-to-end tests.

This analysis details the frontend architecture of `EmployeeDirectoryView.tsx`, inventories its component tree and API integration contracts, identifies critical test gaps (RBAC UI suppression, search/filtering, pagination, modal workflows, error handling, tenant isolation, demo mode fallback), and establishes the recommended scope and testing strategy for TSK-EMP-006.

---

## 2. Current Frontend Architecture

The frontend application in `apps/web` is structured as a modern, lightweight Single Page Application (SPA):
- **Framework**: React 19 (`react: 19.2.4`, `react-dom: 19.2.4`) compiled via Vite 8 (`vite: 8.0.3`, `@vitejs/plugin-react: 6.0.1`).
- **Type System**: TypeScript 5.9 (`typescript: 5.9.3`) with strict mode enabled (`tsc --noEmit`).
- **Icons**: Lucide React (`lucide-react: 1.27.0`).
- **Styling**: Standard CSS with custom design tokens (`apps/web/src/styles/views.css`), avoiding heavyweight UI libraries or inline CSS-in-JS.
- **Routing**: Single-screen layout container with stateful view switcher (`App.tsx`) controlled by header navigation (`Shell.tsx`).
- **Session & State**: `KlerionSession` object tracking user email, role array (`owner`, `staff`, `member`), tenant slug (`X-Tenant-Slug`), auth token, and execution mode (`live` vs `demo`).

---

## 3. Employee Directory Architecture Review

Inspection of `apps/web/src/views/EmployeeDirectoryView.tsx` (1,131 LOC) reveals a clean, modular structure composed of a main view component and 5 dedicated modal subcomponents:

### Main View Component (`EmployeeDirectoryView`)
- **State Management**:
  - `employees`: Array of `ApiEmployee` objects (defaults to `INITIAL_DEMO_EMPLOYEES` in demo mode or initial state).
  - `total`: Total record count for pagination.
  - `loading`: Boolean state for live data fetching and action submissions.
  - `error`: Alert banner message state.
  - `search`, `departmentFilter`, `statusFilter`: Live filter inputs.
  - `page`, `pageSize`: Pagination state (`pageSize = 10`).
  - `viewMode`: Layout switcher (`"table"` vs `"grid"`).
  - `activeModal`: Modal state (`"create" | "edit" | "manager" | "status" | "delete" | null`).
  - `selectedEmp`: Target employee for action modals.
- **RBAC Guard Function**: `hasPermission(session, permission)` checks if session roles include `owner` or `staff` with specific permissions (`employees:read`, `employees:create`, `employees:update`, `employees:manage_hierarchy`, `employees:delete`).
- **API Client Integration**: Calls methods on `klerionApi` in `apps/web/src/lib/api.ts` (`listEmployees`, `createEmployee`, `updateEmployee`, `assignManager`, `updateEmployeeStatus`, `deleteEmployee`).

### Modal Subcomponents
1. **`CreateEmployeeModal`**: Form modal for onboarding new employees. Validates `employeeNumber`, `firstName`, `lastName`, `email`, `hireDate`, `departmentId`, `positionId`, and `employmentType`.
2. **`EditEmployeeModal`**: Form modal for editing existing profile attributes (`firstName`, `lastName`, `email`, `phone`, `departmentId`, `positionId`, `employmentType`).
3. **`AssignManagerModal`**: Hierarchy assignment modal. Filters out self and terminated employees from manager dropdown. Displays backend circular reporting hierarchy errors in an error alert banner.
4. **`UpdateStatusModal`**: Employment status transition modal (`suspend`, `reactivate`, `terminate`). Prompts for audit reason justification and optional termination date.
5. **`DeleteEmployeeModal`**: Destructive confirmation modal for record deletion.

---

## 4. Existing Test Architecture

An inspection of all `package.json` files and test directories in the monorepo reveals:

| Workspace / Package | Test Runner / Framework | Script | Existing Test Files | Status |
| :--- | :--- | :--- | :--- | :--- |
| Root (`/package.json`) | Node.js Test Runner | `npm test` | Runs `npm test --workspaces --if-present` | Active |
| `@adminops/workforce-core` | Node.js Test Runner + `tsx` | `npm test -w modules/domains/workforce-core` | `contracts.test.ts`, `events.test.ts`, `employee.test.ts`, `hierarchy.test.ts`, `employee-service.test.ts` (33 tests) | PASS (100%) |
| `@adminops/persistence` | Node.js Test Runner + `PGlite` | `npm test -w packages/persistence` | `workforce-schema.test.ts`, `postgres-employee-repository.test.ts` | PASS (100%) |
| `@adminops/api` | Node.js Test Runner + `tsx` | `npm test -w apps/api` | `health.test.ts`, `vertical-slice.test.ts`, `rbac.test.ts`, `audit.test.ts`, `user-roles.test.ts`, `postgres-integration.test.ts`, `employees.test.ts` (19 tests) | PASS (100%) |
| `@klerion/company-console` (`apps/web`) | None Configured | None | **None** | **Missing** |

---

## 5. Existing Test Coverage

Current test suites across backend packages thoroughly cover:
- **Workforce Core Aggregate & Invariants**: Employee creation, field validation, status state machine transitions (`active` -> `suspended` -> `active` -> `terminated`), placement value objects.
- **Circular Reporting Hierarchy**: Direct loops, 3-node loops, deep 10-node loops, self-management, cross-tenant manager assignment, terminated manager assignment.
- **Persistence Layer**: Postgres schema tables, Drizzle ORM queries, tenant isolation in `postgres-employee-repository.ts` via PGlite in-memory database.
- **REST API Layer**: `Fastify` routes (`/api/v1/employees`), authentication, tenant slug verification, RBAC permissions, audit log trail generation.

---

## 6. Missing Coverage / Test Gaps in Frontend (`apps/web`)

Despite comprehensive backend test coverage, the frontend application has **no automated test suites**. Specific frontend test gaps include:

1. **RBAC Control Suppression**:
   - Verification that users without `employees:create` cannot see the "Add Employee" button.
   - Verification that users without `employees:update` cannot see edit/manager/status action buttons.
   - Verification that users without `employees:delete` cannot see the delete action button.
   - Verification that users with `member` role see a "Read-Only Access" notice banner.
2. **Directory Display & Search/Filter Logic**:
   - Table vs Grid view rendering.
   - Live debounced text search filtering by name, email, or employee number.
   - Filter dropdowns (department, employment status).
   - Pagination controls (next/prev page buttons, record count display).
3. **Modal Form Workflows & Validation**:
   - `CreateEmployeeModal`: Client-side required field validation, submission handling, error banners.
   - `EditEmployeeModal`: Field pre-population, update submission.
   - `AssignManagerModal`: Dropdown option filtering, handling circular hierarchy API errors (409 Conflict).
   - `UpdateStatusModal`: Status radio options, audit reason input, status change submission.
   - `DeleteEmployeeModal`: Confirmation button click, deletion API call.
4. **Execution Modes**:
   - **Demo Mode**: Local in-memory state manipulation without HTTP network requests.
   - **Live Mode**: REST API invocation via `klerionApi` with loading states and error handling.

---

## 7. Component & API Interaction Inventory

### Component Inventory (`apps/web/src/views/EmployeeDirectoryView.tsx`)
- `EmployeeDirectoryView` (Container view component)
- `CreateEmployeeModal` (Modal subcomponent)
- `EditEmployeeModal` (Modal subcomponent)
- `AssignManagerModal` (Modal subcomponent)
- `UpdateStatusModal` (Modal subcomponent)
- `DeleteEmployeeModal` (Modal subcomponent)

### API Interaction Inventory (`apps/web/src/lib/api.ts`)
- `klerionApi.listEmployees(params)` -> `GET /api/v1/employees`
- `klerionApi.getEmployee(id)` -> `GET /api/v1/employees/:id`
- `klerionApi.createEmployee(data)` -> `POST /api/v1/employees`
- `klerionApi.updateEmployee(id, data)` -> `PATCH /api/v1/employees/:id`
- `klerionApi.assignManager(id, managerId)` -> `POST /api/v1/employees/:id/assign-manager`
- `klerionApi.updateEmployeeStatus(id, status, reason, date)` -> `POST /api/v1/employees/:id/status`
- `klerionApi.deleteEmployee(id)` -> `DELETE /api/v1/employees/:id`

---

## 8. RBAC & Multi-Tenant Review

### RBAC Hierarchy Matrix in Frontend
- `owner`: Has all permissions (`employees:read`, `employees:create`, `employees:update`, `employees:manage_hierarchy`, `employees:delete`).
- `staff`: Has standard management permissions (`employees:read`, `employees:create`, `employees:update`, `employees:manage_hierarchy`), but **lacks** `employees:delete`.
- `member`: Has read-only permission (`employees:read`). All mutating action buttons are hidden in the UI.

### Multi-Tenancy Handling
- `klerionApi` attaches `X-Tenant-Slug` header (derived from `session.tenantSlug`) and `Authorization: Bearer <token>` header on all requests.
- Component state isolates records per tenant session.

---

## 9. Accessibility Review

Inspection of `EmployeeDirectoryView.tsx` highlights:
- **Form Controls**: All `<input>` and `<select>` elements use explicit `<label>` tags with matching `htmlFor` / `id` attributes.
- **Status Badges**: Semantic CSS classes with contrast-compliant text colors (`bg-emerald-50 text-emerald-700`, `bg-amber-50 text-amber-700`, `bg-purple-50 text-purple-700`, `bg-rose-50 text-rose-700`).
- **Modal Overlay**: Uses dark semi-transparent backdrop (`bg-black/50 backdrop-blur-sm`) with clear close buttons (`X` icon) and `aria-label="Close"`.

---

## 10. Testing Strategy & Recommendations for TSK-EMP-006

To establish comprehensive test coverage for `apps/web` without introducing unnecessary external heavy frameworks (like Playwright or Cypress which require headless browsers and native binaries), we recommend:

1. **Lightweight Component & Integration Test Suite for `apps/web`**:
   - Utilize Node.js Native Test Runner (`node --test`) paired with lightweight DOM mocking (`jsdom` or `happy-dom` / React Testing Utilities or Component Test Harness) or modular unit/integration testing of view logic, helper functions, RBAC guards, and API integration mocks.
   - Alternatively, build a headless React component testing harness or test suite in `apps/web/tests/employee-directory.test.ts` or `apps/web/tests/ui.test.ts`.
2. **Test Cases to Implement**:
   - **`hasPermission` RBAC Guard Tests**: Validate permission evaluation across `owner`, `staff`, `member`, and custom role arrays.
   - **`EmployeeDirectoryView` Component Tests**:
     - Render tests in `demo` mode vs `live` mode.
     - RBAC UI action button visibility (Owner vs Staff vs Member).
     - Live search filtering and department/status filtering logic.
     - Pagination logic (page increments/decrements, page boundaries).
     - Modal rendering and form submission flows (Create, Edit, Assign Manager, Update Status, Delete).
     - Circular manager assignment error response rendering (409 Conflict handling).

---

## 11. Scope for TSK-EMP-006

### In Scope
1. Configure test runner execution for `apps/web` in `apps/web/package.json` (e.g. `npm test -w apps/web`).
2. Create frontend unit, component, and integration test suite (`apps/web/tests/employee-directory.test.ts` or similar).
3. Test RBAC permissions, UI action button suppression, search/filtering, pagination, modal form submissions, and API error handling.
4. Verify multi-tenant header attachments and demo mode fallback behavior.
5. Update monorepo root test command (`npm test`) to execute `apps/web` test suite cleanly alongside backend suites.

### Out of Scope
- Modifying production UI code in `EmployeeDirectoryView.tsx` (unless a genuine bug is found during test development).
- Adding full E2E browser automation engines (e.g. Playwright/Selenium) that require external heavy binary browser installations in the sandbox environment.
- Modifying backend `@adminops/workforce-core`, `@adminops/persistence`, or `@adminops/api` packages.
- Starting TSK-ATT-001 or any Attendance module tasks.

---

## 12. Open Questions & Next Steps

- **Question for Reviewer**: Does the proposed lightweight Node.js native test harness for `apps/web` meet all testing criteria for TSK-EMP-006?
- **Next Step**: Await Phase 1 approval before generating the detailed Engineering Design Spec (`developer3/design/TSK-EMP-006_DESIGN.md`).
