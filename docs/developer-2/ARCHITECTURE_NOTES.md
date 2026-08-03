# Architectural Notes & Decisions (ADRs) — Developer 2

## ADR-001: Strict Monorepo & Workspace Alignment
- **Status**: Accepted
- **Context**: The Klerion repository uses npm workspaces (`package.json`) and Fastify + Vite + Drizzle ORM + PostgreSQL.
- **Decision**: All Developer 2 code will reside in `modules/domains/queue`, `modules/platform/notifications`, `apps/api/src/routes/`, `apps/api/src/realtime/`, and `apps/web/src/features/`. No new root top-level build systems or competing ORMs will be added.

---

## ADR-002: Realtime Delivery via Server-Sent Events (SSE) over WebSockets
- **Status**: Accepted
- **Context**: The application runs behind a reverse proxy on Port 3000. Real-time updates are needed for queue position changes and counter displays.
- **Decision**: Use HTTP Server-Sent Events (SSE) with `Last-Event-ID` recovery buffer and 15-second heartbeat intervals. SSE is unidirectional (server -> client), lighter weight than WebSockets, and natively handles auto-reconnection and HTTP/2 proxying without custom socket protocols. Client-to-server actions (e.g. call next, skip) remain standard REST API calls.

---

## ADR-003: Concurrency Control & Ticket Number Generation
- **Status**: Accepted
- **Context**: Multiple customers or staff members may join/call queues simultaneously across multiple API instances.
- **Decision**: Ticket numbers will be generated atomically inside PostgreSQL transactions using database sequences or `SELECT FOR UPDATE` locks on the queue record. This guarantees no duplicate ticket numbers and strict sequential ordering per queue.

---

## ADR-004: Decoupled Omnichannel Notifications via Domain Events
- **Status**: Accepted
- **Context**: Queue state transitions (e.g., ticket called, appointment reminder) must trigger SMS/Email notifications without coupling the core domain logic directly to notification providers.
- **Decision**: Queue domain services will emit immutable domain events (`queue.ticket_called.v1`). The `NotificationService` subscribes to these events or processes `NotificationRequest` commands asynchronously, rendering templates and handling provider retries independently.

---

## ADR-005: Multi-Tenant Isolation Pattern
- **Status**: Accepted
- **Context**: Klerion is a multi-tenant platform. Data leakage between tenants is a critical vulnerability.
- **Decision**: Every query in `PostgresQueueRepository`, `PostgresTicketRepository`, and `PostgresNotificationRepository` MUST require `tenantId` in its WHERE clause. SSE streams are scoped strictly per tenant and checked during handshake authorization.

---

## ADR-006: Strongly-Typed Domain Value Objects & Enums
- **Status**: Accepted
- **Context**: Primitive obsession in domain models leads to bugs such as passing a `QueueId` where a `TicketId` is expected or allowing invalid string statuses like `"IN_PROGRESS"`.
- **Decision**: All Queue domain entities use strongly typed immutable Value Objects extending `BaseIdentifier` (`QueueId`, `TicketId`, `TenantId`, `BranchId`) and `TicketNumber` for formatted numbers (`<Prefix><Sequence>`). Statuses and priorities are guarded by `TicketStatus` and `QueuePriority` enums with strict runtime type guards.

---

## ADR-007: Domain Repository Pattern & Drizzle Mapping
- **Status**: Accepted
- **Context**: Persistence operations must decouple relational database tables (`schema.queues`, `schema.queueTickets`) from domain aggregate roots (`Queue`, `QueueTicket`) to preserve domain invariants and enforce strict tenant boundary isolation.
- **Decision**: Implemented `PostgresQueueRepository` and `PostgresTicketRepository` in `packages/persistence` utilizing Drizzle ORM and `onConflictDoUpdate` upserts. Every database query enforces tenant isolation (`eq(table.tenantId, tenantId.value)`). In-memory repositories (`InMemoryQueueRepository`, `InMemoryTicketRepository`) in `@klerion/queue` implement the exact same repository interfaces (`IQueueRepository`, `ITicketRepository`) for fast domain unit testing without requiring database infrastructure.

---

## ADR-008: Wait Time Estimation Strategy & Range Formatting
- **Status**: Accepted
- **Context**: Exact wait time predictions (e.g. "13.4 minutes") create false precision and lead to customer frustration when missed due to operational variance.
- **Decision**: Implemented `WaitTimeCalculator` as a pure, framework-independent domain service. It computes historical moving average service times over recent completed tickets (filtering out corrupt/incomplete records), factors in priority weighting (`EMERGENCY` 1.5x, `APPOINTMENT` 1.2x, `VIP` 1.1x, `STANDARD` 1.0x), adjusts for active counter count, and outputs a realistic display range (e.g., `"17–25 mins"`) with confidence ratings (`HIGH`, `MEDIUM`, `LOW`).

---

## ADR-009: Application Service Layer Architecture & RBAC / Audit Enforcement
- **Status**: Accepted
- **Context**: Domain aggregate roots handle core business logic, but orchestrating repository operations, role-based authorization, multi-tenant boundary checks, domain event publishing, and audit log tracking requires a dedicated application service layer.
- **Decision**: Implemented `QueueApplicationService` and `TicketApplicationService` in `modules/domains/queue/src/application/`. All service methods accept a mandatory `UserContext` (`userId`, `tenantId`, `role`). Every service method performs:
  1. RBAC authorization validation (`OWNER`, `STAFF` vs `MEMBER`).
  2. Tenant isolation validation (`userContext.tenantId` matching resource `tenantId`).
  3. Aggregate Root domain method invocation (`Queue.pause()`, `QueueTicket.call()`, `QueueTicket.complete()`, `QueueTicket.transfer()`).
  4. Repository persistence (`IQueueRepository`, `ITicketRepository`).
  5. Audit logging via `IAuditLogger.log()` for every state transition.
  6. Domain event publishing via `IDomainEventPublisher.publish()` for event-driven downstream consumers.

