# Repository Architectural Context (Developer 1)

This document serves as the living technical knowledge base for Klerion's repository. It describes the physical layout, runtime patterns, database models, coding conventions, testing paradigms, and explicit boundary agreements for **Developer 1 (Senior Staff Software Engineer / Tech Lead / Integration Maintainer)**.

---

## 🏗️ 1. Repository Architectural Anatomy

Klerion is structured as a **modular monorepo** utilizing npm workspaces. Code is isolated strictly into distinct domains, ensuring high cohesion and low coupling.

```text
/
├── apps/                         # Runtime hosting surfaces (Runnable Apps)
│   ├── api/                      # Fastify HTTP API service (ES Modules, Node 24)
│   └── web/                      # React/Vite Company Console frontend (React 19, SPA)
├── modules/                      # Business rules and platform engines (Logical packages)
│   ├── domains/                  # Bounded context domain entities
│   │   └── branch-flow/          # Appointments, Branches & Services (Developer 1 Domain)
│   └── platform/                 # Infrastructure and generic platforms
│       ├── audit/                # Cryptographically chained tamper-evident ledger
│       ├── identity/             # User databases, RBAC models, JWT sessions
│       └── tenancy/              # Multi-tenant context isolators
└── packages/                     # Low-level drivers and shared base setups
    └── persistence/              # Drizzle schema, raw migrations, and Postgres repos
```

---

## 🔒 2. Developer 1 Ownership Boundaries

To ensure zero conflicts in a multi-developer team, Developer 1 operates within strict, exclusive ownership boundaries.

### 📁 Exclusive Code Ownership Areas (Allowed Folders)

| Layer | Bounded Path | Allowed Operations |
| :--- | :--- | :--- |
| **Backend Modules** | `/modules/domains/branch-flow/**` | Full design of entities, invariants, schemas, repositories, and services |
| **Backend Routes** | `/apps/api/src/routes/branches.ts`<br>`/apps/api/src/routes/services.ts`<br>`/apps/api/src/routes/appointments.ts` | Complete REST endpoints registrations, RBAC, inputs validations |
| **Frontend Features**| `/apps/web/src/features/branches/**`<br>`/apps/web/src/features/services/**`<br>`/apps/web/src/features/appointments/**` | Creation of user-facing dashboard elements, wizard tables, state |

### 🚫 Restricted Boundaries (Do Not Edit / Forbidden Folders)

You are **STRICTLY FORBIDDEN** from modifying implementation files in another developer's domain or platform module unless a shared contract negotiation is published:
- `modules/domains/queue/**` (Developer 2 Bounded Context - Real-time Queue management)
- `modules/domains/workforce-core/**` (Developer 3 Bounded Context - Employee profiles, skills)
- `modules/domains/workforce-lifecycle/**` (Developer 4 Bounded Context - Rostering, timesheets)
- `modules/platform/forms/**` or `/modules/platform/workflow/**` (Developer 5 Bounded Context)
- `modules/domains/customer-service/**` (Developer 6 Bounded Context - Feedback, ratings)

*Note: Cross-domain interaction must happen exclusively through public schemas, shared types, or approved gateway contracts.*

---

## 🤝 3. Shared Contracts & Event Specifications

As the Tech Lead / Integration Maintainer, Developer 1 publishes core abstractions that other developers may consume (read) but must never mutate.

### 📝 Published Core Contracts (Shared TypeScript Types)

