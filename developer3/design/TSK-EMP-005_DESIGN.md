# Engineering Design Document: TSK-EMP-005 — Employee Directory UI & Forms

**Author**: Senior Frontend Architect & Lead UI Engineer (Developer 3)  
**Date**: 2026-08-01  
**Task ID**: TSK-EMP-005  
**Milestone**: Milestone 5 — Employee Directory & Attendance UI  
**Target Module**: `apps/web` (`apps/web/src/views/EmployeeDirectoryView.tsx`, components, modals, hooks, api client extensions)  
**Status**: DESIGN COMPLETE — AWAITING PHASE 4 APPROVAL  

---

## 1. Purpose

### Problem Statement
Enterprise branch operations require a centralized, responsive, accessible, multi-tenant UI for managing employee master records, organization structure, manager reporting relationships, and employment status lifecycles. Prior to TSK-EMP-005, the application provided backend REST APIs (`/employees`) and domain models (`@adminops/workforce-core`), but frontend users had no interactive directory interface, search/filter controls, modal forms, or RBAC-guarded actions for managing workforce records.

### Business Objective
Deliver an enterprise-grade Employee Directory UI in `apps/web` that enables organization owners, managers, and authorized HR/staff to view employee rosters, search/filter across departments and statuses, onboard new hires, update profile details, assign/reassign managers without circular reporting traps, and manage employment status lifecycles (active, suspended, terminated) with full multi-tenant isolation and strict RBAC enforcement.

### Scope
- **Employee Directory View** (`apps/web/src/views/EmployeeDirectoryView.tsx`): Responsive table & grid view with search input, department/status filters, pagination, sorting, status badges, and action dropdowns.
- **Employee Creation Modal** (`CreateEmployeeModal`): Form for onboarding new staff with validation for employee numbers, emails, hire dates, employment types, departments, and manager selection.
- **Employee Edit Modal** (`EditEmployeeModal`): Form for updating basic profile information (names, email, employment type, department).
- **Manager Assignment Modal** (`AssignManagerModal`): Dedicated hierarchy management modal with real-time manager lookup, self-assignment prevention, and backend circular hierarchy error handling.
- **Employment Status Update Dialog** (`UpdateStatusModal`): Lifecycle state management modal supporting status transitions (`suspend`, `reactivate`, `terminate`) with optional termination date and audit reason fields.
- **Employee Delete Confirmation Dialog** (`DeleteEmployeeModal`): Confirmation dialog enforcing RBAC `employees:delete` permissions and tenant boundaries.
- **API Client Extensions**: Extending `klerionApi` in `apps/web/src/lib/api.ts` to support all `/employees` REST endpoints (`listEmployees`, `getEmployee`, `createEmployee`, `updateEmployee`, `assignManager`, `updateEmployeeStatus`, `deleteEmployee`).
- **Navigation Integration**: Integrating `employees` route into `Shell.tsx` navigation sidebar under the "Workforce" section with Lucide `Users` icon.
- **Demo Mode Support**: Seamless fallback to mock dataset when running in `session.mode === "demo"`.

### Out of Scope
- Time & Attendance clock-in/out UI (owned by TSK-ATT-002).
- Organizational Chart interactive tree rendering (future phase feature).
- Bulk CSV import/export UI (backend domain helper exists, UI deferred).
- Direct authentication/user creation binding beyond storing `email` and optional `userId`.

---

## 2. UI Architecture

