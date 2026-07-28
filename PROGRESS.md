# Build Progress

Tracks engineering progress against the epics in [docs/18_INITIAL_BACKLOG.md](adminops-project-execution-pack/docs/18_INITIAL_BACKLOG.md). Updated as code lands, not as work is planned.

## Status legend

- [x] Done and verified (typecheck/lint/test passing)
- [~] In progress
- [ ] Not started

## Vertical slice 1 — prove the architecture (tenancy → identity → branch-flow booking)

**Status: complete and green (2026-07-28).** Scope decision: rather than building all 13 shared platform services (Epics E01–E08) before any feature, build the minimum slice needed to prove one real journey end-to-end, per [ADR-001](adminops-project-execution-pack/docs/adr/ADR-001-modular-monolith-first.md) (modular monolith, extract only on proven need).

### Epic E01 — Monorepo, environments and delivery pipeline

- [x] npm workspaces monorepo (`apps/`, `packages/`, `modules/platform/`, `modules/domains/`)
- [x] Shared strict TypeScript config (`packages/tsconfig`)
- [x] Shared ESLint flat config (`packages/eslint-config`)
- [x] TypeScript project references wired for incremental builds
- [x] CI pipeline — GitHub Actions runs typecheck → lint → test → build on push/PR to `main` ([.github/workflows/ci.yml](.github/workflows/ci.yml))
- [ ] IaC for dev/staging infrastructure
- [ ] OpenTelemetry instrumentation

### Epic E02 — Tenant and organization core

- [x] `Tenant` entity + `TenantRepository` interface (`modules/platform/tenancy`)
- [x] In-memory tenant repository (create/find by id/slug, duplicate-slug rejection)
- [x] `TenantContext` (AsyncLocalStorage) + `requireTenantContext()` enforcement primitive
- [x] Persistent Postgres repository (`packages/persistence`), slug uniqueness enforced by a DB constraint
- [ ] Branch/department/location model
- [ ] Branch-delegated administration

### Epic E03 — Identity and authorization

- [x] `User` entity, tenant-scoped uniqueness by email (`modules/platform/identity`)
- [x] Password hashing (scrypt, timing-safe verify)
- [x] Session tokens (JWT/HS256 via `jose`), sign + verify
- [x] `AuthService`: sign up, log in, verify token
- [x] Persistent Postgres user repository; same email may exist in different tenants, enforced by a composite unique index
- [x] RBAC permission model — `owner`/`staff`/`member` roles mapped to permissions (`appointments:book|manage|view`, `tenant:manage`)
- [x] First user to sign up in a tenant bootstraps as `owner`; subsequent users default to `member`
- [x] `requirePermission()` route guard returning 403 on insufficient role
- [ ] OIDC / SSO integration
- [ ] MFA
- [ ] ABAC (attribute/ownership-level rules beyond role → permission)
- [ ] Role assignment/invite flow (no way yet for an owner to promote a member)
- [ ] Joiner/mover/leaver lifecycle

### Epic E05 — Forms and submissions

- [ ] Not started (deferred — not required for the booking-only slice)

### Epic E06 — Workflow, tasks and approvals

- [ ] Not started (deferred)

### Epic E07 — Notifications

- [ ] Not started (deferred)

### Epic E08 — Documents, audit and privacy

- [x] Audit event model with per-tenant hash chaining (`modules/platform/audit`) — each event hashes its own content plus the previous event's hash
- [x] Tamper-evidence: `verifyChainIntegrity()` detects both mutated and deleted events (covered by tests that actually mutate/delete)
- [x] Events emitted for `tenant.created`, `user.signed_up`, `user.logged_in`, `appointment.booked|checked_in|completed`
- [x] `GET /audit-events` gated behind `tenant:manage` (owner-only)
- [x] Postgres audit log appends under a per-tenant advisory lock so concurrent writers cannot fork the chain
- [ ] Documents/object storage, classification, malware scan
- [ ] Consent, retention and deletion rules
- [ ] Data-subject request workflow

### Epic E09 — Appointment and service catalogue / Epic E10 — Queue and branch operations (first domain slice)

- [x] `Appointment` entity + booking rules (`modules/domains/branch-flow`)
- [x] Status lifecycle: booked → checked_in → completed, plus cancel/no-show, with illegal-transition rejection
- [x] Tenant isolation enforced at the repository layer (cross-tenant access rejected)
- [x] Persistent Postgres appointment repository with upsert-on-transition
- [ ] Service catalogue / duration / staff capability
- [ ] Real-time queue updates
- [ ] Branch live-floor dashboard

### packages/persistence — database layer

- [x] Drizzle schema for `tenants`, `users`, `appointments`, `audit_events` with FK cascades and tenant-scoped indexes
- [x] Idempotent SQL migration ([migrations/0001_initial.sql](packages/persistence/migrations/0001_initial.sql))
- [x] Postgres implementations of all four repository interfaces — no interface changes were needed, which is what the in-memory-first design was for
- [x] Tests run against **real Postgres** via PGlite (WASM), not mocks
- [x] `drizzle-orm` pinned to ≥0.45.2 to clear the SQL-injection advisory (GHSA-gpj5-g38j-94v9) present in earlier versions

### apps/api — HTTP surface

- [x] Fastify server wiring tenant-context middleware, auth routes, appointment routes, audit routes
- [x] Tenant/auth guards scoped via Fastify encapsulation (platform routes stay tenant-free; protected routes require both a valid tenant slug and a token minted for that same tenant)
- [x] Integration test exercising the full slice end-to-end (create tenant → signup → login → book → check-in → complete)
- [x] Integration test proving cross-tenant isolation (wrong tenant sees an empty list, gets 404 on someone else's appointment, gets 401 if a token from tenant A is replayed against tenant B's slug)
- [x] Selects Postgres when `DATABASE_URL` is set, in-memory otherwise; refuses to start in production without `DATABASE_URL` or `SESSION_TOKEN_SECRET`
- [x] Full API integration suite re-run against real Postgres, not just in-memory

## Verification status

Last full pass: **39/39 tests green** across six workspaces, plus `npm run typecheck`, `npm run lint`, and a clean `npm run build` from scratch. API boots and serves `GET /health` over real HTTP.

Known non-blocking issue: `npm audit` reports 5 high-severity advisories, all in the **dev-only** eslint → `@eslint/config-array` → `minimatch` → `brace-expansion` chain (DoS via unbounded expansion). Not shipped in runtime code; fixing requires a breaking eslint 10 major bump, deliberately deferred.

## Not started (everything else)

Every other epic (E04 design system/shells, E11 customer portal, E12 workforce, E13 service desk, E14 analytics, E15 integrations, E16 SaaS control plane, E17 pilot launch) is untouched.

## Next up

1. **Role management** — an owner currently has no way to promote a member to staff; the permission model exists but nothing writes roles after signup.
2. **Design system + first frontend shell (E04)** — the API has no UI in front of it yet.
3. **Forms and workflow engine (E05/E06)** — the two platform services most other domains depend on.
4. **Observability** — no OpenTelemetry, structured logging, or error tracking; Fastify's logger is currently disabled.
5. **Real Postgres in CI** — CI runs the PGlite-backed tests; a service-container Postgres would catch driver-level differences.
