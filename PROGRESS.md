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
- [ ] CI pipeline (lint/typecheck/test/build on push)
- [ ] IaC for dev/staging infrastructure
- [ ] OpenTelemetry instrumentation

### Epic E02 — Tenant and organization core

- [x] `Tenant` entity + `TenantRepository` interface (`modules/platform/tenancy`)
- [x] In-memory tenant repository (create/find by id/slug, duplicate-slug rejection)
- [x] `TenantContext` (AsyncLocalStorage) + `requireTenantContext()` enforcement primitive
- [ ] Persistent repository (Postgres)
- [ ] Branch/department/location model
- [ ] Branch-delegated administration

### Epic E03 — Identity and authorization

- [x] `User` entity, tenant-scoped uniqueness by email (`modules/platform/identity`)
- [x] Password hashing (scrypt, timing-safe verify)
- [x] Session tokens (JWT/HS256 via `jose`), sign + verify
- [x] `AuthService`: sign up, log in, verify token
- [ ] OIDC / SSO integration
- [ ] MFA
- [ ] RBAC/ABAC authorization service (only tenant isolation enforced so far, not role/permission checks)
- [ ] Joiner/mover/leaver lifecycle

### Epic E05 — Forms and submissions

- [ ] Not started (deferred — not required for the booking-only slice)

### Epic E06 — Workflow, tasks and approvals

- [ ] Not started (deferred)

### Epic E07 — Notifications

- [ ] Not started (deferred)

### Epic E08 — Documents, audit and privacy

- [ ] Not started (deferred — no audit event stream yet; this is the next real gap once the slice is proven)

### Epic E09 — Appointment and service catalogue / Epic E10 — Queue and branch operations (first domain slice)

- [x] `Appointment` entity + booking rules (`modules/domains/branch-flow`)
- [x] Status lifecycle: booked → checked_in → completed, plus cancel/no-show, with illegal-transition rejection
- [x] Tenant isolation enforced at the repository layer (cross-tenant access rejected)
- [ ] Service catalogue / duration / staff capability
- [ ] Real persistence (Postgres)
- [ ] Real-time queue updates
- [ ] Branch live-floor dashboard

### apps/api — HTTP surface

- [x] Fastify server wiring tenant-context middleware, auth routes, appointment routes
- [x] Tenant/auth guards scoped via Fastify encapsulation (platform routes stay tenant-free; protected routes require both a valid tenant slug and a token minted for that same tenant)
- [x] Integration test exercising the full slice end-to-end (create tenant → signup → login → book → check-in → complete)
- [x] Integration test proving cross-tenant isolation (wrong tenant sees an empty list, gets 404 on someone else's appointment, gets 401 if a token from tenant A is replayed against tenant B's slug)
- [x] Verified live: `npm run typecheck`, `npm test` (17/17 passing), `npm run lint`, `npm run build` (real `dist/` output per package), and a manual boot (`node --import tsx apps/api/src/index.ts`) answering `GET /health` over real HTTP

## Not started (everything else)

Every other epic (E04 design system/shells, E11 customer portal, E12 workforce, E13 service desk, E14 analytics, E15 integrations, E16 SaaS control plane, E17 pilot launch) is untouched. Deliberately deferred until the E01/E02/E03/branch-flow slice above is fully green and reviewed.

## Next up

Pick one, in rough order of what unblocks the most:

1. **CI pipeline** — run `npm run typecheck && npm test && npm run lint && npm run build` on every push (nothing enforces this yet outside of manual runs).
2. **Postgres persistence** — swap the in-memory tenant/user/appointment repositories for real ones behind the same interfaces; the interfaces were designed for this swap.
3. **RBAC/ABAC** — today only tenant isolation is enforced (a valid token for the right tenant can do anything); no role/permission checks exist yet.
4. **Audit event stream (E08)** — no action is currently recorded anywhere; this is the biggest real gap before anything customer-facing.
