# Port 8 — Queue Domain and Persistence

Port 8 establishes the durable queue/check-in backend while intentionally leaving realtime transport and persona-specific interfaces for later ports.

## Included in Port 8

- Tenant-scoped queue configurations per branch/service, with optional department overrides.
- Walk-in and appointment check-in.
- Daily per-branch/service ticket numbering with durable counters.
- STANDARD, PRIORITY and URGENT ordering plus bounded manual adjustment.
- Idempotent check-in keys and duplicate active appointment protection.
- Staff call, recall, start-service, complete, no-show, cancel, priority and transfer operations.
- Concurrent-serving limits per queue configuration.
- Public queue tokens for status lookup without exposing customer details.
- Append-only queue events with a monotonic tenant sequence.
- `afterSequence` event polling suitable for reconnect snapshots and the next SSE integration layer.
- In-memory and PostgreSQL repositories.
- PGlite migration/repository validation.
- Server-side module entitlement and RBAC enforcement.

## Cross-domain boundary

The platform Queue module does not import the Branch/Appointment domain. Appointment check-in receives a small `AppointmentCheckInFacts` projection through an injected resolver in the API application context. This keeps platform dependency direction intact while allowing branch-flow to remain the source of truth for appointment placement, time and status.

## Persistence guarantees

PostgreSQL uses dedicated sequence tables rather than row counts:

- `queue_ticket_sequences` allocates ticket numbers atomically by tenant, branch, service and business date.
- `queue_event_sequences` allocates a monotonic event sequence per tenant.

The event sequence is designed to support Server-Sent Events and reconnect replay without changing queue-domain semantics.

## Deferred to later ports

### Port 9 — Notifications and realtime events

- Server-Sent Events stream.
- Reconnect snapshot protocol around the Port 8 event sequence.
- Queue notification triggers and provider delivery.

### Port 10 — Persona-specific queue interfaces

- Queue administration workspace.
- Staff/counter workspace.
- Customer remote queue experience.
- Kiosk and QR-assisted check-in.
- Public display board.

This separation keeps the queue state machine and persistence stable before realtime and multi-persona UI concerns are layered on top.
