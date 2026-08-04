# Klerion: Six-Developer Execution Plan

**Status:** Proposed launch execution model  
**Scope:** 12 strongest commercial modules from the 50-module catalogue  
**Team size:** 6 developers, 2 commercial modules per developer  
**Primary rule:** each developer owns a bounded domain and exclusive folders; cross-domain collaboration happens through contracts and events, not by editing another developer's implementation.

## 1. Current repository reality

Klerion currently has a verified foundation rather than a complete product:

- Multi-tenant organization creation and tenant context.
- User signup/login, JWT sessions, RBAC and role administration.
- Hash-chained audit events.
- Appointment booking and its basic lifecycle.
- PostgreSQL/PGlite persistence and CI.
- A React/Vite company console.

The most important backend gap is the absence of a branch/location and service catalogue. The UI displays branches, queues, recruitment and analytics, but most of those records are preview data. Only tenants, users, appointments and audit events currently have real tables.

The next stage must replace preview screens with complete vertical slices. Do not add more demo-only screens.

## 2. How the 12 launch modules were selected

Each module was assessed against six criteria:

1. Pain urgency and frequency.
2. Number of industries that can buy it.
3. Ease of explaining the financial or operational value.
4. Ability to cross-sell other Klerion modules.
5. Fit with Klerion's current repository and original customer-flow concept.
6. Delivery risk for a six-person team.

Identity, tenancy, RBAC and audit are not counted among the 12 because they are platform foundations already substantially implemented. They remain mandatory for every module.

## 3. The 12 strongest launch modules

| Priority | Catalogue module | Commercial reason | Launch state |
|---:|---|---|---|
| 1 | **#2 Virtual Queue and Remote Check-In** | Klerion's clearest differentiator for banks, hospitals, public offices and service centres; visibly reduces congestion and uncertainty. | Build now |
| 2 | **#1 Smart Appointment Scheduling** | Broad demand across nearly every service business; creates an immediate customer-facing product and feeds queue demand. | Existing foundation; complete it |
| 3 | **#21 Request and Approval Workflow Engine** | Every organization has leave, expense, purchase, access and exception approvals; one engine supports many paid use cases. | Build now |
| 4 | **#11 Time, Attendance and Clock-In/Clock-Out** | Easy to sell to SMEs and multi-branch organizations; produces daily operational value and recurring use. | Build now |
| 5 | **#25 Internal Service Desk and Employee Service Catalogue** | Gives HR, IT, finance, facilities and admin one request channel with ownership, status and SLA. | Build now |
| 6 | **#3 Branch and Service Discovery with Capacity Routing** | Prevents customers visiting the wrong branch and is the missing prerequisite for appointments, queues and branch analytics. | Build first |
| 7 | **#14 Employee Master Records and Organization Directory** | Foundation for attendance, leave, onboarding, approvals and access; useful to almost every employer. | Build now |
| 8 | **#32 Case, Complaint and SLA Management** | Strong fit for banks and regulated service providers; provides traceability, escalation and resolution accountability. | Build now |
| 9 | **#7 Omnichannel Notifications and Reminder Automation** | Converts bookings, queues, approvals and cases into complete customer journeys; reduces no-shows and manual follow-up. | Build now |
| 10 | **#13 Leave, Absence and Availability Management** | Frequent employee workflow with clear value; naturally cross-sells attendance and approvals. | Build now |
| 11 | **#19 Digital Onboarding and Offboarding** | Coordinates HR, IT, facilities and managers; creates measurable time savings and reduces missed access-removal tasks. | Build now |
| 12 | **#41 Executive Command Centre and Business Intelligence** | Gives decision-makers the reason to buy the suite rather than isolated tools; converts operational events into management visibility. | Build after event contracts |

### Modules deliberately postponed

- Applicant tracking, AI interviews and assessments: attractive, but recruitment is crowded, AI hiring carries additional fairness/compliance risk, and the current repo has no talent-domain foundation.
- Payroll, accounting, procurement and billing: valuable but require country-specific tax/accounting depth and more integrations.
- Full document management/e-signature: important, but object storage, malware scanning, retention and legal-signature requirements make it a separate delivery programme.
- No-code app builder and autonomous agents: high differentiation but too broad before stable forms, workflows, permissions and events exist.
- Kiosk hardware/signage: add after the queue and public check-in APIs are stable.

