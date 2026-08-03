# Developer 2 Workspace — Klerion Platform

## Overview
This directory serves as the isolated, dedicated engineering workspace and documentation hub for **Developer 2** on the Klerion project. 

Developer 2 is responsible for:
1. **Commercial Module #2**: Virtual Queue & Remote Check-In
2. **Commercial Module #7**: Omnichannel Notifications & Reminder Automation

---

## Workspace Documentation Structure

| Document | Purpose |
|---|---|
| [`TODO.md`](./TODO.md) | **Single Source of Truth** for Developer 2 implementation status, milestones, task checklists, blockers, dependencies, and testing gates. |
| [`PROGRESS.md`](./PROGRESS.md) | Chronological engineering journal recording session outcomes, current focus, and overall progress. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Immutable audit log of created/modified/deleted files, database migrations, and contract versioning. |
| [`TEST_LOG.md`](./TEST_LOG.md) | Running history of designed, implemented, and executed unit, integration, and E2E test suites. |
| [`ARCHITECTURE_NOTES.md`](./ARCHITECTURE_NOTES.md) | Record of architectural decision records (ADRs), domain boundary models, trade-offs, and technical debt. |

---

## Module Ownership Boundaries

### Backend Ownership
- Domain Modules:
  - `modules/domains/queue/**` (Queue definitions, ticketing, state machine, wait time engine)
  - `modules/platform/notifications/**` (Template engine, provider abstraction, retry queue, delivery logging)
- API Routes & Controllers:
  - `apps/api/src/routes/queues.ts`
  - `apps/api/src/routes/check-in.ts`
  - `apps/api/src/routes/notifications.ts`
  - `apps/api/src/realtime/**` (Server-Sent Events manager & stream handlers)

### Frontend Ownership
- Feature Workspaces:
  - `apps/web/src/features/queue/**` (Queue Management Console, Display Board, Counter view)
  - `apps/web/src/features/check-in/**` (Remote check-in mobile portal & Walk-in kiosk)
  - `apps/web/src/features/notifications/**` (Notification logs, template manager, provider settings)

---

## Published Contracts & Domain Events

### Published Contracts (Owned by Developer 2)
- `QueueRef`: Interface defining public queue details (`id`, `name`, `code`, `status`, `tenantId`, `branchId`).
- `QueueTicketRef`: Interface defining ticket details (`id`, `ticketNumber`, `status`, `estimatedWaitMinutes`, `position`).
- `QueueSnapshot`: DTO representing current real-time queue state for clients & SSE streams.
- `NotificationRequest`: Payload schema for dispatching email/SMS notifications.

### Published Domain Events (Owned by Developer 2)
- `queue.ticket_joined.v1`
- `queue.ticket_called.v1`
- `queue.ticket_transferred.v1`
- `notification.delivered.v1`
- `notification.failed.v1`

---

## Consumed External Contracts (Owned by Other Developers)
- **Developer 1**: `BranchRef` (Branch details), `ServiceRef` (Service details), `AppointmentRef` (Appointment details).
- Cross-domain interactions occur strictly via published TypeScript interfaces, REST APIs, or immutable domain events.

---

## Recent Milestones Completed
- **Session 3**: Implemented `QueueTicket` and `Queue` Aggregate Roots with lifecycle state machines and ticket issuance.
- **Session 4**: Implemented `PostgresQueueRepository`, `PostgresTicketRepository`, `InMemoryQueueRepository`, and `InMemoryTicketRepository` with tenant isolation.
- **Session 5**: Implemented `WaitTimeCalculator` domain service with historical rolling moving averages, priority weighting, depth calculations, and range formatting (`17–25 mins`).
- **Session 6**: Implemented PostgreSQL atomic ticket sequence generation and concurrent idempotency handling under high load (100 concurrent requests, zero gaps/duplicates).
- **Session 7**: Implemented `QueueApplicationService` and `TicketApplicationService` with RBAC authorization, tenant isolation checks, and audit logging.
- **Session 8**: Implemented Fastify REST API routes (`queues.ts`, `check-in.ts`) with Zod request payload validation and error mapping.
- **Session 9**: Implemented `SSEManager` real-time connection pool manager, 15s ping heartbeat, `Last-Event-ID` replay buffer, and Fastify route `GET /api/realtime/queues/:queueId/stream`.
- **Session 10**: Implemented `@klerion/notifications` domain entity (`Notification`), status/channel enums, `NotificationTemplateEngine`, and `EmailNotificationProvider` / `SMSNotificationProvider`.
- **Session 11**: Implemented `NotificationService` application service with exponential backoff retries, Fastify Notification API routes (`GET /api/notifications`, `POST /api/notifications/test`, `POST /api/notifications/:id/retry`), and domain event publishing (`notification.delivered.v1`, `notification.failed.v1`).
- **Session 12**: Implemented `QueueDashboardView`, `QueueCounterView`, `QueueDisplayBoardView`, `useQueueRealtimeStream` SSE hook, and ticket counter API endpoints (`call-next`, `recall`, `skip`, `complete`, `transfer`).
- **Session 13**: Implemented `RemoteCheckInView`, `WalkInKioskView`, `AppointmentCheckInView`, and check-in API client methods.
- **Session 14**: Implemented `NotificationLogsView` and `NotificationTemplatesView` with paginated telemetry logs, status indicators, error audit details, retry triggers, test notification modal, mustache placeholder extraction, syntax validation, and live template preview rendering.
- **Session 15**: Completed Milestone 7 Enterprise Hardening & E2E Verification with end-to-end customer journey test, multi-tenant isolation suite, regression test suite, and final documentation sign-off.
- **Session 16**: Reorganized Milestone 6 frontend roadmap strictly by user personas without altering any source code or implementation status.
- **Session 17**: Refactored frontend workspace into 5 role-based portal layouts (`AdminLayout`, `StaffLayout`, `CustomerLayout`, `DisplayLayout`, `KioskLayout`) with route protection and RBAC guards without altering backend logic or domain contracts.
- **Session 18**: Refactored presentation layer across all frontend views and components with SVG vector iconography (`lucide-react`), standardized branding ("Klerion Administrative Operations Platform"), WCAG AA contrast, and zero emoji clutter.
- **Session 19**: Restructured frontend information architecture to separate 3 core user portals (Admin Portal, Staff Portal, Customer Portal) from deployment modes (TV Display, Walk-In Kiosk) under a dedicated "Display Modes" navigation group.
- **Session 20**: Completed comprehensive code quality review, frontend architecture review, verification test execution (100% green pass rate across unit, integration, realtime, and frontend tests), and final integration readiness sign-off.



---

## How Future Sessions Continue
At the beginning of every implementation session:
1. Read `docs/developer-2/TODO.md` to identify the current milestone and next highest-priority task.
2. Review `docs/developer-2/PROGRESS.md` for session context.
3. Verify cross-team dependencies and blockers.
4. Execute implementation with tests.
5. Update all documentation files in `docs/developer-2/` upon completion.
