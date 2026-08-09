# Port 8 Queue Validation

Port 8 is validated as an isolated backend foundation before realtime transport and persona-specific interfaces are added.

The required gate covers:

- Root workspace install and lockfile consistency.
- TypeScript project-reference build including `@adminops/queue`.
- Backend lint.
- Queue domain tests for ordering, state transitions, idempotency, appointment windows, transfers, capacity and tenant isolation.
- Queue API tests for RBAC, entitlement enforcement, ownership boundaries, check-in, serving operations and event replay.
- PGlite/PostgreSQL tests for configuration persistence, ticket sequencing, event sequencing, migration idempotency and tenant isolation.
- Full existing Klerion backend regression suite.
- Backend production build.
- Company Console type-check, static validation and production build to ensure backend module additions do not regress the current UI.

Server-Sent Events and the queue administration/staff/customer/kiosk/display interfaces are explicitly outside this validation unit and remain Ports 9 and 10.