## 4. Six non-conflicting workstreams

## Developer 1 — Organization, Branches and Scheduling

**Commercial modules**

1. #3 Branch and Service Discovery with Capacity Routing.
2. #1 Smart Appointment Scheduling.

**Exclusive backend ownership**

- `modules/platform/organization/**`
- `modules/domains/branch-flow/**`
- `apps/api/src/routes/branches.ts`
- `apps/api/src/routes/services.ts`
- `apps/api/src/routes/appointments.ts`

**Exclusive frontend ownership**

- `apps/web/src/features/branches/**`
- `apps/web/src/features/services/**`
- `apps/web/src/features/appointments/**`

**Deliverables**

- Branch/location, department and operating-hours models.
- Service catalogue with duration, requirements, eligibility and branch capability.
- Staff/service capacity and operating calendar.
- Availability calculation.
- Book, reschedule, cancel, waitlist and no-show flows.
- Branch/service discovery API and admin UI.
- Appointment views must use real API data only.

**Published contracts**

- `BranchRef`, `ServiceRef`, `OperatingWindow`, `AppointmentRef`.
- Events: `branch.created.v1`, `service.published.v1`, `appointment.booked.v1`, `appointment.rescheduled.v1`, `appointment.cancelled.v1`.

**Dependency rule**

Other developers may store branch, service or appointment IDs but must not update Developer 1's tables directly.

---

## Developer 2 — Real-Time Queue and Messaging

**Commercial modules**

1. #2 Virtual Queue and Remote Check-In.
2. #7 Omnichannel Notifications and Reminder Automation.

**Exclusive backend ownership**

- `modules/domains/queue/**`
- `modules/platform/notifications/**`
- `apps/api/src/routes/queues.ts`
- `apps/api/src/routes/check-in.ts`
- `apps/api/src/routes/notifications.ts`
- `apps/api/src/realtime/**`

**Exclusive frontend ownership**

- `apps/web/src/features/queue/**`
- `apps/web/src/features/check-in/**`
- `apps/web/src/features/notifications/**`

**Deliverables**

- Queue definitions, tickets, priorities and stages.
- Join remotely, branch check-in, call, recall, transfer, skip, no-show and complete.
- Transactional ticket state and ordered queue events.
- SSE first; reconnect snapshot and idempotent commands.
- Wait-time ranges, not false-precision single values.
- Email and SMS provider adapter, templates, retries and delivery status.
- Booking reminders, queue-position alerts and "you are next" notifications.
- Live branch floor and customer queue views with no hardcoded queue records.

**Published contracts**

- `QueueRef`, `QueueTicketRef`, `QueueSnapshot`, `NotificationRequest`.
- Events: `queue.ticket_joined.v1`, `queue.ticket_called.v1`, `queue.ticket_transferred.v1`, `notification.delivered.v1`, `notification.failed.v1`.

**Dependency rule**

Consume Developer 1's frozen branch/service/appointment contracts. Do not edit `branch-flow` or organization tables.

---

## Developer 3 — Workforce Core and Attendance

**Commercial modules**

1. #14 Employee Master Records and Organization Directory.
2. #11 Time, Attendance and Clock-In/Clock-Out.

**Exclusive backend ownership**

- `modules/domains/workforce-core/**`
- `apps/api/src/routes/employees.ts`
- `apps/api/src/routes/attendance.ts`

**Exclusive frontend ownership**

- `apps/web/src/features/employees/**`
- `apps/web/src/features/attendance/**`

**Deliverables**

- Employee record, employment status, manager, department and branch placement.
- Employee directory and manager/team queries.
- Clock in/out, break and correction events.
- Offline-safe client event IDs and idempotent synchronization contract.
- Attendance exceptions, manual correction and approval handoff.
- Daily attendance and employee attendance profile views.
- Privacy-safe attendance: no continuous tracking or invasive surveillance.

