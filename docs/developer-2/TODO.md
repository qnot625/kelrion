# Project Overview

- **Current Milestone**: Milestone 7 - Enterprise Hardening & E2E Verification (Completed - 100%)
- **Overall Completion Percentage**: 100%
- **Current Sprint**: Sprint 7 (Final E2E Verification & Sign-off)
- **Current Focus**: Developer 2 Deliverables Completion & Verification Sign-off
- **Last Updated Date**: 2026-08-01

---

# Milestones

| Milestone | Description | Status | Completion % | Dependencies | Risks |
|---|---|---|---|---|---|
| **M1** | Domain Foundation & Database Persistence | Completed | 100% | None | Low |
| **M2** | Core Queue Engine & State Machine | Completed | 100% | M1 | Medium |
| **M3** | Application Services & REST API Layer | Completed | 100% | M2, Dev 1 Contracts | Medium |
| **M4** | Realtime Infrastructure (SSE Event Stream) | Completed | 100% | M3 | High (Connection Resilience) |
| **M5** | Omnichannel Notifications & Reminder Engine | Completed | 100% | M3 | Medium (Provider Retries) |
| **M6** | Frontend Workspaces & Customer Check-In Journeys | Completed | 100% | M3, M4, M5 | Medium |
| **M7** | Enterprise Hardening, Cross-Domain Contracts & E2E Verification | Completed | 100% | M1-M6 | High |

---

# Feature Checklist

## Milestone 1: Domain Foundation & Database Persistence

### Queue Domain Database Schema (`packages/persistence/src/schema.ts`)
- [x] Define `queues` table (id, tenant_id, branch_id, name, code, prefix, strategy, is_active, created_at, updated_at)
- [x] Define `queue_tickets` table (id, tenant_id, queue_id, ticket_number, display_number, priority_level, status, customer_name, customer_phone, customer_email, appointment_id, service_id, counter_number, joined_at, called_at, served_at, completed_at, cancelled_at)
- [x] Define `queue_snapshots` table (id, tenant_id, queue_id, active_tickets_count, average_wait_seconds, snapshot_at)
- [x] Define `notifications` table (id, tenant_id, recipient, channel, template_id, status, metadata, retry_count, last_error, sent_at, created_at)
- [x] Define database relationships and foreign key constraints
- [x] Create database migration for Developer 2 tables (`packages/persistence/migrations/0002_queue_and_notifications.sql`)
- [x] Export new schema entities from `packages/persistence/src/schema.ts`

### Domain Entities & Aggregates (`modules/domains/queue/src`)
- [x] Create `QueueId`, `TicketId`, `TenantId`, `BranchId` Value Objects (`modules/domains/queue/src/value-objects/identifiers.ts`)
- [x] Create `TicketNumber` Value Object (Format: Prefix + Sequence) (`modules/domains/queue/src/value-objects/ticket-number.ts`)
- [x] Create `TicketStatus` Enum (`waiting`, `called`, `in_service`, `completed`, `no_show`, `cancelled`, `transferred`) (`modules/domains/queue/src/enums/ticket-status.ts`)
- [x] Create `QueuePriority` Enum (`standard`, `vip`, `appointment`, `emergency`) (`modules/domains/queue/src/enums/queue-priority.ts`)
- [x] Create `QueueTicket` Aggregate Root with complete state transition methods (`modules/domains/queue/src/aggregates/queue-ticket.ts`)
- [x] Create `Queue` Aggregate Root with active ticket management (`modules/domains/queue/src/aggregates/queue.ts`)
- [x] Create `IQueueRepository` Interface (`modules/domains/queue/src/repositories/queue-repository.ts`)
- [x] Create `ITicketRepository` Interface (`modules/domains/queue/src/repositories/ticket-repository.ts`)
- [x] Create `PostgresQueueRepository` in `packages/persistence/src/postgres-queue-repository.ts`
- [x] Create `PostgresTicketRepository` in `packages/persistence/src/postgres-ticket-repository.ts`
- [x] Create `InMemoryQueueRepository` for unit tests
- [x] Add domain unit tests for Queue state transitions and invariants

---

## Milestone 2: Core Queue Engine & State Machine

### Wait Time Estimation Engine
- [x] Create `WaitTimeCalculator` domain service (`modules/domains/queue/src/services/wait-time-calculator.ts`)
- [x] Implement historical moving average calculation based on completed tickets
- [x] Implement queue depth calculation
- [x] Add support for priority weighting in wait time estimation
- [x] Format output as realistic range (e.g. "10–15 mins") to avoid false precision

### Concurrency & Numbering System
- [x] Implement atomic ticket number generation using PostgreSQL sequences / atomic transaction locks
- [x] Implement idempotent ticket creation logic
- [x] Add concurrency tests for ticket generation under load

---

## Milestone 3: Application Services & REST API Layer

