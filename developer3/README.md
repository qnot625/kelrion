# Developer 3 Engineering Handbook & Technical Blueprint

Welcome to the **Developer 3 Workspace Handbook** for Klerion (AdminOps OS). This document serves as the canonical technical guide, architectural blueprint, and operational manual for all workforce management, employee master records, and time & attendance domain implementations.

---

## 1. Responsibilities & Domain Scope

Developer 3 owns the **Workforce Core** domain and associated API / Frontend slices within Klerion.

### Core Modules Owned
1. **Employee Master Records and Organization Directory (#14)**
   - Employee lifecycle & canonical person record
   - Employment status (Active, On Leave, Suspended, Terminated)
   - Department assignment & Branch placement
   - Manager relationships (reporting line hierarchy)
   - Organization employee directory & team queries
2. **Time, Attendance and Clock-In / Clock-Out (#11)**
   - Clock-In, Clock-Out, and Break events
   - Attendance exceptions (Late arrival, Early departure, Overtime, Absent, Missing Clock-Out)
   - Attendance correction request workflows
   - Offline-safe time logging & idempotent sync (`idempotencyKey`)
   - Daily attendance summaries & employee time profiles
   - Privacy-safe attendance tracking (location obfuscation, minimal PII exposure)

---

## 2. Codebase Ownership Boundaries

```
klerion/
├── modules/
│   └── domains/
│       └── workforce-core/          <-- Domain Entities, Aggregates, Value Objects, Domain Events, Repositories
├── apps/
│   ├── api/
│   │   └── src/
│   │       └── routes/
│   │           ├── employees.ts     <-- Employee REST APIs
│   │           └── attendance.ts    <-- Attendance REST APIs
│   └── web/
│       └── src/
│           ├── features/
│           │   ├── employees/       <-- Employee UI Components, Hooks, Views
│           │   └── attendance/      <-- Attendance UI Components, Hooks, Views
│           └── views/
│               ├── EmployeesView.tsx
│               └── AttendanceView.tsx
└── developer3/                      <-- Developer 3 Engineering Workspace
```

### Team Ownership Rules
- **Canonical Employee Owner**: Developer 3 is the exclusive owner of the Employee data model and Employee database tables.
- **Foreign Key Referencing**: External modules (e.g., BranchFlow, Audit, Auth) MUST ONLY reference `employeeId` as a string identifier.
- **Boundary Enforcement**: No other module or developer may write directly to Employee or Attendance tables or mutate Workforce domain models.
- **Persistence Decoupling**: Workforce Core services must never directly import persistence implementations from other teams (e.g., tenancy, identity). All external services are consumed via interface abstractions or contracts.

---

## 3. Architecture Overview & Design Patterns

The architecture follows Klerion's **Modular Monolith** pattern:

```
[ Frontend: web/src/features/{employees,attendance} ]
                         │
                         ▼ (HTTP REST / JSON)
[ API Routes: apps/api/src/routes/{employees,attendance}.ts ]
                         │
                         ▼ (App Services / Commands)
[ Domain Layer: modules/domains/workforce-core/src ]
     ├── Entities & Aggregates (Employee, AttendanceRecord)
     ├── Value Objects (EmployeeRef, EmploymentPlacement, AttendanceEvent, AttendanceSummary)
     ├── Domain Events (employee.created.v1, attendance.clocked_in.v1, etc.)
     └── Repository Interfaces (IEmployeeRepository, IAttendanceRepository)
                         │
                         ▼ (Dependency Inversion)
[ Persistence Layer: packages/persistence/src ]
     └── Drizzle ORM / PostgreSQL Tables (employees, attendance_events, attendance_summaries, etc.)
```

### Key Architectural Invariants
1. **Multi-Tenancy Isolation**: Every database table and domain query MUST enforce `tenant_id`. Cross-tenant queries are strictly forbidden.
2. **Role-Based Access Control (RBAC)**: All routes are guarded with `authGuard` and `requirePermission` middleware.
3. **Audit Logging Integration**: Every state-changing domain mutation triggers a tamper-evident audit log event via the Platform Audit service.
4. **Idempotency & Offline Reliability**: Attendance events logged offline use client-generated UUID idempotency keys to guarantee at-most-once processing during synchronization.

---

## 4. Published Contracts & Domain Events

### Published Contracts
- `EmployeeRef`: `{ id: string; tenantId: string; employeeNumber: string; firstName: string; lastName: string; email: string; department: string; position: string; status: EmploymentStatus }`
- `EmploymentPlacement`: `{ tenantId: string; branchId: string; departmentId: string; position: string; managerId?: string; effectiveDate: string }`
- `AttendanceEvent`: `{ id: string; tenantId: string; employeeId: string; type: 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END'; timestamp: string; location?: { lat: number; lng: number }; idempotencyKey: string; isOfflineSync: boolean }`
- `AttendanceSummary`: `{ tenantId: string; employeeId: string; date: string; totalWorkMinutes: number; totalBreakMinutes: number; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE'; exceptions: string[] }`

### Published Events
- `employee.created.v1`
- `employee.placement_changed.v1`
- `attendance.clocked_in.v1`
- `attendance.clocked_out.v1`
- `attendance.exception_detected.v1`

---

## 5. Build, Test, and Quality Gate Instructions

### Verification Commands
```bash
# 1. Run full TypeScript compilation check
npm run compile (or via applet compile tool)

# 2. Run ESLint code quality check
npm run lint

# 3. Execute unit and integration tests
npm run test
```

### Quality Gate Checklist
Before marking any slice or task complete:
- [ ] Code compiles without any TypeScript errors (`npm run compile`).
- [ ] Linter completes cleanly with zero warnings/errors (`npm run lint`).
- [ ] All unit, repository, and API tests pass (`npm run test`).
- [ ] Tenant isolation verified in all SQL queries and domain handlers.
- [ ] RBAC permissions checked on all endpoints.
- [ ] Audit logs dispatched for domain mutations.
- [ ] Independent Engineering Verification Report generated using `developer3/VERIFICATION_REPORT_TEMPLATE.md`.
- [ ] Documentation workspace updated in `developer3/` (`PROGRESS.md`, `CHANGELOG.md`, `FILE_INDEX.md`, `IMPLEMENTATION_LOG.md`).

---

## 6. Implementation Roadmap Overview

- **Milestone 1**: Workforce Database Schemas & Published Contracts
- **Milestone 2**: Employee Aggregate & Domain Core
- **Milestone 3**: Employee Persistence & Repositories
- **Milestone 4**: Employee REST APIs & RBAC Integration
- **Milestone 5**: Employee Frontend Features & Organization Directory
- **Milestone 6**: Time & Attendance Aggregate & Idempotent Event Core
- **Milestone 7**: Attendance Persistence & Repositories
- **Milestone 8**: Attendance REST APIs & Offline Sync Workflows
- **Milestone 9**: Attendance Frontend Features & Clock-In/Out UI
- **Milestone 10**: End-to-End Integration, Security Audit & Final Validation