---

## ADR-010: Fastify REST API Route Architecture & Request Validation
- **Status**: Accepted
- **Context**: The application requires light, high-performance REST API endpoints for queue management and remote/walk-in/appointment check-ins while preserving clean architectural separation between HTTP route handlers and core domain/application business logic.
- **Decision**: Implemented Fastify route plugins (`apps/api/src/routes/queues.ts` and `apps/api/src/routes/check-in.ts`) mounted on the Fastify server instance (`apps/api/src/server.ts`).
  - **Validation**: Reused `zod` schema validation (`createQueueSchema`, `remoteCheckInSchema`, `walkInCheckInSchema`, `appointmentCheckInSchema`) to validate request payloads before invoking application services, returning structured 400 Bad Request responses on validation failure.
  - **User Context Extraction**: Extracted tenant context and user permissions from HTTP request headers (`x-tenant-id`, `x-user-id`, `x-user-role`) into typed `UserContext` instances.
  - **Error Mapping**: Implemented domain error translation (`handleError`) mapping domain exceptions (`UnauthorizedError` -> 401, `TenantMismatchError` -> 403, `QueueNotFoundError`/`TicketNotFoundError` -> 404, `QueueInactiveError`/`QueuePausedError` -> 400) to standard REST HTTP response status codes.
  - **Decoupled Architecture**: Route handlers remain pure controllers delegating orchestration entirely to `QueueApplicationService` and `TicketApplicationService`.

---

## ADR-011: Server-Sent Events (SSE) Real-Time Streaming & Replay Buffer
- **Status**: Accepted
- **Context**: Real-time queue visualizers and customer status screens require live state updates (e.g. ticket joined, called, completed) without constant polling. HTTP Server-Sent Events (SSE) provide a unidirectional, lightweight stream native to web browsers with built-in auto-reconnection headers (`Last-Event-ID`).
- **Decision**: Implemented `SSEManager` (`apps/api/src/realtime/sse-manager.ts`) and Fastify endpoint `GET /api/realtime/queues/:queueId/stream` (`apps/api/src/routes/realtime.ts`).
  - **Tenant & Queue Connection Pools**: Connections are registered under isolated pools keyed by `${tenantId}:${queueId}`. Broadcast events are delivered exclusively to clients matching both tenant ID and queue ID, guaranteeing 100% tenant isolation.
  - **Heartbeat Ping**: A 15-second heartbeat interval (`event: heartbeat\ndata: {"timestamp":"..."}\n\n`) keeps connections active through proxies and firewalls. To prevent memory or timer leaks, the heartbeat timer automatically starts when the first client connects and stops immediately when the client count reaches zero.
  - **Last-Event-ID Replay Buffer**: An in-memory ring buffer (default capacity 100) records broadcast events in chronological order. Upon client connection with a `Last-Event-ID` header, missed matching events are replayed in exact chronological sequence before live streaming begins. Expired or evicted IDs return clean empty arrays without breaking the connection.
  - **Decoupled Architecture**: `SSEManager` handles message formatting and client distribution only. Domain event generation remains strictly within `QueueApplicationService` and `TicketApplicationService`, connected via `IDomainEventPublisher`.
  - **Security Considerations**: Handshake requests undergo full authentication (`x-tenant-id`) and queue authorization checks (`queueRepository.findById`) prior to hijacking the response stream. Cross-Tenant stream access returns 404/403 errors.

---

## ADR-012: Role-Based Frontend Portal Architecture & Layout Isolation
- **Status**: Accepted
- **Context**: Monolithic administrative UI dashboards mix administrative, staff, customer, display, and kiosk views into a single flat interface, violating role separation and creating visual noise.
- **Decision**: Refactored `apps/web/src` into 5 distinct role-based portal layouts (`AdminLayout`, `StaffLayout`, `CustomerLayout`, `DisplayLayout`, `KioskLayout`) inside `apps/web/src/layouts/`:
  - **Admin Portal (`/admin`)**: Exposes `QueueDashboardView`, `NotificationLogsView`, `NotificationTemplatesView`, reporting, and settings. Restricted to `OWNER` / `ADMIN` roles.
  - **Staff Portal (`/staff`)**: Exposes `QueueCounterView` and `AppointmentCheckInView`. Provides counter workspace actions (call-next, recall, skip, complete, transfer). Restricted to `STAFF` and `OWNER` roles.
  - **Customer Portal (`/customer`)**: Exposes `RemoteCheckInView` (queue join, ticket tracker, live position, wait times). Accessible to all customers/members without exposing administrative controls.
  - **Public Display Portal (`/display`)**: Exposes `QueueDisplayBoardView` ONLY. Full-screen distraction-free lobby TV display showing Now Serving and Upcoming Tickets without headers, sidebars, or control buttons.
  - **Kiosk Portal (`/kiosk`)**: Exposes `WalkInKioskView` ONLY. Touchscreen-optimized walk-in registration and receipt printer interface without administrative navigation.
  - **Routing & RBAC**: URL hash routing (`#admin`, `#staff`, `#customer`, `#display`, `#kiosk`) with universal portal switcher and active role context checks (`OWNER`, `STAFF`, `MEMBER`).