#### `BranchRef`
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
```

#### `ServiceRef`
```typescript
export interface ServiceRef {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string | null;
  durationMinutes: number;
  status: "active" | "inactive";
}
```

#### `ServiceRequirement`
```typescript
export interface ServiceRequirement {
  id?: string;
  tenantId?: string;
  serviceId?: string;
  photoIdRequired: boolean;
  minAge?: number | null;
  maxAge?: number | null;
  requiredDocuments: string[];
  customNotes?: string | null;
}
```

#### `BranchServiceRef`
```typescript
export interface BranchServiceRef {
  id: string;
  tenantId: string;
  branchId: string;
  serviceId: string;
  status: "active" | "inactive";
}
```

#### `OperatingWindow`
```typescript
export interface OperatingWindow {
  dayOfWeek: number; // 0 (Sunday) to 6 (Saturday)
  openMinutes: number; // minutes from midnight (e.g. 480 for 08:00)
  closeMinutes: number; // minutes from midnight (e.g. 1020 for 17:00)
}
```

#### `DepartmentRef`
```typescript
export interface DepartmentRef {
  id: string;
  tenantId: string;
  branchId: string;
  name: string;
  slug: string;
  capacity: number; // strictly positive integer (>= 1)
}
```

#### `AppointmentRef`

```typescript
export interface AppointmentRef {
  id: string;
  tenantId: string;
  branchId: string;
  serviceId: string;
  customerEmail: string;
  startAt: Date;
  endAt: Date;
  status: "booked" | "checked_in" | "completed" | "cancelled" | "no_show";
}
```

### 📣 Published Domain Events
All state changes within Developer 1's domain must broadcast versioned, immutable events:
1. `branch.created.v1`: Broadcast when a physical branch is registered within a tenant.
2. `service.published.v1`: Broadcast when a new catalog service is made public.
3. `appointment.booked.v1`: Broadcast on successful appointment finalization.
4. `appointment.rescheduled.v1`: Broadcast when a customer moves their timeslot.
5. `appointment.cancelled.v1`: Broadcast when an appointment is terminated.

### 📥 Consumed Domain Events
- None in initial phase. Future cycles will consume queue notifications (`queue.ticket_called.v1`) to transition appointments to checkout states.

---

## 🏛️ 4. Shared Integration & Maintainer Responsibilities

Developer 1 acts as the **Integration Maintainer** for the monorepo, responsible for:
- Root compilation systems (`package.json`, `tsconfig.json`, `eslint.config.js`).
- Shared API entrypoint registrations (`apps/api/src/server.ts`).
- Shared Frontend console shell structures (`apps/web/src/App.tsx`, `Shell.tsx`).
- Schema master registration index (`packages/persistence/src/schema/index.ts`).
- Verification pipelines (compilation flags, formatting, and test suites).

---

## 🗄️ 5. Database Layout & Schema Model

Klerion's database is modeled in Drizzle ORM and runs against PostgreSQL in production, with virtual PGlite integration for local development/testing.

### Existing Tables
1. **`tenants`**: Multi-tenant database boundary context keys.
2. **`users`**: Platform administrators, operators, and staff accounts.
3. **`appointments`**: Booked, active, or cancelled customer appointments.
4. **`audit_events`**: Cryptographically chained, immutable tamper-evident logs.

### Scoped Tables to be Introduced under Developer 1:
1. **`branches`**: Physical business locations tied to tenants.
2. **`branch_operating_windows`**: Standard weekly hours per physical branch.
3. **`branch_holidays`**: Closed calendar ranges (exceptional closed dates).
4. **`departments`**: Divisions inside a branch mapping distinct service capacities.
5. **`services`**: Service catalog definitions (names, codes, durations, requirements).
6. **`branch_services`**: Junction table mapping which branches offer which catalog services.
7. **`waitlists`**: High-density waitlist queues for fully booked timeslots.

### Service Catalogue & Capability Mapping Details
- **Tables**: `services` (id, tenant_id, code, name, description, duration_minutes, status), `service_requirements` (id, tenant_id, service_id, photo_id_required, min_age, max_age, required_documents, custom_notes), and `branch_services` (id, tenant_id, branch_id, service_id, status).
- **Validation Rules**: Service duration must be an integer between 1 and 480 minutes (`validateServiceDuration`). Service code must be non-empty and match alphanumeric/hyphen/underscore pattern (`validateServiceCode`). Minimum and maximum ages must be non-negative integers with maxAge >= minAge.
- **Repository Interface**: `ServiceRepository` implemented by `InMemoryServiceRepository` and `PostgresServiceRepository`.
- **API Endpoints**:
  - `POST /services`: Create a new catalog service item with requirements. Requires `tenant:manage` permission. Audited (`service.created`).
  - `GET /services`: List services for the active tenant.
  - `GET /branches/:id/services`: List services assigned to a specific branch.
  - `POST /branches/:id/services`: Assign a service capability to a branch. Requires `tenant:manage` permission. Audited (`branch.service_assigned`).
  - `DELETE /branches/:id/services/:serviceId`: Unassign a service capability from a branch. Requires `tenant:manage` permission. Audited (`branch.service_removed`).
- **Tenant Isolation**: Every database table includes mandatory `tenant_id` foreign keys with composite indexes (`[tenant_id, code]`, `[tenant_id, branch_id, service_id]`). Queries in both `InMemoryServiceRepository` and `PostgresServiceRepository` filter by `tenantId`.

### Appointment Booking Lifecycle Details
- **Tables**: `appointments` (id, tenant_id, branch_id, service_id, customer_email, customer_metadata, start_at, end_at, status).
- **Schema & Types**: `AppointmentRef`, `AppointmentStatus` ("booked", "checked_in", "completed", "cancelled", "no_show").
- **API Endpoints**:
  - `POST /appointments`: Book a new appointment. Checks real-time availability via `availability-engine` before booking. Emits `appointment.booked` audit event. Requires `appointments:book` permission.
  - `GET /appointments`: List appointments for the active tenant. Requires `appointments:view` permission.
  - `POST /appointments/:id/check-in`: Transitions appointment to `checked_in`. Emits `appointment.checked_in` audit event. Requires `appointments:manage` permission.
  - `POST /appointments/:id/complete`: Transitions appointment to `completed`. Emits `appointment.completed` audit event. Requires `appointments:manage` permission.
- **Booking Flow**: 
  1. Validates inputs using `@sinclair/typebox`.
  2. Resolves branch, service, operating windows, and capacity using branch and service repositories.
  3. Checks overlapping active bookings (`booked`, `checked_in`).
  4. Runs `calculateAvailability` from `availability-engine`.
  5. Validates requested slot exists in available slots. Throws `SlotNotAvailableError` if not.
  6. Saves appointment to repository.
- **Event Bus Status**: No generic domain event bus infrastructure exists yet (e.g. `events.emit`). Audit logging (`auditLog.record`) is used as the current ledger mechanism. Event dispatching (`appointment.booked.v1`) is marked as BLOCKED pending platform infrastructure.

### Capacity Routing & Discovery Aggregations (TASK-006 Complete)
- **Entities & Types**:
  - `LoadLevel`: `"low"` (&le; 40% load), `"medium"` (41% - 80% load), `"high"` (> 80% load or zero capacity).
  - `calculateLoadLevel(activeBookings: number, totalCapacity: number): LoadLevel`: Calculates load level thresholds.
  - `BranchCapacityAggregate`: Struct containing `branchId`, `tenantId`, `branchName`, `status`, `address`, `latitude`, `longitude`, `totalCapacity`, `activeBookingsCount`, and `offeredServiceIds`.
  - `DiscoveredBranch`: Aggregate extended with `loadLevel`, `loadRatio`, and optional `distanceKm`.
- **Database Indexes**:
  - `branches_tenant_status_idx` on `branches(tenant_id, status)`
  - `branch_services_tenant_service_status_idx` on `branch_services(tenant_id, service_id, status)`
  - `appointments_tenant_status_idx` on `appointments(tenant_id, status)`
- **Repository Aggregation**:
  - `BranchRepository.getBranchCapacityAggregates(tenantId, serviceId?)`: Implemented in both `InMemoryBranchRepository` and `PostgresBranchRepository`.
  - Aggregation uses O(1) batch queries per tenant with zero N+1 queries and strict multi-tenant isolation.
- **Routing Algorithm (`discoverBranches`)**:
  - Priority 1: Primary sort by `loadLevel` ("low" &rarr; "medium" &rarr; "high").
  - Priority 2: Secondary sort by geographic distance (`distanceKm` ascending using Haversine formula) when `latitude` and `longitude` are supplied.
  - Priority 3: Tertiary sort by `loadRatio` (ascending).
- **Public API Endpoint (`GET /branches/discover`)**:
  - Intentionally public (no Bearer token auth guard required; tenant resolved via `X-Tenant-Slug` header).
  - Query parameters:
    - `serviceId` (optional string): Filter branches offering a specific service.
    - `latitude` (optional number, -90 to 90): User latitude.
    - `longitude` (optional number, -180 to 180): User longitude.
    - `limit` (optional integer, 1 to 100, default 10): Max branches to return.
- **Frontend Component (`BranchDiscovery.tsx`)**:
  - Integrated into `/apps/web/src/features/branches/BranchDiscovery.tsx`.
  - Displays discovered locations with load badges (Low in green, Medium in amber, High in rose), utilization progress bars, service chips, and optional geolocation calculation.
  - Accessible via sub-tab in `BranchManagement.tsx`.

### Dynamic Availability Calculation Engine (TASK-007 Complete)
- **Engine Overview**: Pure, deterministic, side-effect free calculation engine (`calculateAvailability`) located in `modules/domains/branch-flow/src/availability-engine.ts`.
- **Inputs (`AvailabilityQueryOptions`)**:
  - `startDate`: Date object (UTC start boundary).
  - `endDate`: Date object (UTC end boundary).
  - `serviceDurationMinutes`: Integer duration in minutes (1–480).
  - `slotIntervalMinutes`: Optional step interval in minutes between slot starts (defaults to `serviceDurationMinutes`).
  - `operatingWindows`: Array of active `OperatingWindow` objects (`dayOfWeek` 0–6, `openMinutes`, `closeMinutes`).
  - `holidays`: Optional array of closed `Holiday` periods (`startAt`, `endAt`).
  - `existingBookings`: Optional array of active `ExistingBookingSlot` reservations (`startAt`, `endAt`).
  - `maxCapacity`: Optional integer maximum concurrent slot capacity (defaults to 1).
- **Outputs (`readonly TimeSlot[]`)**:
  - Array of available `{ startAt: Date, endAt: Date }` time-slot objects in UTC.
- **Validation (`validateAvailabilityQueryOptions`)**:
  - Separate input validation layer enforcing type correctness, non-NaN Date objects, `endDate > startDate`, positive integers for durations and capacities, and valid operating window minute bounds.
- **Assumptions & UTC Handling**:
  - 100% pure function with zero database access, zero repository access, zero network/API calls, and zero global mutable state.
  - All date calculations strictly evaluate UTC timestamps (`getUTCDay()`, `getUTCHours()`, `getUTCMinutes()`, `getTime()`) ensuring cross-timezone determinism.

### 📋 5b. Waitlist FIFO Queue & Promotion Engine (TASK-010 Complete)
- **Engine Overview**: An atomic, transaction-backed priority queue tracking waitlist signups for fully booked branch slots, and auto-promoting the next candidate upon cancellation or no-show events.
- **Waitlist Schema**:
  - Indexed by `(tenant_id, service_id, status)` for fast queues, enforcing multi-tenant isolation.
  - Fields include `queuePosition` (monotonically increasing integer per branch-service), `customerEmail`, and metadata.
- **FIFO Promotion Routine**:
  - Inside a transaction block, when an appointment is transitioned to `cancelled` or `no_show` status, `promoteNextInQueue()` automatically fetches the earliest active waitlisted customer (`queuePosition = 1`) for that branch and service.
  - Automatically constructs and saves a new `booked` appointment in the freed timeslot, deletes the promoted waitlist entry, and re-sequences/promotes subsequent entries.
- **RBAC & Endpoint Protection**:
  - `POST /waitlists` is open to customers/members via `appointments:book` permission.
  - `DELETE /waitlists/:id` and `PUT /appointments/:id/no-show` are staff/owner-only routes protected via `appointments:manage` permission.
- **Audit Ledger Logging**:
  - Fully integrated with the hash-chained tamper-evident ledger (`auditLog`).
  - Records cryptographic trace signatures for `waitlist.created`, `waitlist.removed`, `appointment.no_show`, and `waitlist.promoted` status transitions.
- **Waitlist Frontend Console**:
  - Located at `/apps/web/src/features/waitlists/WaitlistConsole.tsx`.
  - Seamlessly integrated as a dedicated tab inside the live branch operations centre (`QueueView.tsx`).
  - Supports loading, success/error feedback loops, registration form, and sorted list displays with individual cancellation handles.

### 📋 5c. Public Customer Booking Experience UI (TASK-011 Complete)
- **Engine/Wizard Overview**: A seamless, 5-step client-side customer booking wizard supporting public appointment creation without administrative login.
- **5-Step Flow**:
  1. **Select Branch**: Displays available active branches for the specified tenant, resolving tenant slug from URL query parameters (e.g., `?tenant=acme`) or allowing manual slug confirmation.
  2. **Select Service**: Displays active services offered at the selected branch, fetched dynamically via public service endpoints.
  3. **Select Date & Time**: Captures preferred reservation date and time using an elegant date picker and convenient touch-friendly (≥44px target) time slot options.
  4. **Customer Details**: Visual validation and collection of customer Full Name, Email, and Phone Number with live inline warning indicators.
  5. **Review & Confirmation**: Displays a cohesive, comprehensive summary of selected options before triggering the reservation request.
- **Success & Error States**:
  - Displays a detailed Success screen with the generated Appointment ID, selected branch, service, date, time, and an option to book another appointment.
  - Displays clear Error details and retry loops if the booking fails (e.g. slot capacity full, validation failure).
- **Public API Route Bypasses**:
  - Public routes (`GET /services`, `GET /branches/:id/services`, and `POST /appointments`) bypass the Fastify `authGuard` and `requirePermission` plugins.
  - Multi-tenant data containment and tenant context are strictly preserved via the standard `X-Tenant-Slug` header and `tenant-context` validation.
  - Administrative endpoints (such as `/appointments/:id/check-in` or `/appointments/:id/complete`) remain securely locked behind RBAC checks.
- **Audit Logging**:
  - Securely logs successful anonymous customer bookings using the cryptographically hash-chained `auditLog` ledger under the `appointment.booked` action.

---

## 🔩 6. Technical & Architectural Patterns

### Backend Routing Architecture (Fastify)
- **Fastify & ES Modules**: Thin, modular route registration plugins.
- **Context Isolators (Plugins)**:
  - `tenant-context`: Extracts the active tenant context slug/ID from headers or host subdomains, validating database isolation boundary conditions on each request cycle.
  - `auth-plugin`: Extracts JWT credentials, validates signature bounds, and binds the parsed `User` structure and RBAC permissions to the Fastify request instance.

### Repository Pattern
Data queries are separated from route definitions. Repository interfaces live inside domain modules; concrete PostgreSQL classes are implemented inside `packages/persistence`:
- `PostgresBranchRepository`: Implements Drizzle queries targeting real PostgreSQL engines.
- `InMemoryBranchRepository`: Fully simulated repository with mock seed states, enabling fast, isolated local test coverage without requiring a live database server.

---

## 📋 7. Coding & Verification Conventions

To maintain a clean repository, Developer 1 strictly enforces these rules:

### TypeScript & Type Safety
- **Named Imports Only**: No default imports. All import statements must live at the top-level.
- **Strict Enums**: Always use standard, explicit type-safe enums. Never use `const enum`.
- **Absolute Paths**: No relative parent imports (e.g. `../../`) across workspaces. Utilize monorepo workspace package refs (e.g., `@klerion/persistence`) instead.

### Frontend CSS & Layout Mandates (Anti-Slop Guidelines)
- **Tailwind Only**: Style strictly with Tailwind CSS utility classes inside markup. No separate `.css` files or inline `style` attributes.
- **Mathematically Clean Layouts**:
  - Minimum container padding is `16px`. Outer container padding must exceed inner element margin gaps.
  - Button horizontal padding must be exactly `2x` its vertical padding.
  - Corner nesting rule: `Inner Radius = Outer Radius - Padding`.
  - No nested cards (cards inside cards) or heavy glassmorphism visual styling.
- **Accessibility & Touch Profiles**:
  - Touch target boundaries must scale $\ge 44\text{px}$ on all interactive components.
  - Clear state indicators for `.isLoading`, `.error` (reload trigger), and `.isEmpty` (empty vector artwork).
  - Explicit HTML `id` attributes on all meaningful interactive fields, form elements, and control buttons.

### Testing Paradigm
- Unit tests live alongside files (`*.test.ts`).
- Integration tests execute in-memory against a virtual WASM-based **PGlite** engine for local speed, or against real PostgreSQL instances in CI.
- Tests must verify tenant data containment boundaries (i.e. query commands of Tenant A must never return Tenant B records).

---

## ❓ 8. Architectural Assumptions & Unknowns

### Important Assumptions
- **UTC Integrity**: All datetime and timestamp values stored inside PostgreSQL are strictly converted to UTC offsets at serialization points.
- **HMR Deactivation**: Hot Module Replacement is disabled in AI Studio; the preview app is built and refreshed once per agent turn.
- **Single External Port**: Port 3000 is the only externally exposed portal, routed through an Nginx proxy.

### Unresolved Unknowns (Future Scope)
- **Automatic Waitlist Scheduler Concurrency**: The precise cron interval or event queue that handles FIFO ticket processing for waitlist promotions.
- **Captcha Provider**: The specific external spam mitigation vendor (e.g., Turnstile, reCAPTCHA v3) to secure anonymous customer booking screens.
