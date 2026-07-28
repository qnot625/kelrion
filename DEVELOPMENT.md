# Development

How to run, test and extend this repo. For what is built versus what is still
stubbed, read [PROGRESS.md](PROGRESS.md) first — several screens in the web
console are deliberately preview data, and it is not obvious from the UI.

## Prerequisites

- Node.js 24 (CI pins `node-version: "24"`)
- npm for the backend workspaces
- pnpm (via `corepack`) for `apps/web` — it is intentionally **not** an npm
  workspace, see [Why two package managers](#why-two-package-managers)

## Repository layout

```text
apps/
  api/                 Fastify HTTP surface
  web/                 React + Vite company console (pnpm, separate toolchain)
modules/
  platform/
    tenancy/           Tenant entity, repository, AsyncLocalStorage tenant context
    identity/          Users, scrypt passwords, JWT sessions, RBAC permission model
    audit/             Hash-chained, tamper-evident audit events
  domains/
    branch-flow/       Appointments: booking and status lifecycle
packages/
  persistence/         Drizzle schema, migration, Postgres repositories
  tsconfig/            Shared strict TypeScript base
  eslint-config/       Shared flat ESLint config
```

Platform modules must not import from domain modules. Domains depend on
platform, never the reverse.

## Running the app

The console needs **both** servers. Vite proxies `/api` to the API and strips
the prefix (`vite.config.ts`), so the API must be on port 3000.

```bash
# terminal 1 — API on :3000
npm run dev

# terminal 2 — console on :5173
npm run dev:web
```

Then open <http://localhost:5173>.

There is no seed data and no default login. To get into the console, click
**Create organisation** and fill in the form — the first account created for a
tenant automatically becomes its `owner`. Any slug works as long as it is
lowercase alphanumeric with single hyphens.

Without `DATABASE_URL` the API keeps everything in memory, so restarting it
discards every tenant, user and appointment you created.

### Stopping

`Ctrl-C` in each terminal. If a port is left held:

```bash
# find the listener, then kill by PID
netstat -ano | grep -E ':(3000|5173) ' | grep LISTENING   # Windows
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill                # macOS/Linux
```

## Configuration

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | API | unset → in-memory | Postgres connection string. **Required in production** — the API refuses to start without it. |
| `SESSION_TOKEN_SECRET` | API | insecure dev value | JWT signing secret. **Required in production.** |
| `PORT` | API | `3000` | Changing this also means updating `KLERION_API_ORIGIN`. |
| `VITE_API_BASE_URL` | web | `/api` | Browser-facing prefix. Keep `/api` when using the dev proxy. |
| `KLERION_API_ORIGIN` | web (build time) | `http://localhost:3000` | Proxy target in `vite.config.ts`. |

Copy `apps/web/.env.example` to `apps/web/.env` if you need to change the web
values.

### Running against Postgres

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/klerion npm run dev
```

Migrations run automatically on startup (`runMigrations`) and are idempotent —
every statement is `IF NOT EXISTS`. There is no migration versioning table yet;
see [PROGRESS.md](PROGRESS.md) for that gap.

## Verification

```bash
npm run typecheck   # tsc -b across all project references
npm run lint        # eslint (note: apps/web is excluded)
npm test            # all workspace test suites
npm run build       # tsc -b, emits dist/ per package
```

The web app verifies separately:

```bash
cd apps/web
corepack pnpm typecheck
corepack pnpm build
```

CI runs both: [.github/workflows/ci.yml](.github/workflows/ci.yml) for the
backend on every push, and
[.github/workflows/web-ci.yml](.github/workflows/web-ci.yml) for the console,
path-filtered to `apps/web/**`.

## Testing approach

Tests use the built-in `node:test` runner — no Jest or Vitest.

Database tests run against **real Postgres compiled to WASM** (PGlite), not
mocks. `freshDatabase()` in
[packages/persistence/tests/repositories.test.ts](packages/persistence/tests/repositories.test.ts)
spins up an isolated instance and applies the migration. This is deliberate:
it already caught a real bug where Drizzle wraps driver errors, so unique
violations were never converted to domain errors. A mocked client would have
passed.

API tests use `app.inject()` rather than a live socket, so they are fast and
need no port. `apps/api/tests/postgres-integration.test.ts` runs the same HTTP
flows against PGlite to prove the stack works on a real database.

**`apps/web` has no tests.** It is also excluded from the root ESLint config;
its `lint` script is just `tsc --noEmit`.

## Architectural rules

These are enforced by review, not tooling:

- Every tenant-owned query takes a `tenantId`. Repositories filter on it in the
  `WHERE` clause — this is the isolation boundary, and there is no row-level
  security behind it yet.
- Authorization happens server-side before data access, via
  `requirePermission()`. Never trust a role claim from the client.
- Audit events are immutable facts. Corrections append a new event; never edit
  history, or the hash chain breaks.
- External input is validated at the route boundary before reaching a service.

## Why two package managers

`apps/web` was added on a branch that set the root `workspaces` to `apps/api`
rather than `apps/*`, giving the console its own pnpm toolchain and CI. The
tradeoff: the console does not share the root TypeScript project references or
lint config, and `npm test` does not cover it.

This is worth revisiting — folding `apps/web` back into the npm workspace would
give it lint coverage and one install step. It was left as-is because changing
it touches both CI workflows.

## Common gotchas

- **A role change does not affect an existing session.** Roles are baked into
  the JWT at sign-in, so a promoted user must log in again. Tests do this
  explicitly.
- **The last owner cannot be demoted** — the API returns 409. Promote someone
  else first.
- **Vite uses `strictPort`.** If 5173 is taken it fails rather than picking
  another port, which would silently break the proxy assumption.
- **First page load can be slow.** Vite compiles routes on demand; wait for the
  element you need rather than a fixed sleep.