### Page & Component Hierarchy
```text
App.tsx (State: session, stage, route)
 └── Shell.tsx (Session, Topbar, Sidebar Navigation)
      └── EmployeeDirectoryView.tsx (Route: "employees")
           ├── DirectoryHeader (Eyebrow, Title, Description, "Add Employee" Button [RBAC Guarded])
           ├── DirectoryToolbar
           │    ├── SearchInput (Debounced 300ms text filter)
           │    ├── DepartmentFilterSelect (All, Operations, HR, Engineering, Sales)
           │    ├── StatusFilterSelect (All, Active, On Leave, Suspended, Terminated)
           │    └── ViewToggleButtons (Table View vs. Card Grid View)
           ├── DirectoryContent
           │    ├── LoadingState (Skeleton Rows / Card Skeletons)
           │    ├── ErrorState (Inline Alert with Retry Button)
           │    ├── EmptyState (Zero records matching filters with Reset Action)
           │    ├── EmployeeTable (Desktop / Tablet view)
           │    │    └── EmployeeTableRow (Avatar, Name, Email, Dept, Role, Status, Manager, Actions Menu)
           │    └── EmployeeGrid (Mobile / Compact view)
           │         └── EmployeeCard (Avatar, Name, Badges, Details, Action Buttons)
           ├── DirectoryPagination (Page info, Page size select, Prev/Next buttons)
           ├── CreateEmployeeModal (Form: POST /employees)
           ├── EditEmployeeModal (Form: PATCH /employees/:id)
           ├── AssignManagerModal (Form: PATCH /employees/:id/manager)
           ├── UpdateStatusModal (Form: PATCH /employees/:id/status)
           └── DeleteEmployeeModal (Confirmation Dialog: DELETE /employees/:id)
```

### State Ownership & Data Flow
- **Global Session State**: Provided by `KlerionSession` in `App.tsx` containing `tenantSlug`, `token`, `roles`, `email`, `userId`, `mode`.
- **View Container State (`EmployeeDirectoryView`)**:
  - `employees: EmployeeRef[]` (List of active filter results)
  - `totalCount: number` (Total items matching filters)
  - `loading: boolean` (Fetch status)
  - `error: string | null` (API/Network error banner)
  - `search: string` (Current search query)
  - `departmentFilter: string` (Current department selection)
  - `statusFilter: string` (Current status selection)
  - `page: number` (Current 1-indexed page)
  - `pageSize: number` (Default 10 items per page)
  - `viewMode: "table" | "grid"` (Layout preference)
  - `activeModal: "create" | "edit" | "assign_manager" | "update_status" | "delete" | null`
  - `selectedEmployee: EmployeeRef | null` (Target for edit, manager, status, or delete)
- **Data Flow**:
  - Unidirectional top-down flow: View fetches data via `klerionApi`, passes DTOs to table/cards and modal forms.
  - Modals invoke API client on submit -> on success, close modal and trigger refetch (`loadEmployees()`).

### Routing Strategy & Shell Integration
- Add `"employees"` to `RouteKey` in `apps/web/src/components/Shell.tsx`:
  ```typescript
  export type RouteKey = "dashboard" | "appointments" | "queue" | "users" | "employees" | "recruitment" | "audit" | "reports";
  ```
- Sidebar navigation item:
  ```typescript
  { key: "employees", label: "Employee directory", icon: Users, badge: "Active" }
  ```

---

## 3. Employee Directory Design

### Layout & Micro-Interactions
- **Header**: High-contrast typography with clear hierarchy, action button on right aligned with topbar design system.
- **Toolbar**: Flex container with search input (magnifying glass icon, clear button `Esc`/`X`), select dropdowns for department & status, and a toggle group for Table/Grid layout view modes.
- **Table View**:
  - Column 1: **Employee** (Avatar circle with initials, Full Name in bold, Employee Number subtext).
  - Column 2: **Contact & Email** (Clickable mailto, phone).
  - Column 3: **Department & Position** (Department badge, Position title).
  - Column 4: **Employment Type** (Pill tag: Full Time, Part Time, Contract, Intern, Temp).
  - Column 5: **Reporting Manager** (Manager name link or "Unassigned" placeholder).
  - Column 6: **Status** (Status badge: Active `green`, On Leave `blue`, Suspended `amber`, Terminated `slate`).
  - Column 7: **Actions** (IconButton with `MoreHorizontal` opening action menu: Edit, Assign Manager, Update Status, Delete).