**Published contracts**

- `EmployeeRef`, `EmploymentPlacement`, `AttendanceEvent`, `AttendanceSummary`.
- Events: `employee.created.v1`, `employee.placement_changed.v1`, `attendance.clocked_in.v1`, `attendance.clocked_out.v1`, `attendance.exception_detected.v1`.

**Dependency rule**

Developer 3 owns the canonical employee identity. Other domains reference `employeeId`; they do not add columns to the employee table without a contract change.

---

## Developer 4 — Workforce Lifecycle and Availability

**Commercial modules**

1. #13 Leave, Absence and Availability Management.
2. #19 Digital Onboarding and Offboarding.

**Exclusive backend ownership**

- `modules/domains/workforce-lifecycle/**`
- `apps/api/src/routes/leave.ts`
- `apps/api/src/routes/onboarding.ts`
- `apps/api/src/routes/offboarding.ts`

**Exclusive frontend ownership**

- `apps/web/src/features/leave/**`
- `apps/web/src/features/onboarding/**`
- `apps/web/src/features/offboarding/**`

**Deliverables**

- Leave types, policies, balances, requests, cancellations and calendars.
- Availability projection for managers and scheduling consumers.
- Joiner checklists covering HR, manager, IT, facilities and finance tasks.
- Offboarding access-removal checklist and evidence.
- Employee and manager self-service views.
- Workflow integration through Developer 5's published API, not direct workflow-table access.

**Published contracts**

- `LeaveRequestRef`, `AvailabilityWindow`, `LifecycleChecklistRef`.
- Events: `leave.requested.v1`, `leave.approved.v1`, `employee.onboarding_started.v1`, `employee.offboarding_started.v1`, `employee.offboarding_completed.v1`.

**Dependency rule**

Reference Developer 3's `EmployeeRef`. Do not edit employee or attendance models. Use workflow and notification interfaces instead of changing those modules.

---

## Developer 5 — Workflow, Approvals and Employee Services

**Commercial modules**

1. #21 Request and Approval Workflow Engine.
2. #25 Internal Service Desk and Employee Service Catalogue.

**Exclusive backend ownership**

- `modules/platform/forms/**`
- `modules/platform/workflow/**`
- `modules/domains/internal-services/**`
- `apps/api/src/routes/forms.ts`
- `apps/api/src/routes/workflows.ts`
- `apps/api/src/routes/requests.ts`
- `apps/api/src/routes/approvals.ts`
- `apps/api/src/routes/service-desk.ts`

**Exclusive frontend ownership**

- `apps/web/src/features/forms/**`
- `apps/web/src/features/workflows/**`
- `apps/web/src/features/requests/**`
- `apps/web/src/features/approvals/**`
- `apps/web/src/features/service-desk/**`

**Deliverables**

- Versioned form schemas, conditional validation, drafts and submissions.
- Versioned workflow definitions and instances.
- Human approval tasks, due dates, delegation, escalation and cancellation.
- Request catalogue for HR, IT, finance, facilities and administration.
- Case ownership, priority, SLA, status, comments and internal notes.
- Employee request portal, agent workspace and unified approval inbox.
- Idempotent actions and complete runtime history.

**Published contracts**

- `FormDefinitionRef`, `SubmissionRef`, `WorkflowDefinitionRef`, `WorkflowInstanceRef`, `HumanTaskRef`, `InternalRequestRef`.
- Events: `request.submitted.v1`, `approval.assigned.v1`, `approval.completed.v1`, `sla.breached.v1`, `workflow.completed.v1`.

**Dependency rule**

Other teams start workflows through an application service such as `WorkflowGateway.start(...)`; they never write workflow tables or embed domain-specific rules inside the workflow engine.

---

## Developer 6 — Customer Cases and Executive Intelligence

**Commercial modules**

1. #32 Case, Complaint and SLA Management.
2. #41 Executive Command Centre and Business Intelligence.

**Exclusive backend ownership**

- `modules/domains/customer-service/**`
- `modules/platform/analytics-eventing/**`
- `modules/domains/governance-intelligence/**`
- `apps/api/src/routes/cases.ts`
- `apps/api/src/routes/analytics.ts`
- `apps/api/src/routes/reports.ts`