### Application Services (`modules/domains/queue/src/application`)
- [x] Create `QueueApplicationService` (create queue, update configuration, pause/resume, activate/deactivate)
- [x] Create `TicketApplicationService` (join queue, call next, recall, skip, complete, cancel, transfer, no-show, snapshot)
- [x] Implement tenant isolation checks on all service methods
- [x] Implement RBAC authorization checks (Owner/Staff vs Member)
- [x] Integrate audit logging for every state transition via `IAuditLogger`

### API Route Handlers (`apps/api/src/routes`)
- [x] Create `apps/api/src/routes/queues.ts` (GET /api/queues, POST /api/queues, GET /api/queues/:id/snapshot)
- [x] Create `apps/api/src/routes/check-in.ts` (POST /api/check-in/remote, POST /api/check-in/walk-in, POST /api/check-in/appointment)
- [x] Add request body validation using Zod / Fastify schema
- [x] Register new route handlers safely in `apps/api/src/server.ts` or route manager

---

## Milestone 4: Realtime Infrastructure (SSE Event Stream)

### Server-Sent Events Manager (`apps/api/src/realtime`)
- [x] Create `SSEManager` class managing tenant-isolated connection pools
- [x] Implement GET `/api/realtime/queues/:queueId/stream` endpoint
- [x] Implement SSE heartbeat interval (15s ping)
- [x] Implement `Last-Event-ID` header parsing & event replay buffer
- [x] Implement client disconnect cleanup and error handling
- [x] Connect Queue domain state transitions to SSE push notifications

---

## Milestone 5: Omnichannel Notifications & Reminder Automation

### Notification Platform Core (`modules/platform/notifications/src`)
- [x] Create `Notification` Domain Entity & `NotificationStatus` Enum
- [x] Create `INotificationProvider` Interface
- [x] Implement `EmailNotificationProvider` (SMTP/Console Adapter)
- [x] Implement `SMSNotificationProvider` (Console/Webhook Adapter)
- [x] Create `NotificationTemplateEngine` (Handle variable interpolation)
- [x] Create `NotificationService` application service
- [x] Implement retry mechanism with exponential backoff for failed deliveries
- [x] Create `apps/api/src/routes/notifications.ts` (GET /api/notifications, POST /api/notifications/test)
- [x] Define published domain events: `notification.delivered.v1`, `notification.failed.v1`

---

## Milestone 6 — Frontend Applications

### A. Admin Portal (System Administration & Branch Management)

**Purpose**: System administration and branch management interface used by Owners and Administrators.

#### Layout & Navigation
- [x] Create `AdminLayout` for system and branch administration (`/admin`)
- [x] Restrict access to `OWNER` / `ADMIN` roles with RBAC guards
- [x] Implement portal tab navigation (Dashboard, Queues, Notifications, Templates, Reports, Settings)

#### Administrative Views
- [x] Integrate `QueueDashboardView` for live multi-queue overview and queue health metrics
- [x] Integrate `NotificationLogsView` for delivery history, error logs, and retries
- [x] Integrate `NotificationTemplatesView` for SMS/Email template administration and syntax validation
- [x] Create Administrative Reporting summary (wait-time telemetry, SLA delivery rate, completed ticket count)
- [x] Create System & Tenant Settings workspace

---

### B. Staff Portal (Counter Operations & Check-In)

**Purpose**: Daily branch operations interface used by counter operators, receptionists, and staff.

#### Layout & Navigation
- [x] Create `StaffLayout` for counter workspace and check-in desk (`/staff`)
- [x] Restrict access to `STAFF` or `OWNER` roles with RBAC guards
- [x] Implement staff navigation tabs (Counter Workspace, Appointment Check-In)

#### Staff Counter Workspace & Check-In
- [x] Integrate `QueueCounterView` for staff counter operations
- [x] Implement Call Next ticket action
- [x] Implement Recall Ticket action
- [x] Implement Skip Ticket action
- [x] Implement Complete Ticket action
- [x] Implement Transfer Ticket action
- [x] Integrate `AppointmentCheckInView` for scheduled appointment check-in and ticket conversion

---

### C. Customer Portal (Self-Service Remote Check-In)

**Purpose**: Customer self-service interface accessed via mobile web browsers.

#### Layout & Navigation
- [x] Create `CustomerLayout` for customer self-service mobile portal (`/customer`)
- [x] Ensure zero exposure of administrative navigation, notification logs, or staff controls

#### Customer Remote Check-In
- [x] Integrate `RemoteCheckInView` for mobile queue join
- [x] Display active ticket information and ticket number
- [x] Calculate estimated wait time range
- [x] Display live position tracker and queue depth
- [x] Handle SSE reconnection and position updates

---

### D. Public Display Portal (Lobby TV Display)

**Purpose**: Lobby TV Display board for public waiting areas.

#### Layout & Navigation
- [x] Create `DisplayLayout` for lobby TV display (`/display`)
- [x] Ensure complete removal of sidebars, headers, login menus, and administrative controls

