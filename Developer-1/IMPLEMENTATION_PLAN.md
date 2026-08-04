# Architectural Implementation Plan: TASK-003 Branch Domain Foundation

This document details the master architectural implementation plan for **TASK-003: Branch Domain Foundation**, reflecting all structural agreements, database rules, and review constraints.

---

## 1. Task Understanding & Requirements
- **Assigned Task**: TASK-003: Branch Domain Foundation
- **Business Objective**: Enable multi-tenant organizations to define their physical branch locations, standard weekly operating hours, and custom/holiday closure schedules.
- **Technical Objective**: Implement the relational database tables, TypeScript domain structures, decoupled repositories (Postgres/In-Memory), Fastify route layers (handling validation, Tenant Isolation, RBAC, Audits, and Domain Events), and the React management console.

---

## 2. Existing Architecture & Codebase Review
- **Existing Patterns & Reference Modules**:
  - **Drizzle Database Conventions**: Look at `/packages/persistence/src/schema.ts` for UUID primary keys, timestamp patterns, tenant association constraints, and schema registry.
  - **Tenant Isolation**: `/apps/api/src/plugins/tenant-context.ts` parses `x-tenant-id` or route params to extract tenant ID. Database actions must strictly query on `tenantId`.
  - **Repository Pattern**: Follow `/packages/persistence/src/postgres-appointment-repository.ts` and `/modules/domains/branch-flow/src/in-memory-appointment-repository.ts` as standard implementations.
  - **Fastify Route Structures**: See `/apps/api/src/routes/appointments.ts` for plugin-based route declarations, TypeBox schema validators, security guards, and audit/event logging.
  - **Frontend Views**: Reference `/apps/web/src/views/AppointmentsView.tsx` for state mapping, table lists, loading/error states, and standard modal structures.

---

## 3. Scope of Changes
- **Files Expected to Be Created**:
  - `packages/persistence/src/schema/branch-flow.ts` (Core relational tables)
  - `modules/domains/branch-flow/src/branch.ts` (Domain definitions and types)
  - `apps/api/src/routes/branches.ts` (Fastify routing interface)
  - `apps/web/src/features/branches/BranchManagement.tsx` (React master-detail management portal)
- **Files Expected to Be Modified**:
  - `packages/persistence/src/schema/index.ts` (Register branch-flow tables)
  - `apps/api/src/server.ts` (Register branches Fastify plugin)
  - `apps/web/src/App.tsx` (Add routes to branch views)
- **Files That Must NOT Change (Protected)**:
  - Any folder outside Developer-1 boundaries (e.g. `/modules/domains/queue`, `/modules/platform/identity`).

---

## 4. Technical Constraints, Dependencies, & Risks

### A. Coordinate Validation
- **Latitude**: Must be validated to be between `-90` and `90` inclusive.
- **Longitude**: Must be validated to be between `-180` and `180` inclusive.

### B. Operating Window Time Representation & Constraints
- Overnight operating windows are **NOT** supported in the MVP. For example, a shift from `22:00` to `02:00` (crossing midnight) is rejected.
- Operating hours are represented as minutes from midnight (`0` to `1440`).
- Strict validation: `0 <= openMinutes < closeMinutes <= 1440`.

### C. Holiday Representation & Nullable Branch Boundaries
- Holidays are defined by a date range (`startAt` and `endAt` timestamps) with a `name` description.
- To handle both branch-specific and company-wide events, `branchId` is a **nullable** foreign key:
  - `branchId IS NOT NULL`: Represents a branch-specific holiday closure (only that branch is closed).
  - `branchId IS NULL`: Represents a tenant-wide holiday closure (intentional architectural extension beyond branch-only holidays; all branches within the tenant are considered closed).
- Validation: `startAt < endAt`.

### D. Architectural Risks & Mitigations
- **Double Creation / Slug Duplication**: Prevent multiple branches under the same tenant from using identical slugs.
  - *Mitigation*: Add a unique composite index on `(tenant_id, slug)` to database schemas.