**Exclusive frontend ownership**

- `apps/web/src/features/cases/**`
- `apps/web/src/features/analytics/**`
- `apps/web/src/features/executive/**`

**Deliverables**

- Customer cases, complaints, categories, ownership, priority, SLA and escalation.
- Customer status/history view and service-agent workspace.
- Canonical event envelope and event-version registry.
- Operational read models for customer flow, workforce and internal services.
- Organization operations, branch performance, workforce and executive dashboards.
- Metric dictionary: definition, owner, source, refresh rate and permissions.
- Dashboard drill-down to authorized underlying records.
- Remove all hardcoded dashboard and report metrics.

**Published contracts**

- `CustomerCaseRef`, `SlaPolicyRef`, `DomainEventEnvelope`, `MetricDefinition`, `DashboardQuery`.
- Events: `customer_case.opened.v1`, `customer_case.escalated.v1`, `customer_case.resolved.v1`.

**Dependency rule**

Analytics consumes published domain events and read APIs. It must not query another team's write tables directly or change their schemas.

## 5. Conflict-prevention repository changes required before parallel work

The current repository has shared files that would cause constant merge conflicts. Complete this preparation in a short integration sprint before the six streams begin.

### 5.1 Split persistence by module

Replace the single shared schema/migration hotspot with module-owned files:

```text
packages/persistence/src/schema/
  platform.ts
  organization.ts
  branch-flow.ts
  queue.ts
  workforce-core.ts
  workforce-lifecycle.ts
  workflow.ts
  internal-services.ts
  customer-service.ts
  analytics.ts
  index.ts

packages/persistence/migrations/
  0001_initial.sql
  0002_organization.sql
  0003_branch_flow.sql
  ...
```

- Each developer edits only their schema and migration file.
- Add a schema migration history table before the second migration.
- `schema/index.ts` only re-exports module schemas and is owned by the integration maintainer.

### 5.2 Route registration

Each domain exports one route plugin. Avoid six developers editing `apps/api/src/server.ts`.

```text
apps/api/src/module-registry.ts
modules/domains/<domain>/src/http/register-routes.ts
```

Only the integration maintainer edits `module-registry.ts`; feature teams edit their own route plugin.

### 5.3 Frontend feature registry

Refactor the console so developers do not all modify `App.tsx`, `Shell.tsx` and global CSS.

```text
apps/web/src/features/<feature>/
  routes.tsx
  navigation.ts
  api.ts
  components/
  pages/
  styles.module.css
```

- Each feature exports route and navigation descriptors.
- One registry composes descriptors.
- Shared design tokens/components are frozen during feature sprints.
- Feature-specific CSS remains inside its feature folder.

### 5.4 Contracts and events

Create:

```text
packages/contracts/
packages/events/
```

Rules:

- Cross-domain types live in `packages/contracts`, not copied between modules.
- Event names are namespaced and versioned.
- Event payloads are immutable after publication.
- Breaking changes create a new version, not a silent edit.
- No domain imports another domain's persistence implementation.

### 5.5 Shared-file ownership

Only the designated integration maintainer may routinely edit:

- root `package.json` and lockfiles
- root `tsconfig.json`
- root ESLint configuration
- `apps/api/src/server.ts` or its replacement registry
- `apps/web/src/App.tsx`, `Shell.tsx` and global navigation registry
- shared design tokens
- persistence schema index
- CI workflows

For this team, **Developer 1 acts as integration maintainer**. This is a merge responsibility, not permission to rewrite other developers' modules.

## 6. Delivery order

## Sprint 0 — Boundary and contract preparation (1 week)

- Merge/close stale PRs and start from a clean `main`.
- Implement migration versioning and schema split.
- Create route and frontend feature registries.
- Create contracts/event packages.
- Add `CODEOWNERS` for the six ownership zones.
- Freeze v1 contracts for BranchRef, EmployeeRef, WorkflowGateway and DomainEventEnvelope.
- Add real web tests and ESLint coverage before feature expansion.