- **Grid View (Responsive)**:
  - 1-column on mobile (<640px), 2-column on tablet (<1024px), 3-column on desktop (>=1024px).
  - Card layout featuring header avatar, name, badges, manager link, and action footer.
- **Empty State**: Rendered when filtered dataset length is zero. Shows custom graphic/icon, friendly message ("No employees found matching criteria"), and "Clear Filters" button.
- **Loading State**: Skeleton table rows with subtle pulse effect matching design system base token colors.
- **Error State**: Non-intrusive red alert banner at top of view with explicit error text and "Retry" button.

---

## 4. Employee Forms Design

### 1. Create Employee Modal (`CreateEmployeeModal`)
- **Required Fields**:
  - `employeeNumber` (Text input, e.g. "EMP-1001", regex pattern `^[A-Za-z0-9-]+$`).
  - `firstName` (Text input).
  - `lastName` (Text input).
  - `email` (Email input, valid format).
  - `hireDate` (Date input YYYY-MM-DD).
  - `employmentType` (Select: `full_time`, `part_time`, `contract`, `intern`, `temporary`).
- **Optional Fields**:
  - `departmentId` (Select dropdown populated with tenant departments).
  - `positionId` (Select dropdown populated with tenant positions).
  - `managerId` (Select dropdown populated with candidate active employees).
  - `branchId` (Text input).
- **Validation & Error Handling**:
  - Client-side pre-validation using Zod or custom form validator before submit.
  - Displays inline field error text in red (`#dc2626`).
  - Catches 409 Conflict responses (e.g., "Employee number [EMP-1001] already exists") and highlights conflicting field.

### 2. Edit Employee Modal (`EditEmployeeModal`)
- Form populated with `selectedEmployee` values.
- Fields: `firstName`, `lastName`, `email`, `employmentType`, `departmentId`, `positionId`, `branchId`.
- Preserves `employeeNumber` as read-only.

### 3. Assign Manager Modal (`AssignManagerModal`)
- Target: `selectedEmployee`.
- Field: `managerId` (Select dropdown showing all active employees in tenant except `selectedEmployee.id`).
- Clear option: "No Manager / Clear Manager Assignment".
- Handles backend circular hierarchy error response (400 Bad Request: `"Circular reporting hierarchy detected"`) by displaying warning banner inside modal.

### 4. Employment Status Update Modal (`UpdateStatusModal`)
- Target: `selectedEmployee`.
- Actions: `suspend` (Suspend Employee), `reactivate` (Reactivate Employee), `terminate` (Terminate Employment).
- Fields:
  - `reason` (Required text string explaining lifecycle change for audit logging).
  - `terminationDate` (Required Date selector YYYY-MM-DD if action is `terminate`).
- Confirmation alert highlighting impact of action.

### 5. Delete Employee Confirmation Dialog (`DeleteEmployeeModal`)
- Destructive modal dialog with red warning styling.
- Requires user to click "Confirm Delete".

---

## 5. API Integration Strategy

### API Client Extension (`apps/web/src/lib/api.ts`)
```typescript
export interface ApiEmployee {
  id: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  departmentId?: string;
  positionId?: string;
  managerId?: string;
  branchId?: string;
  employmentType: "full_time" | "part_time" | "contract" | "intern" | "temporary";
  employmentStatus: "active" | "on_leave" | "terminated" | "suspended";
  hireDate: string;
  terminationDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEmployeeListResponse {
  data: ApiEmployee[];
  total: number;
  limit: number;
  offset: number;
}
```

### Endpoints to Call
1. `GET /api/employees?search=...&departmentId=...&employmentStatus=...&limit=10&offset=0`
2. `GET /api/employees/:id`
3. `POST /api/employees`
4. `PATCH /api/employees/:id`
5. `PATCH /api/employees/:id/manager`
6. `PATCH /api/employees/:id/status`
7. `DELETE /api/employees/:id`

### Demo Mode Strategy
When `session.mode === "demo"`, state is managed locally in memory with pre-seeded demo employees (`EMP-001` John Doe, `EMP-002` Jane Smith, `EMP-003` Alex Rivera). All mutations update local React state.