- **Uncoordinated DB Operations**: Branch creation should not implicitly insert child configurations.
  - *Mitigation*: Fully decouple mutations. Branch operations only handle core metadata; operating windows and holidays utilize independent repository methods and API endpoints.

---

## 5. Engineering Approach & Design

### A. Database Relationship Diagram
```text
┌─────────────────┐             ┌─────────────────────────┐
│     tenants     │             │        branches         │
├─────────────────┤             ├─────────────────────────┤
│ id (PK)         │◄───(1:N)───*│ id (PK)                 │
│ name            │             │ tenant_id (FK)          │
└─────────────────┘             │ slug                    │
         │                      │ name                    │
         │                      │ status ('active'/'in..')│
         │                      │ address                 │
         │                      │ latitude                │
         │                      │ longitude               │
         │                      └─────────────────────────┘
         │                                   │
         │ (1:N)                             │ (1:N)
         ▼                                   ▼
┌─────────────────────────────────┐   ┌─────────────────────────┐
│         branch_holidays         │   │ branch_operating_windows│
├─────────────────────────────────┤   ├─────────────────────────┤
│ id (PK)                         │   │ id (PK)                 │
│ tenant_id (FK)                  │   │ branch_id (FK)          │
│ branch_id (FK, nullable)        │──*│ day_of_week (0-6)       │
│ name                            │   │ open_minutes (0-1440)   │
│ start_at (timestamp UTC)        │   │ close_minutes (0-1440)  │
│ end_at (timestamp UTC)          │   └─────────────────────────┘
└─────────────────────────────────┘
```

### B. TypeScript Domain Contracts
```typescript
export interface BranchRef {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  status: "active" | "inactive";
  address: string;
  latitude: number;
  longitude: number;
}

export interface OperatingWindow {
  dayOfWeek: number; // 0 (Sunday) to 6 (Saturday)
  openMinutes: number; // minutes from midnight (0 to 1440)
  closeMinutes: number; // minutes from midnight (0 to 1440)
}

export interface Holiday {
  id: string;
  tenantId: string;
  branchId: string | null; // null represents tenant-wide closure
  name: string;
  startAt: Date;
  endAt: Date;
}
```

### C. Decoupled Repository Interface Design
The repository operations are strictly separated by entity type:

```typescript
export interface BranchRepository {
  // Branch Operations
  createBranch(branch: Omit<BranchRef, "id">): Promise<BranchRef>;
  getBranchById(id: string, tenantId: string): Promise<BranchRef | null>;
  getBranchBySlug(slug: string, tenantId: string): Promise<BranchRef | null>;
  getBranches(tenantId: string): Promise<BranchRef[]>;
  updateBranch(id: string, tenantId: string, updates: Partial<Omit<BranchRef, "id" | "tenantId">>): Promise<BranchRef>;

  // Operating Window Operations
  setOperatingWindows(branchId: string, windows: OperatingWindow[]): Promise<void>;
  getOperatingWindows(branchId: string): Promise<OperatingWindow[]>;

  // Holiday Operations
  addHoliday(holiday: Omit<Holiday, "id">): Promise<Holiday>;
  getHolidays(tenantId: string, branchId?: string | null): Promise<Holiday[]>;
  removeHoliday(id: string, tenantId: string): Promise<void>;
}
```

---

## 6. API Contract Planning

### A. Branch Endpoints

#### `POST /branches` (Create Branch Metadata Only)
- **Role Requirement**: `tenant:manage`
- **Payload**:
  ```json
  {
    "name": "London West",
    "slug": "london-west",
    "address": "123 Kensington High St, London",
    "latitude": 51.501,
    "longitude": -0.191,
    "status": "active"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "id": "branch-uuid-12345",
    "tenantId": "tenant-uuid-abcde",
    "slug": "london-west",
    "name": "London West",
    "status": "active",
    "address": "123 Kensington High St, London",
    "latitude": 51.501,
    "longitude": -0.191
  }
  ```