## Sprint 1 — Domain foundations (2 weeks)

- Developer 1: branches and service catalogue.
- Developer 2: queue state machine and notification adapters using frozen branch/service contracts.
- Developer 3: employee master records.
- Developer 4: leave-policy and lifecycle models using `EmployeeRef`.
- Developer 5: forms, workflow definitions and human tasks.
- Developer 6: case model, event envelope and metric dictionary.

## Sprint 2 — First complete vertical slices (2 weeks)

- Appointment availability and booking.
- Remote queue join and branch check-in.
- Employee clock-in/out.
- Leave request and approval.
- Employee service request and manager approval.
- Customer complaint opening and SLA tracking.

Every slice must include database, domain rules, API, authorization, audit, UI and tests.

## Sprint 3 — Operational completion (2 weeks)

- Appointment rescheduling/waitlist/no-show.
- Queue call/recall/transfer and realtime reconnection.
- Notification templates/retries/delivery status.
- Attendance corrections.
- Onboarding/offboarding checklists.
- Agent workspaces and escalation.
- Initial real dashboards from domain events.

## Sprint 4 — Pilot hardening (2 weeks)

- Cross-tenant negative tests for every new repository and endpoint.
- Rate limiting, CORS policy, structured logging and error reporting.
- Real PostgreSQL service-container CI in addition to PGlite.
- Load/concurrency tests for appointment slots and queue transitions.
- Accessibility, low-bandwidth and responsive testing.
- Remove every preview-data fallback from launch modules.
- Seed/demo tenant with clearly labelled synthetic data.

## 7. Pull-request and merge rules

1. Branch names: `feat/d<developer-number>/<bounded-slice>`.
2. One vertical slice per PR; do not submit an entire module in one huge PR.
3. A PR may modify files only inside the developer's ownership zone, plus generated contract output.
4. Shared-file changes require an issue, integration-maintainer approval and a separate PR.
5. Every PR includes domain tests, persistence tests, API tests and relevant UI tests.
6. Every tenant-owned query must require `tenantId` and have a cross-tenant negative test.
7. Every state change emits an audit event and, where relevant, a domain event.
8. No frontend screen may silently show hardcoded operational data in production mode.
9. Rebase from `main` daily; merge only green, reviewed PRs.
10. Use feature flags for incomplete modules; do not expose unfinished navigation items to pilot tenants.

## 8. Definition of done for each of the 12 modules

A module is not complete until all items below are true:

- Domain model and invariants documented.
- Tenant-isolated in-memory and PostgreSQL repositories.
- Versioned migration.
- Application service and validated API contract.
- RBAC/ABAC rules enforced server-side.
- Audit events and domain events.
- Real UI connected to the API, with loading, empty, error and unauthorized states.
- Unit, repository, API and critical UI tests.
- Observability: structured logs, error metrics and important operational counters.
- Accessibility and mobile/low-bandwidth checks.
- Documentation, seed data and administrator configuration guidance.
- No preview fallback in production.

## 9. Commercial packaging

The 12 modules should be sold as four coherent packs rather than 12 unrelated tools.

| Pack | Included modules | Best initial buyers |
|---|---|---|
| **Klerion Flow** | Branch/service discovery, appointments, virtual queue, notifications | Banks, hospitals, public offices, schools, service centres |
| **Klerion Workforce** | Employee records, attendance, leave, onboarding/offboarding | SMEs, multi-branch companies, schools, retail, healthcare |
| **Klerion ServiceOps** | Request/approval engine, internal service desk | Mid-sized organizations, HR, IT, finance and facilities teams |
| **Klerion Resolve & Insight** | Customer case/SLA management, executive command centre | Banks, regulated services, customer support organizations, executives |

## 10. Recommended first pilot

Do not pilot all 12 simultaneously. The strongest first external pilot is:

1. Branch and service catalogue.
2. Appointment scheduling.
3. Virtual queue and remote check-in.
4. Notifications.
5. Customer/branch operations dashboard.

Run the workforce and internal-service packs in parallel as internal dogfood or with a second design partner. This keeps the public promise narrow while all six developers continue producing reusable platform value.