#### Public Display Board
- [x] Integrate `QueueDisplayBoardView` for clean lobby board rendering
- [x] Display Now Serving tickets with counter numbers
- [x] Display Upcoming Tickets list
- [x] Integrate live SSE stream updates
- [x] Implement auto-refresh and layout responsiveness
- [x] Support full-screen display mode

---

### E. Self-Service Kiosk Portal (Walk-In Self-Service)

**Purpose**: Touchscreen walk-in self-service kiosk located inside branch lobbies.

#### Layout & Navigation
- [x] Create `KioskLayout` for walk-in self-service kiosk (`/kiosk`)
- [x] Isolate kiosk interface from administrative headers and staff menus

#### Walk-In Kiosk
- [x] Integrate `WalkInKioskView` for walk-in registration
- [x] Implement service selection workflow
- [x] Collect customer contact information
- [x] Implement ticket printing / receipt display
- [x] Display QR Code for remote position tracking

---

### F. Shared Frontend Infrastructure & Layout Testing

#### Routing & Layout Testing
- [x] Role-Based Portal Layouts & Access Control test suite (`apps/web/tests/layouts.test.ts`)
- [x] Information Architecture restructuring: 3 main user portals (Admin Portal, Staff Portal, Customer Portal) and separate Display Modes section (TV Display, Walk-In Kiosk)
- [x] Information Architecture unit test assertion in `apps/web/tests/layouts.test.ts`
- [x] AdminLayout RBAC authorization guard and tab switching
- [x] StaffLayout RBAC authorization guard and counter workspace action dispatching
- [x] CustomerLayout interface isolation guarantees
- [x] DisplayLayout clean lobby view guarantees (no sidebar, no admin controls)
- [x] KioskLayout touchscreen self-service guarantees


---

## Milestone 7: Enterprise Hardening & E2E Verification

- [x] End-to-End customer journey test (Book appointment -> Walk-in -> Call next -> Notification -> Complete)
- [x] Multi-tenant isolation test suite across all Developer 2 routes and streams
- [x] Regression test suite for existing Appointment / Auth / Tenant features
- [x] Documentation sign-off (`docs/developer-2/*`)

---

# Testing Checklist

### Domain Tests
- [x] Queue state machine transitions
- [x] Ticket status invariants
- [x] Wait-time calculation logic

### Repository Tests
- [x] PostgreSQL tenant-isolated query tests (`packages/persistence/tests/repositories.test.ts`)
- [x] In-memory repository implementation tests

### API Tests
- [x] Queue CRUD endpoint tests
- [x] Check-in endpoint tests
- [x] Notification endpoint tests

### Integration Tests
- [x] Appointment -> Queue ticket conversion flow
- [x] Queue transition -> Audit log generation

### Realtime Tests
- [x] SSE connection establishment & authentication
- [x] SSE heartbeat & reconnection replay

### Notification Tests
- [x] Template variable rendering tests
- [x] Provider failure retry logic tests

### Frontend Tests
- [x] Queue counter view interaction tests
- [x] Remote check-in status display tests

### Accessibility Tests
- [x] Mobile check-in view WCAG AA compliance
- [x] Public display board contrast & scale verification

### Performance Tests
- [x] Concurrent check-in benchmark (50 req/sec)

### Security Tests
- [x] RBAC authorization enforcement on staff routes
- [x] Tenant header validation tests

### Regression Tests
- [x] Existing Appointment API & persistence tests pass without modification

### End-to-End Tests
- [x] Full remote check-in to service completion journey

---

# Documentation Checklist

- [x] `docs/developer-2/README.md` created
- [x] `docs/developer-2/TODO.md` created
- [x] `docs/developer-2/PROGRESS.md` created
- [x] `docs/developer-2/CHANGELOG.md` created
- [x] `docs/developer-2/TEST_LOG.md` created
- [x] `docs/developer-2/ARCHITECTURE_NOTES.md` created
- [x] Published contracts (`QueueRef`, `QueueTicketRef`) documented
- [x] Domain events schema documented

---

# Known Risks

| Risk | Impact | Likelihood | Mitigation | Owner |
|---|---|---|---|---|
| Concurrent ticket number collision | High | Medium | Use PostgreSQL atomic sequence or `FOR UPDATE` transaction locks | Dev 2 |
| SSE client drops behind proxies | Medium | High | Implement 15s heartbeats & `Last-Event-ID` recovery buffer | Dev 2 |
| Notification provider downtime | Medium | Medium | Implement exponential backoff retry queue with delivery status tracking | Dev 2 |

---

# Notes
Developer 2 strictly owns domain modules `modules/domains/queue`, `modules/platform/notifications`, API routes `apps/api/src/routes/queues.ts`, `apps/api/src/routes/check-in.ts`, `apps/api/src/routes/notifications.ts`, SSE manager `apps/api/src/realtime/`, and frontend features under `apps/web/src/features/`. Cross-domain contracts from Developer 1 (`AppointmentRef`, `BranchRef`, `ServiceRef`) are consumed without modification.