#### `GET /branches` (Get All Branches within Active Tenant)
- **Role Requirement**: None (or authenticated check)
- **Response (200 OK)**:
  ```json
  [
    {
      "id": "branch-uuid-12345",
      "tenantId": "tenant-uuid-abcde",
      "slug": "london-west",
      "name": "London West",
      "status": "active",
      "address": "123 Kensington High St, London",
      "latitude": 51.501,
      "longitude": -0.191
    }
  ]
  ```

---

### B. Operating Window Endpoints

#### `PUT /branches/:id/operating-windows` (Set Weekly Hours)
- **Role Requirement**: `tenant:manage`
- **Payload**:
  ```json
  {
    "windows": [
      { "dayOfWeek": 1, "openMinutes": 480, "closeMinutes": 1020 },
      { "dayOfWeek": 2, "openMinutes": 480, "closeMinutes": 1020 }
    ]
  }
  ```
- **Response (200 OK)**:
  ```json
  { "success": true }
  ```

#### `GET /branches/:id/operating-windows` (Retrieve Weekly Hours)
- **Response (200 OK)**:
  ```json
  [
    { "dayOfWeek": 1, "openMinutes": 480, "closeMinutes": 1020 },
    { "dayOfWeek": 2, "openMinutes": 480, "closeMinutes": 1020 }
  ]
  ```

---

### C. Holiday Endpoints

#### `POST /branches/:id/holidays` (Add Branch-Specific Holiday)
- **Role Requirement**: `tenant:manage`
- **Payload**:
  ```json
  {
    "name": "Christmas Branch Maintenance",
    "startAt": "2026-12-24T00:00:00.000Z",
    "endAt": "2026-12-26T23:59:59.000Z"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "id": "holiday-uuid-9999",
    "tenantId": "tenant-uuid-abcde",
    "branchId": "branch-uuid-12345",
    "name": "Christmas Branch Maintenance",
    "startAt": "2026-12-24T00:00:00.000Z",
    "endAt": "2026-12-26T23:59:59.000Z"
  }
  ```

#### `POST /holidays` (Add Tenant-Wide Holiday - Nullable `branchId`)
- **Role Requirement**: `tenant:manage`
- **Payload**:
  ```json
  {
    "name": "National Day Holiday",
    "startAt": "2026-10-01T00:00:00.000Z",
    "endAt": "2026-10-01T23:59:59.000Z"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "id": "holiday-uuid-8888",
    "tenantId": "tenant-uuid-abcde",
    "branchId": null,
    "name": "National Day Holiday",
    "startAt": "2026-10-01T00:00:00.000Z",
    "endAt": "2026-10-01T23:59:59.000Z"
  }
  ```

#### `GET /branches/:id/holidays` (Get Holidays affecting a specific Branch)
- **Response (200 OK)**:
  Includes both branch-specific holidays and tenant-wide holidays (where `branchId IS NULL`).

#### `DELETE /holidays/:id` (Remove a Holiday Configuration)
- **Role Requirement**: `tenant:manage`
- **Response (204 No Content)**

---

## 7. Metrics of Success (Definition of Done)
- [ ] Strictly validate coordinates (`latitude`: -90 to 90, `longitude`: -180 to 180).
- [ ] Enforce no-overnight operating windows validation (`0 <= openMinutes < closeMinutes <= 1440`).
- [ ] Support tenant-wide holidays with nullable `branchId` (intentional architectural extension).
- [ ] Branch creation API strictly separates branches from operating schedules/holidays.
- [ ] No compilation, lint, or type-checking errors during full build runs.
- [ ] Secure tenant boundaries and record tamper-proof audit events inside `audit_events`.
- [ ] Emit versioned `branch.created.v1` domain events upon creation.

---

*End of Architectural Implementation Plan for TASK-003*