---

## 6. RBAC UI Strategy

### Permission Mapping
- `employees:read`: Required to access directory view and list employees.
- `employees:create`: Required to render "+ Add Employee" header button and submit creation modal.
- `employees:update`: Required to render "Edit Details" and "Update Status" dropdown actions.
- `employees:manage_hierarchy`: Required to render "Assign Manager" dropdown action.
- `employees:delete`: Required to render "Delete Employee" dropdown action.

### Authorization Check Helper
```typescript
export function hasPermission(session: KlerionSession, permission: string): boolean {
  if (session.roles.includes("owner")) return true;
  if (session.roles.includes("staff")) {
    return ["employees:read", "employees:create", "employees:update", "employees:manage_hierarchy"].includes(permission);
  }
  return false;
}
```
If a user lacks `employees:read`, the view renders an `UnauthorizedState` component. Action buttons for permissions not held by user are suppressed from the DOM.

---

## 7. Multi-Tenant Strategy

- All API requests automatically append `Authorization: Bearer ${session.token}` and `X-Tenant-Slug: ${session.tenantSlug}` via `authorizedRequest` helper in `klerionApi`.
- Navigation between workspace tenants forces component re-render and query cache invalidation.

---

## 8. Accessibility Review

- **Keyboard Navigation**: All table action menus, select dropdowns, view mode toggles, and modal dialogs fully navigable via `Tab`, `ArrowKeys`, `Enter`, and `Space`.
- **Focus Management**: Modal dialogs trap focus on mount and restore focus to trigger element on unmount.
- **ARIA Attributes**: `aria-expanded`, `aria-haspopup`, `aria-controls`, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `aria-describedby`.
- **Color Contrast**: All badge backgrounds and text meet WCAG 2.1 AA ratio (>= 4.5:1).

---

## 9. Responsive Design

- **Desktop (>=1024px)**: Full multi-column data table with inline toolbar, search, filters, pagination footer.
- **Tablet (640px - 1023px)**: Responsive data table with scroll overflow or 2-column card grid.
- **Mobile (<640px)**: Stacked single-column card layout, mobile search overlay, full-screen bottom-sheet modal drawers.

---

## 10. Error Handling

- **400 Bad Request**: Form validation errors or circular hierarchy traps rendered inline inside modal alert banners.
- **409 Conflict**: Unique field collisions (email/employeeNumber) highlighted directly under corresponding input fields.
- **401/403 Unauthorized**: View-level fallback or session expiration redirect to login.
- **500 Internal Server Error**: Generic retry alert banner with error message.

---

## 11. Testing Strategy

- **Unit Tests**: Test form validation rules, role permission utility functions, and mock state reducers.
- **Component Tests**: Test rendering of table, badges, modals, and conditional action buttons based on mock session roles.
- **Integration Tests**: Verify full CRUD workflow against live REST API server (`apps/api`).

---

## 12. Performance Analysis

- **Debounced Search**: 300ms debounce on search input to prevent excessive API requests.
- **Server Pagination**: Limit default page size to 10-25 records.
- **DOM Virtualization**: Standard React key reconciliation sufficient for paginated datasets.

---

## 13. Future Integration

- Direct link from Employee Directory row to **Attendance History** tab (TSK-ATT-002).
- Branch assignment selector binding to **Branch Management** module (TSK-BRN-001).

---

## 14. Open Questions

1. *Should department and position dropdown options be fetched dynamically from `/departments` and `/positions` APIs or fallback to static defaults when routes are unpopulated?* -> **Resolution**: Implement dynamic fetch with pre-populated fallback list for tenant initial setup.
2. *Should employee deletion be a soft delete (status transition to `terminated`) or hard delete (`DELETE /employees/:id`)?* -> **Resolution**: Provide both — "Update Status -> Terminate" for soft lifecycle termination, and explicit "Delete Record" (guarded by `employees:delete`) for administrative record purging.

---
