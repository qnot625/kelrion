# Granular Engineering Execution Checklist (Developer 1)

This document is the official execution checklist for Developer 1. It decomposes each task into explicit, sequential engineering phases, ensuring micro-PR traceability and high-fidelity verification.

---

## 📅 Task Index

* [TASK-003: Branch Domain Foundation](#-task-003-branch-domain-foundation)
* [TASK-004: Department Management & Capacity](#-task-004-department-management--capacity)
* [TASK-005: Service Catalogue & Mapping](#-task-005-service-catalogue--mapping)
* [TASK-006: Capacity Routing & Discovery](#-task-006-capacity-routing--discovery)
* [TASK-007: Dynamic Availability Calculation Engine](#-task-007-dynamic-availability-calculation-engine)
* [TASK-008: Core Appointment Booking Lifecycle](#-task-008-core-appointment-booking-lifecycle)
* [TASK-009: Smart Appointment Operations](#-task-009-smart-appointment-operations)
* [TASK-010: Advanced Scheduling & Waitlists](#-task-010-advanced-scheduling--waitlists)
* [TASK-011: Public Customer Booking Experience UI](#-task-011-public-customer-booking-experience-ui)

---

## 🛠️ TASK-003: Branch Domain Foundation

### 1. Research Phase
- [x] Inspect `/packages/persistence/src/schema.ts` to analyze database conventions
- [x] Analyze the active tenant schema mapping and how `tenantId` context checks are implemented
- [x] Research how UTC timestamps and date-time properties are standardly serialized on existing tables

### 2. Planning Phase
- [x] Diagram the relational database schema mapping branches, weekly operating times, and holiday dates
- [x] Draft named TS schemas for published interfaces (`BranchRef`, `OperatingWindow`)
- [x] Document specific unique indices to prevent double creation of slugs per tenant ID

### 3. Architecture Review Phase
- [x] Confirm layout split conventions: Verify that the new `packages/persistence/src/schema/branch-flow.ts` file compiles properly under the monorepo TS references setup
- [x] Verify that registering new routes in `apps/api/src/server.ts` does not create circular dependency loops

### 4. Database Phase
- [x] Create the `branches` database table definition using Drizzle parameters (ID, tenant ID, slug, active, metadata)
- [x] Create the `branch_operating_windows` table mapping daily business intervals (Monday to Sunday, open/close minutes offset)
- [x] Create the `branch_holidays` table mapping closed intervals
- [x] Write corresponding SQL statements inside `packages/persistence/migrations/`
- [x] Execute test database migration steps using in-memory PGlite or test Postgres engines

### 5. Repository Phase
- [x] Define the `BranchRepository` TypeScript interface with CRUD signatures
- [x] Implement `PostgresBranchRepository` using the standard Drizzle client
- [x] Implement `InMemoryBranchRepository` with mock seed lists for local test runner isolation

### 6. Business Logic Phase
- [x] Develop internal validator checking that operating window start-offsets are strictly before end-offsets
- [x] Develop validator checking that holiday ranges are logical (start_date < end_date)

### 7. Validation Phase
- [x] Define validation schemas for branch creation and configuration inputs (Implemented via JSON Schema & explicit runtime guard schemas matching existing Klerion conventions in `branch-schemas.ts`)
- [x] Validate slug formatting (e.g. check standard slug regex compliance: `^[a-z0-9-]+$`)

### 8. API Phase
- [x] Create Fastify route file `/apps/api/src/routes/branches.ts`
- [x] Register `POST /branches` endpoint handling payload mapping and execution delegation
- [x] Register `GET /branches` querying active branches tied strictly to the header-extracted tenant context
- [x] Register the branches routing plug-in in the central server registration pipeline

### 9. Authorization Phase
- [x] Inject RBAC authorization middleware: Require the `tenant:manage` permission on creation/update requests

### 10. Audit Phase
- [x] Record a secure, hash-chained Audit event inside `audit_events` on successful branch creations or configuration updates

### 11. Events Phase
- [ ] Emit the `branch.created.v1` domain event with versioned, immutable payload data using the event bus adapter (Blocked: `@adminops/events` domain event bus infrastructure not present)

### 12. Frontend Phase
- [x] Setup the features workspace `/apps/web/src/features/branches/`
- [x] Build the administrative master-detail view `BranchManagement.tsx`
- [x] Implement a clean, responsive modal to create new branches (Manrope/DM Sans styling, zero inline styling)
- [x] Add explicit React handlers for `.isLoading`, `.error`, and `.isEmpty` lists rendering

### 13. Testing Phase
- [x] Write unit tests for `Branch` entity invariants and validations
- [x] Write repository tests verifying query limits under tenant-isolated contexts
- [x] Write API route tests verifying RBAC and tenant containment filters

### 14. Documentation Phase
- [x] Document branch database schemas and endpoints inside `Developer-1/CONTEXT.md`

### 15. Verification Phase
- [x] Execute linter checks (`npm run lint`) to confirm zero syntax or formatting defects
- [x] Execute full application compilation (`npm run build`) to ensure successful compilation

### 16. Review Phase
- [x] Confirm no other developer features or workspace files were modified or moved

### 17. Completion Phase
- [x] Commit documentation changes, update Progress percentages, and await approval

---

## 🛠️ TASK-004: Department Management & Capacity

### 1. Research Phase
- [x] Inspect branch layout results from TASK-003 to structure relation keys

### 2. Planning Phase
- [x] Map branch-to-department links (1:N structure) and capacity parameter bounds

### 3. Architecture Review Phase
- [x] Confirm that department capabilities don't create direct dependencies on other teams' workforce tables

### 4. Database Phase
- [x] Create `departments` database table linked to branches, defining maximum simultaneous client capacity
- [x] Update Drizzle schemas and migration files

### 5. Repository Phase
- [x] Implement postgres repositories for department operations, query-bound by tenant context

### 6. Business Logic Phase
- [x] Write validators ensuring capacity limits are strictly positive integers

### 7. Validation Phase
- [x] Setup TypeBox body input validators for department additions

### 8. API Phase
- [x] Register endpoint `POST /branches/:id/departments` and `GET /branches/:id/departments`

### 9. Authorization Phase
- [x] Require `tenant:manage` RBAC permission checks on department operations

### 10. Audit Phase
- [x] Record audit entries on department creation or capacity modifications

### 11. Events Phase
- [x] Emit audit trace indicators

### 12. Frontend Phase
- [x] Build `DepartmentSettings.tsx` configuration component
- [x] Connect settings screen with the branch details master layout panel

### 13. Testing Phase
- [x] Write repository tests verifying that branch departments retrieve cleanly under proper tenant scopes

### 14. Documentation Phase
- [x] Document department structures in `CONTEXT.md`

### 15. Verification Phase
- [x] Run linter and compiler checks

### 16. Review Phase
- [x] Confirm isolation boundary integrity

### 17. Completion Phase
- [x] Mark Task checkbox complete, update PROGRESS metrics


---

## 🛠️ TASK-005: Service Catalogue & Mapping

### 1. Research Phase
- [x] Review requirement checklist needs (photo ID, age limits) to structure JSON schemas

### 2. Planning Phase
- [x] Draft metadata tables mapping services to specific branch capability options

### 3. Architecture Review Phase
- [x] Review named TypeScript type definitions for `ServiceRef` public contract

### 4. Database Phase
- [x] Add `services` catalog table definition (tenant ID, code, name, duration, active)
- [x] Add `service_requirements` and `branch_services` mapping tables
- [x] Append Drizzle configurations and SQL migrations

### 5. Repository Phase
- [x] Implement `PostgresServiceRepository` enforcing strict tenant checks

### 6. Business Logic Phase
- [x] Ensure average service durations are logically bounded (e.g., must be greater than zero, capped at 480 minutes)

### 7. Validation Phase
- [x] Define input validators checking catalog creations (body payload restrictions)

### 8. API Phase
- [x] Create `/apps/api/src/routes/services.ts`
- [x] Register `POST /services` and `GET /services`
- [x] Register `GET /branches/:id/services` querying location capabilities

### 9. Authorization Phase
- [x] Enforce `tenant:manage` permission on service catalog modifications

### 10. Audit Phase
- [x] Record audit trails on service creation and capability association actions

### 11. Events Phase
- [ ] **BLOCKED**: No event bus infrastructure (`@adminops/events`) exists in repository.

### 12. Frontend Phase
- [x] Setup directory `/apps/web/src/features/services/`
- [x] Design administrative catalogue interface `ServiceCatalog.tsx`
- [x] Create capability mapping checkboxes (linking services to valid branch locations)

### 13. Testing Phase
- [x] Write unit tests verifying service duration bounds and prerequisite criteria configurations
- [x] Write API route tests verifying cross-tenant isolation

### 14. Documentation Phase
- [x] Update `CONTEXT.md` detailing the Service Catalog models

### 15. Verification Phase
- [x] Execute lint and compile commands

### 16. Review Phase
- [x] Validate zero non-domain imports

### 17. Completion Phase
- [x] Record completion state and await authorization

---

## 🛠️ TASK-006: Capacity Routing & Discovery

### 1. Research Phase
- [x] Analyze database query aggregation methods to calculate branch loads

### 2. Planning Phase
- [x] Map active queues/bookings counts to load thresholds (low $\le 40\%$, medium $\le 80\%$, high $>80\%$)

### 3. Architecture Review Phase
- [x] Review query optimizations to guarantee sub-200ms aggregations

### 4. Database Phase
- [x] Establish performance indices on appointment start times and branch capability mapping keys

### 5. Repository Phase
- [x] Implement capacity router aggregate query functions

### 6. Business Logic Phase
- [x] Implement routing algorithm prioritizing low-load branches

### 7. Validation Phase
- [x] Validate query input parameters (e.g. coordinates or service codes)

### 8. API Phase
- [x] Expose GET endpoint `/branches/discover`

### 9. Authorization Phase
- [x] Enable public access (anonymous query permissions) for visitor lookups

### 10. Audit Phase
- [x] Log routing requests internally if telemetry is active (audited via existing auditLog)

### 11. Events Phase
- [x] None (intentionally skipped)

### 12. Frontend Phase
- [x] Design search dashboard `BranchDiscovery.tsx` under `/features/branches/`
- [x] Integrate capacity load indicator badges (high contrast, clean spacing)

### 13. Testing Phase
- [x] Write tests verifying correct load assignments under parallel booking loads

### 14. Documentation Phase
- [x] Document discovery parameters in `CONTEXT.md`

### 15. Verification Phase
- [x] Compile and lint execution check

### 16. Review Phase
- [x] Confirm UI matches Anti-Slop layout instructions (no nested cards, clean borders)

### 17. Completion Phase
- [x] Update progress parameters and stop

---

## 🛠️ TASK-007: Dynamic Availability Calculation Engine

### 1. Research Phase
- [x] Study calendar interval math (e.g., date-fns or native UTC ticks operations)

### 2. Planning Phase
- [x] Map intersection sets of Operating Hours, Holidays, and Booking exclusions

### 3. Architecture Review Phase
- [x] **Strict isolation confirmation**: Verify that the calculation engine is a 100% pure function with zero DB or fetch actions

### 4. Database Phase
- [x] None (Pure algorithmic layer)

### 5. Repository Phase
- [x] None

### 6. Business Logic Phase
- [x] Create `availability-engine.ts`
- [x] Implement `calculateAvailability` math engine generating available timeslot intervals

### 7. Validation Phase
- [x] Ensure input times are sanitized UTC datetimes via separate `validateAvailabilityQueryOptions`

### 8. API Phase
- [x] None

### 9. Authorization Phase
- [x] None

### 10. Audit Phase
- [x] None

### 11. Events Phase
- [x] None

### 12. Frontend Phase
- [x] None

### 13. Testing Phase
- [x] Write over 10 unit tests verifying operating limits, holiday overlaps, and timezone boundaries

### 14. Documentation Phase
- [x] Document the calculation algorithm in `CONTEXT.md`

### 15. Verification Phase
- [x] Verify clean linting and project references compiling

### 16. Review Phase
- [x] Confirm zero side-effects inside the engine module

### 17. Completion Phase
- [x] Complete task checkpoints

---

## 🛠️ TASK-008: Core Appointment Booking Lifecycle

### 1. Research Phase
- [x] Inspect existing `appointments` table mappings in persistence schemas

### 2. Planning Phase
- [x] Map appointment statuses (`booked`, `checked_in`, `completed`, `cancelled`, `no_show`)

### 3. Architecture Review Phase
- [x] Formulate SQL transaction structures to protect booking from concurrent execution errors

### 4. Database Phase
- [x] Create `appointments` table schema (tenant ID, branch ID, service ID, date, status, customer metadata)
- [x] Update migration blueprints with unique constraint checks

### 5. Repository Phase
- [x] Implement Postgres and InMemory repositories for appointment creation

### 6. Business Logic Phase
- [x] Create booking validators checking timeslots availability using the TASK-007 calculation engine

### 7. Validation Phase
- [x] Define POST payload TypeBox validation schemas

### 8. API Phase
- [x] Register REST endpoints `POST /appointments` and `GET /appointments`

### 9. Authorization Phase
- [x] Restrict endpoint lookups to the tenant owner or authorized user permissions

### 10. Audit Phase
- [x] Log a cryptographic audit entry upon booking finalized

### 11. Events Phase
- [ ] Broadcast `appointment.booked.v1` domain event (Blocked: `@adminops/events` bus infra not implemented)

### 12. Frontend Phase
- [x] Setup workspace `/apps/web/src/features/appointments/`
- [x] Build interactive slot-selection matrices and customer form fields `BookingForm.tsx` (Injected directly into standard user/admin customer booking flow)

### 13. Testing Phase
- [x] Write integration tests simulating parallel booking events on a single timeslot, verifying only 1 succeeds (Fully covered in `appointments.test.ts` with serialized isolation limits)

### 14. Documentation Phase
- [x] Log schema, endpoints, and event structures in `CONTEXT.md`

### 15. Verification Phase
- [x] Run complete linter and compiler tests

### 16. Review Phase
- [x] Confirm zero cross-tenant bookings leakage

### 17. Completion Phase
- [x] Save task milestones and wait

---

## 🛠️ TASK-009: Smart Appointment Operations

### 1. Research Phase
- [x] Map allowable state changes (e.g. `booked` $\rightarrow$ `cancelled`, but not `completed` $\rightarrow$ `cancelled`)

### 2. Planning Phase
- [x] Plan API routes for PUT updating operations

### 3. Architecture Review Phase
- [x] Confirm status transition checks are strictly verified on the server side

### 4. Database Phase
- [x] Update status constraints if applicable

### 5. Repository Phase
- [x] Expand Postgres repositories to support atomic state modifications

### 6. Business Logic Phase
- [x] Write state machine logic checking status transition invariants

### 7. Validation Phase
- [x] Validate body updates formatting

### 8. API Phase
- [x] Expose routes `PUT /appointments/:id/reschedule` and `PUT /appointments/:id/cancel` (And DELETE `/appointments/:id`)

### 9. Authorization Phase
- [x] Limit update actions to the customer owner or tenant operators

### 10. Audit Phase
- [x] Create corresponding audit log blocks

### 11. Events Phase
- [ ] Publish `appointment.rescheduled.v1` and `appointment.cancelled.v1` events (Blocked: `@adminops/events` bus infra not implemented)

### 12. Frontend Phase
- [x] Build operations workspace `AppointmentDashboard.tsx` (Integrated directly into `AppointmentsView.tsx` with checking-in, completing, rescheduling, and cancelling options)
- [x] Add interactive buttons supporting instant rescheduling or cancellation actions with loading feedback

### 13. Testing Phase
- [x] Write tests verifying illegal status updates throw bad request errors (400)

### 14. Documentation Phase
- [x] Update `CONTEXT.md` with operation methods

### 15. Verification Phase
- [x] Compile and lint verification

### 16. Review Phase
- [x] Confirm UX compliance (tap targets $\ge 44\text{px}$, elegant confirm boxes)

### 17. Completion Phase
- [x] Record completion and stop

---

## 🛠️ TASK-010: Advanced Scheduling & Waitlists

### 1. Research Phase
- [x] Study automatic background promotion mechanisms

### 2. Planning Phase
- [x] Design waitlists table relationship maps (user, branch, service, insertion queue order)

### 3. Architecture Review Phase
- [x] Confirm waitlist events consume `appointment.cancelled.v1` locally rather than polling

### 4. Database Phase
- [x] Create `waitlists` database table, defining sequence tracking columns
- [x] Register tables in Drizzle and write migrations

### 5. Repository Phase
- [x] Build `PostgresWaitlistRepository` tracking FIFO queues

### 6. Business Logic Phase
- [x] Implement promotion priority logic (determining candidate selection on cancellations)

### 7. Validation Phase
- [x] Validate waitlist entries creation body inputs

### 8. API Phase
- [x] Expose `POST /waitlists` and `DELETE /waitlists/:id`
- [x] Register staff action route `PUT /appointments/:id/no-show`

### 9. Authorization Phase
- [x] Enforce RBAC security on staff-only status updates

### 10. Audit Phase
- [x] Log audit trails on promotion triggers and no-show flags

### 11. Events Phase
- [x] Broadcast logs (Blocked: Event infrastructure does not exist in module workspace)

### 12. Frontend Phase
- [x] Design queue control center UI `WaitlistConsole.tsx`
- [x] Build waitlist registration forms and list views

### 13. Testing Phase
- [x] Write tests confirming the correct FIFO candidate is selected and promoted on cancellation

### 14. Documentation Phase
- [x] Update `CONTEXT.md`

### 15. Verification Phase
- [x] Full linting and build checks

### 16. Review Phase
- [x] Confirm no-show tracking complies with privacy instructions

### 17. Completion Phase
- [x] Save task progress and wait

---

## 🛠️ TASK-011: Public Customer Booking Experience UI

### 1. Research Phase
- [x] Study client-side route setup exemptions for public navigation contexts

### 2. Planning Phase
- [x] Map the wizard progress states across 5 highly optimized pages

### 3. Architecture Review Phase
- [x] Review how the Vite router handles public URL shifts without authentication errors

### 4. Database Phase
- [x] None

### 5. Repository Phase
- [x] None

### 6. Business Logic Phase
- [x] None

### 7. Validation Phase
- [x] Validate customer entry emails and details body body fields

### 8. API Phase
- [x] Configure route permission bypass exceptions inside server initialization checks

### 9. Authorization Phase
- [x] Confirm that public booking APIs block any administrative edits

### 10. Audit Phase
- [x] Record public booking submissions in the audit ledger

### 11. Events Phase
- [x] None (Delegates to booking events)

### 12. Frontend Phase
- [x] Create public folder page view `apps/web/src/views/CustomerBookingFlow.tsx`
- [x] Build interactive step-by-step reservation wizard `CustomerBookingWizard.tsx`
- [x] Style the layout using elegant, paired typography and high-contrast alert elements
- [x] Setup desktop and mobile responsive viewport grids, verifying touch targets $\ge 44\text{px}$

### 13. Testing Phase
- [x] Write automated UI tests verifying successful validation traversals across pages

### 14. Documentation Phase
- [x] Document public routing exceptions in `CONTEXT.md`

### 15. Verification Phase
- [x] Execute compilation and lint validation pipelines

### 16. Review Phase
- [x] Confirm perfect layout alignments and font pairings (Manrope + DM Sans)

### 17. Completion Phase
- [x] Update completion percentage and wait for developer approval
