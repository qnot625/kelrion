# Build Progress

Tracks engineering progress against the epics in [docs/18_INITIAL_BACKLOG.md](adminops-project-execution-pack/docs/18_INITIAL_BACKLOG.md). Updated as code lands, not as work is planned.

**Stage closed: 2026-07-28.** Everything below is committed, pushed and green in CI. See [Picking this back up](#picking-this-back-up) for where to start next.

## Status legend

- [x] Done and verified (typecheck/lint/test passing)
- [ ] Not started

## Read this first: the UI promises more than the backend delivers

The company console looks like a finished product. Most of it is not wired to anything. The app labels this in-product ("Unfinished module records are clearly marked as preview data"), but it is easy to miss in a screenshot.

| Console screen | Backing |
|---|---|
| Sign in / Create organisation | **Real** — `POST /tenants`, `POST /auth/signup`, `POST /auth/login` |
| Users & roles | **Real** — `GET /users`, `PATCH /users/:id/roles` |
| Audit trail | **Real** — `GET /audit-events`, hash-chain verified in the UI |
| Appointments | **Real API**, with a hardcoded `preview` array as fallback |
| Live queue | **Hardcoded.** "Call next" is a local `array.slice(1)`. Nav shows a green "Live" badge. |
| Recruitment | **Hardcoded** kanban. No state, no API. |
| Overview dashboard | **Hardcoded** metrics, chart and branch-performance bars |
| Reports | **Hardcoded** |

Only four tables exist: `tenants`, `users`, `appointments`, `audit_events`.

## What is actually built

### Epic E01 — Monorepo, environments and delivery pipeline

- [x] npm workspaces monorepo (`apps/`, `packages/`, `modules/platform/`, `modules/domains/`)
- [x] Shared strict TypeScript config, shared ESLint flat config, project references
- [x] Backend CI — typecheck → lint → test → build on push/PR ([ci.yml](.github/workflows/ci.yml))
- [x] Web CI — typecheck → lint → build, path-filtered to `apps/web/**` ([web-ci.yml](.github/workflows/web-ci.yml))
- [ ] IaC for dev/staging infrastructure
- [ ] OpenTelemetry / structured logging (Fastify's logger is currently disabled)

### Epic E02 — Tenant and organization core

- [x] `Tenant` entity, repository interface, slug validation
- [x] `TenantContext` (AsyncLocalStorage) + `requireTenantContext()`
- [x] Postgres repository; slug uniqueness enforced by a DB constraint
- [ ] **Branch / location entity — not started.** This is the blocker described below.
- [ ] Department, team, legal entity
- [ ] Branch-delegated administration

### Epic E03 — Identity and authorization

- [x] `User` entity, tenant-scoped email uniqueness (composite unique index)
- [x] scrypt password hashing with timing-safe verification
- [x] JWT sessions (HS256, `jose`), sign + verify
- [x] RBAC: `owner`/`staff`/`member` → permissions, `requirePermission()` route guard
- [x] First signup in a tenant bootstraps as `owner`; later signups default to `member`
- [x] Role management: `GET /users`, `PATCH /users/:id/roles`, owner-gated, last-owner demotion blocked (409), audited with previous roles
- [ ] OIDC / SSO, MFA
- [ ] Invite flow (roles can only be changed for users who already signed up)
- [ ] ABAC — ownership/attribute rules beyond role → permission
- [ ] Joiner/mover/leaver lifecycle

### Epic E08 — Audit (documents/privacy not started)

- [x] Per-tenant hash-chained events — each hashes its content plus the previous event's hash
- [x] `verifyChainIntegrity()` detects both mutated and deleted events
- [x] Emitted for `tenant.created`, `user.signed_up`, `user.logged_in`, `user.roles_updated`, `appointment.booked|checked_in|completed`
- [x] `GET /audit-events` gated behind `tenant:manage`
- [x] Postgres appends under a per-tenant advisory lock so concurrent writers cannot fork the chain
- [ ] Documents, object storage, classification, malware scanning
- [ ] Consent, retention, deletion, data-subject requests

### Epic E09 / E10 — Branch and customer flow

- [x] `Appointment` entity, booking rules, tenant-isolated repository
- [x] Lifecycle booked → checked_in → completed (+ cancel/no-show) with illegal-transition rejection
- [x] Postgres repository with upsert-on-transition
- [ ] **Service catalogue** — `serviceName` is free text; no duration, eligibility or branch capability
- [ ] **Queue engine** — no ticketing, no call/recall/transfer, no real-time transport of any kind
- [ ] Availability calculation, waitlist, calendar integration

### packages/persistence

- [x] Drizzle schema for all four tables, FK cascades, tenant-scoped indexes
- [x] Idempotent SQL migration
- [x] Postgres implementations of every repository interface — no interface changes were needed
- [x] Tests run against real Postgres via PGlite (WASM), not mocks
- [x] `drizzle-orm` ≥0.45.2 to clear GHSA-gpj5-g38j-94v9
- [ ] Migration versioning — `runMigrations` replays one `IF NOT EXISTS` file; there is no schema-version table, so the second migration will need one
- [ ] Connection pool tuning, read replicas, row-level security

### apps/api

- [x] Fastify server; tenant and auth guards scoped via Fastify encapsulation
- [x] A token minted for tenant A is rejected against tenant B's slug (401)
- [x] Postgres when `DATABASE_URL` is set, in-memory otherwise; refuses to start in production without it
- [ ] Rate limiting, CORS policy, request logging, error reporting
- [ ] OpenAPI/schema-first contracts (routes hand-validate `unknown` bodies)

### apps/web

- [x] React 19 + Vite console: auth, onboarding wizard, dashboard shell, 7 views
- [x] Verified running end to end against the live API
- [ ] **No tests at all**; excluded from root ESLint (`lint` is just `tsc --noEmit`)
- [ ] Most views are preview data (see table above)

## Verification status

Last full pass, 2026-07-28:

- `npm run typecheck`, `npm run lint`, `npm run build` — clean from scratch
- `npm test` — **48/48 passing** across six workspaces (api 18, identity 11, persistence 5, audit 5, branch-flow 5, tenancy 4)
- `apps/web`: `pnpm typecheck` and `pnpm build` clean
- Manually driven in a browser: create organisation → onboarding → dashboard → audit trail → users & roles, with zero console errors

Known non-blocking issue: `npm audit` reports 5 high-severity advisories, all in the dev-only eslint → `minimatch` → `brace-expansion` chain. Not shipped in runtime code; fixing needs a breaking eslint 10 bump.

## Not started

Epics E04 (design system), E05 (forms), E06 (workflow/approvals), E07 (notifications), E11 (customer portal), E12 (workforce), E13 (service desk), E14 (analytics), E15 (integrations), E16 (SaaS control plane), E17 (pilot launch).

## Picking this back up

### The blocker to resolve first

**Branches do not exist.** The console shows "Victoria Island", "Ikeja" and "Abuja Central" across the dashboard, queue and branch-performance bars, but there is no branch entity, table or column anywhere in the backend. Epic E02 calls for "organization, branch, department, team and location"; only `tenant` was built.

This blocks most of what remains in Branch & Customer Flow: you cannot queue at a branch, define which services a branch offers, route a booking, or compute branch performance. The domain module is named `branch-flow` and has no branches.

### Suggested order

1. **Branch / location entity** (completes E02) — unblocks everything below
2. **Service catalogue** (completes E09) — duration, eligibility, branch capability; availability cannot be computed without it
3. **Queue engine** (E10) — the headline feature and the most visible thing currently faked; needs a real-time transport (SSE or WebSocket), of which the stack has none
4. **Notifications** (E07) — book → remind → "you're next" is the actual customer loop

Steps 1–2 are unglamorous but cheap. Step 3 is not buildable without them.

### Debt worth clearing alongside

- `apps/web` has no tests and no real lint. Folding it back into the npm workspace would fix both, at the cost of touching two CI workflows.
- No migration versioning — the next schema change forces the issue.
- No observability: no OpenTelemetry, no structured logging, no error tracking.
- CI runs PGlite-backed tests; a service-container Postgres would catch driver-level differences.

### A recommendation about scope

Stop adding preview-only screens. Recruitment and Reports are demo-ware for epics the plan places 12–24 months out. Every additional stub widens the gap between what the console appears to do and what it does, which gets expensive the first time it is shown to a design partner.
