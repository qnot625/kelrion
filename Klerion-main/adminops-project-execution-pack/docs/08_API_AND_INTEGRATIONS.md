# API and Integration Strategy

## API styles

- REST/JSON for public and partner APIs.
- WebSocket or Server-Sent Events for live queue and operational updates.
- Webhooks for tenant-facing event delivery.
- Asynchronous events for internal domain integration and analytics.
- Bulk import/export for onboarding and controlled data exchange.
- GraphQL only if a proven client/data-composition need justifies the added governance burden.

## API conventions

- Base path: `/api/v1/...`
- OAuth 2.0/OIDC for user and machine access.
- Tenant context derived from trusted identity/client mapping.
- Resource IDs are opaque UUIDs.
- Cursor pagination for large changing datasets.
- Consistent error format with machine code, safe message and correlation ID.
- `Idempotency-Key` required for create/action endpoints vulnerable to duplicate retries.
- Optimistic concurrency using version/ETag where conflicting updates matter.
- Rate limits by tenant, API client, user, route and plan.
- API scopes and field filtering enforce least privilege.
- Deprecation policy and changelog before breaking changes.

## Initial public API groups

- tenants and organization units, limited to authorized admins
- users, memberships and roles
- services, branches and availability
- appointments and check-ins
- queues and tickets
- employees, attendance, leave and schedules
- requests, cases, tasks and approvals
- forms and submissions
- documents and signed URLs
- notifications/preferences
- reports/export jobs
- webhooks and integration connections

## Webhook events

Examples:

- `appointment.created.v1`
- `appointment.cancelled.v1`
- `customer.checked_in.v1`
- `queue.ticket.called.v1`
- `queue.ticket.completed.v1`
- `attendance.clocked_in.v1`
- `attendance.exception_created.v1`
- `leave.requested.v1`
- `approval.decided.v1`
- `case.sla_breached.v1`
- `employee.onboarding_started.v1`
- `document.expiring.v1`

Webhook requirements:

- HMAC or asymmetric signature.
- Event ID and timestamp.
- Retry with exponential backoff.
- Delivery history and replay.
- Endpoint verification and secret rotation.
- Tenant-configurable subscriptions and filters.
- Payload minimization and stable schema versions.

## Integration categories

| Category | Initial need | Pattern |
|---|---|---|
| Identity/SSO | Enterprise login, directory sync | OIDC/SAML/SCIM provider adapter |
| Calendar | Staff availability and appointment sync | OAuth connector + conflict policy |
| Messaging | Email, SMS, WhatsApp, push | Provider adapter with fallback and delivery events |
| Payments | Deposits, invoices, subscriptions | Payment-provider adapter; platform stores references, not raw card data |
| Video | Remote interviews and consultations | Meeting provider link/session adapter |
| Payroll/accounting | Export timesheets, expenses, invoices | File/API connector; external system remains financial source of truth |
| Maps/location | Branch discovery and routing | Maps/geocoding provider abstraction |
| E-signature | Contracts and consent evidence | E-sign provider adapter + document callback |
| Storage/scanning | Document storage and malware detection | Signed upload, scanner pipeline, lifecycle policies |
| BI/data | Enterprise analytics export | Read replica/warehouse feeds or governed export API |
| Legacy systems | Systems without APIs | RPA only as a controlled last resort with monitoring |

## Connector architecture

Every connector contains:

1. Provider configuration schema.
2. Credential reference in a secrets manager.
3. Capability declaration.
4. Mapping/transformation rules.
5. Retry, timeout and circuit-breaker policy.
6. Idempotency and deduplication behavior.
7. Health check and operational metrics.
8. Data classification and residency notes.
9. Audit events.
10. Test/sandbox mode where supported.

## Integration anti-patterns

- Provider SDK calls scattered through business modules.
- Credentials stored in tenant configuration tables.
- Synchronous dependence on a provider for completing a local transaction.
- Silent data overwrite during synchronization.
- Undocumented field mapping.
- Webhooks accepted without signature/replay protection.
- RPA used where a stable API exists.
- One customer’s custom integration embedded in the shared domain model.
