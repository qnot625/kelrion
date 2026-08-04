# Klerion Repository Technical Reference Manual

This document provides a highly detailed, comprehensive architectural reference of the Klerion repository. It is generated directly from code analysis to serve as a single source of truth for ongoing development, architecture compliance, and AI reasoning.

---

## 1. Repository Overview

### Purpose
Klerion is an enterprise-grade collaborative application for managing branch-flow and service operations. It delivers a multi-tenant environment with robust identity containment (RBAC), cryptographically chained audit logging, and appointment scheduling lifecycles.

### Monorepo Layout & Architecture
Klerion is structured as a **modular monorepo** utilizing npm workspaces. It isolates code into:
1. **Runtime Applications (`apps/`)**: Lightweight hosting shells that expose interfaces (HTTP or Web-based views) but delegate all business logic to modules.
2. **Platform Modules (`modules/platform/`)**: Core architectural capabilities (tenancy, identity, audit) that are domain-agnostic.
3. **Domain Modules (`modules/domains/`)**: Core business-specific rules (such as branch appointment scheduling workflows).
4. **Shared Packages (`packages/`)**: Low-level database drivers, type schemas, and compiler/linter base specifications.

### Technology Stack
- **Backend**: Node.js 24 runtime, Fastify framework, TypeScript.
- **Frontend**: React 19, Vite, custom styled CSS, Lucide icons (no Tailwind is actively used in the current stylesheets; instead, it uses highly optimized custom CSS variables and utility rule declarations).
- **Persistence Layer**: PostgreSQL database driver (`pg` pool client) mapped with **Drizzle ORM**.
- **Testing**: Node.js built-in test runner (`node --test`), **PGlite** (WASM-based Postgres engine running in-memory for testing, avoiding mock pollution).

### Build Process & Workspace Orchestration
- **TypeScript Project References**: The project leverages strict type boundary verification using composite references. `tsconfig.json` files build sequentially using `tsc -b`.
- **Dual Package Managers (The "Split")**: 
  - The core repository isolates `apps/web` from npm workspaces because the console historically utilizes `pnpm` with its own separate lockfiles, while the backend modules utilize `npm`.
  - For AI Studio's preview container, both package managers are reconciled. The root `package.json` includes `apps/web` in the npm workspaces array to support instant dependencies compilation and static bundle generation in a unified step.

---

## 2. Directory Tree

Below is the directory tree of the repository, including descriptions of why each folder exists:

```text
/
├── apps/                         # Runtime hosting surfaces
│   ├── api/                      # Fastify HTTP API service
│   │   ├── src/                  # API entry points, routing, and Fastify plugins
│   │   └── tests/                # Core vertical-slice integration and RBAC tests
│   └── web/                      # React/Vite Company Console frontend
│       ├── src/                  # Component shell, views, and local state/session engines
│       └── styles/               # Highly refined styling rules (base, shell, and views)
├── modules/                      # Business rules and platform engines
│   ├── domains/                  # Industry-specific business domain entities
│   │   └── branch-flow/          # Appointment life cycles and services
│   └── platform/                 # Infrastructure and generic business capabilities
│       ├── audit/                # Cryptographically chained, tamper-evident event loggers
│       ├── identity/             # User databases, RBAC permission models, and JWT sessions
│       └── tenancy/              # Multi-tenant context isolators
├── packages/                     # Database schemas and global configs
│   ├── persistence/              # Drizzle schema, raw SQL migrations, and Postgres repositories
│   ├── eslint-config/            # Centralized flat ESLint rules
│   └── tsconfig/                 # Unified TypeScript strict configurations
├── .env.example                  # Environment template for developers
├── DEVELOPMENT.md                # Local setup guidelines and original architecture notes
├── PROGRESS.md                   # Current project backlog status and built vs. stubbed trackers
└── dev.js                        # Multi-process development orchestrator for AI Studio
```

---

## 3. Applications

### Apps Directory Details

#### 1. `@adminops/api` (Located at `/apps/api`)
- **Purpose**: Exposes REST interfaces to frontend applications.
- **Responsibilities**: Performs HTTP serialization, executes tenant boundary validation, checks JWT authorizations, and delegates workflow execution to backend modules.
- **Entry Point**: `src/index.ts` (starts the server) and `src/server.ts` (structures the Fastify routing tree).
- **Dependencies**: `@adminops/audit`, `@adminops/branch-flow`, `@adminops/identity`, `@adminops/persistence`, `@adminops/tenancy`, and `fastify`.
- **Communication**: Accepts and serves REST JSON payloads on port 3001.
- **Build/Runtime**: Built with TypeScript project references, running directly on Node.js using ES Modules (`"type": "module"`).

#### 2. `@klerion/company-console` (Located at `/apps/web`)
- **Purpose**: Provides administrative console layouts for organizations.
- **Responsibilities**: Offers interfaces for onboarding, staff/user permissions management, appointment status check-ins, and cryptographic compliance inspection.
- **Entry Point**: `src/main.tsx` and `src/App.tsx`.
- **Dependencies**: React 19, React-DOM, Lucide-React, and Vite.
- **Communication**: Connects to `@adminops/api` endpoints using HTTP fetch wrappers under `/api/*` (Vite dev proxy points to `http://localhost:3001`).
- **Build/Runtime**: Bundled using Vite, producing minified static assets in `dist/`.

---

## 4. Shared Packages

Each shared configuration or database utility package resides in `/packages/`:

### 1. `@adminops/persistence` (Located at `/packages/persistence`)
- **Purpose**: Houses the database client connection pool, Drizzle relational schema declarations, raw SQL migrations, and concrete Postgres repositories.
- **Exports**: 
  - `schema.ts`: Database tables and composite indexes.
  - `connect.ts`: Connection instantiator (`connectPostgres`) and migration helper (`runMigrations`).
  - `postgres-*-repository.ts`: Live query executions for users, tenants, appointments, and audit events.
- **Consumers**: `apps/api` (replaces in-memory data structures with permanent Postgres records when `DATABASE_URL` is configured).
- **Internal Architecture**: Designed to be database-driver agnostic. It takes a unified `Database` pool handle so that repositories run against real PostgreSQL in development/production, but can run against the in-memory WASM-based PGlite client during tests.

### 2. `@adminops/eslint-config` (Located at `/packages/eslint-config`)
- **Purpose**: Standardizes code quality guidelines across all monorepo scopes.
- **Exports**: Modular ESLint flat configurations.

### 3. `@adminops/tsconfig` (Located at `/packages/tsconfig`)
- **Purpose**: Establishes strict compiler flags.
- **Exports**: Extensible bases (`base.json`) enforcing explicit returns, no implicit any, and strict null safety checks.

---

## 5. Modules

### Modules Directory Details

```text
modules/
├── domains/
│   └── branch-flow/              # Appointments domain
└── platform/
    ├── tenancy/                  # Tenant management
    ├── identity/                 # User credentials & RBAC
    └── audit/                    # Cryptographic logs
```

#### 1. `tenancy` (`/modules/platform/tenancy`)
- **Business Responsibility**: Defines what a Tenant represents (e.g. name, slug, status) and enforces slug-based containment.
- **Public Interfaces**: `Tenant`, `TenantRepository`, and `CreateTenantInput`.
- **Important Files**: `src/tenant.ts`, `src/tenant-repository.ts`, `src/in-memory-tenant-repository.ts`.
- **Interaction**: Sits at the bottom of the platform module hierarchy. It has no dependencies on identity or audit.

#### 2. `identity` (`/modules/platform/identity`)
- **Business Responsibility**: Governs authentication and access control. Handles user accounts, scrypt-based password hashes, JWT generation/decoding, and permission-to-role mappings.
- **Public Interfaces**: `User`, `UserRepository`, `AuthService`, `Permission`, `Role`, `TokenClaims`.
- **Important Files**: `src/auth-service.ts`, `src/user.ts`, `src/permission.ts`, `src/password.ts`.
- **Interaction**: Depends on `tenancy` to ensure user containment (e.g., users are tied to a unique `tenantId`).

#### 3. `audit` (`/modules/platform/audit`)
- **Business Responsibility**: Creates tamper-evident, chronologically sequential event chains. Every event records its context, metadata, and contains a SHA-256 hash combining its data and the preceding event's hash.
- **Public Interfaces**: `AuditEvent`, `AuditLog`, and `CreateAuditEventInput`.
- **Important Files**: `src/audit-log.ts`, `src/hash-chain.ts`, `src/in-memory-audit-log.ts`.
- **Interaction**: Platform-neutral capability utilized by route handlers to capture critical business mutations (e.g., role updates, signups, checked-in appointments).

#### 4. `branch-flow` (`/modules/domains/branch-flow`)
- **Business Responsibility**: Models appointment lifecycle statuses (`booked` $\rightarrow$ `checked_in` $\rightarrow$ `completed`), preventing illegal transitions (e.g., transitioning straight from `booked` to `completed` throws errors).
- **Public Interfaces**: `Appointment`, `AppointmentRepository`, and `AppointmentService`.
- **Important Files**: `src/appointment.ts`, `src/appointment-service.ts`, `src/in-memory-appointment-repository.ts`.
- **Interaction**: Sits in the domains directory; depends on tenancy for context but remains isolated from authentication logic.

---

## 6. API Architecture

### Fastify Framework & Routing Design
`@adminops/api` leverages Fastify's encapsulated context model. This guarantees that route guards are only active on endpoints where they are explicitly required:

```text
Fastify Server (BuildServer)
├── /health                                    [Public, Tenant-Free]
└── Tenant Scope (TenantContext onRequest)     [Requires X-Tenant-Slug]
    ├── /tenants                               [Public Tenant Registry]
    ├── /auth/signup & /auth/login             [Public auth operations]
    └── Protected Scope (AuthGuard onRequest)  [Requires Bearer JWT]
        ├── /appointments                      [RBAC: appointment:read/write]
        ├── /audit-events                      [RBAC: tenant:manage]
        └── /users                             [RBAC: tenant:manage]
```

### Encapsulated Plugins
1. **`tenant-context` (`/apps/api/src/plugins/tenant-context.ts`)**:
   - Runs `onRequest` for the Tenant Scope.
   - Grabs `x-tenant-slug` from headers.
   - Queries the DB: if found, decorates `request.tenant` with `{ tenantId, tenantSlug }`.
   - If missing or unknown, halts with `400` or `404`.
2. **`auth-guard` (`/apps/api/src/plugins/auth-guard.ts`)**:
   - Runs `onRequest` for the Protected Scope.
   - Extracts the `Authorization` Bearer token.
   - Verifies JWT signatures. Crucially, it validates that the token's `tenantId` matches the currently active `request.tenant.tenantId`, preventing cross-tenant request spoofing.
3. **`require-permission` (`/apps/api/src/plugins/require-permission.ts`)**:
   - A route-level preHandler factory. Checks if `request.auth.roles` carries the necessary `Permission` token.

### Repositories & Services Architecture
Route handlers do not run SQL queries directly. They communicate with Services or Repositories:
- **Controllers/Routers** capture parameters, validate payloads, and pass objects to Services.
- **Services** coordinate workflows (such as state machine transitions or password cryptographs).
- **Repositories** serialize and persist the final entities.

---

## 7. Frontend Architecture

### Core Layout & Conditional Routing
Klerion is an optimized Single Page Application (SPA). Instead of using a heavy library like react-router, it manages layout state in memory at `/apps/web/src/App.tsx`.
- **Stage Navigation**: The global UI switches between `"auth"` (login/signup cards), `"onboarding"` (tenant context creators), and `"app"` (dashboard console shell).
- **Route Key Swapping**: In `"app"` state, rendering swaps between views mapped under the `RouteKey` configuration:
  - `dashboard`: `<DashboardView />`
  - `appointments`: `<AppointmentsView session={session} />`
  - `queue`: `<QueueView />`
  - `users`: `<UsersView session={session} />`
  - `recruitment`: `<RecruitmentView />`
  - `audit`: `<AuditView session={session} />`
  - `reports`: `<FoundationView />`

### State & API Session Engine
- **Session Persistence**: Session parameters are saved as JSON under browser `localStorage` using keys starting with `klerion.session`.
- **API Client Hook (`/apps/web/src/lib/api.ts`)**: An instanced class mapping standard browser `fetch` requests. Whenever an authorized API call is dispatched, it automatically appends the `Authorization: Bearer <JWT>` header and the current context header `X-Tenant-Slug: <slug>`.

### Typography & Aesthetic Approach
- **Fonts**: Inter and Roboto are bypassed in favor of pairing **DM Sans** (body text, modern clean weights) and **Manrope** (bold, highly legible display headlines).
- **Color Palettes**: Avoids harsh blacks, choosing deep corporate slate-navy backgrounds (`#f5f7fb` workspace, `#0b1220` headers) with high-contrast text tags (WCAG compliance $\ge$ 4.5:1).
- **Spacing Guidelines**: Outer grid padding strictly dominates inner container margins. Interactive items (buttons, selects) feature mathematically proportioned border-radii ($\le$ 16px).

---

## 8. Database Architecture

```text
                               ┌─────────────┐
                               │   tenants   │
                               └──────┬──────┘
                                      │ (1)
             ┌────────────────────────┼────────────────────────┐
             │ (1..N)                 │ (1..N)                 │ (1..N)
     ┌───────▼───────┐        ┌───────▼───────┐        ┌───────▼───────┐
     │     users     │        │ appointments  │        │ audit_events  │
     └───────────────┘        └───────────────┘        └───────────────┘
```

### Relational Schema Definition (`/packages/persistence/src/schema.ts`)
1. **`tenants`**: Enforces a unique slug across organizations.
2. **`users`**: Features a compound unique key (`tenant_id`, `email`) ensuring users are distinct per organization, but can use the same email across separate tenants.
3. **`appointments`**: Records customer, service, schedule intervals, and state. Optimized with a composite index on (`tenant_id`, `start_at`).
4. **`audit_events`**: Holds structured JSON payloads (`metadata`) and cryptographic blocks. Indexed on (`tenant_id`, `occurred_at`).

### Connection Pools & Testing Drivers
- **Production/Local Dev Pool**: Initiates connection pools (`pg.Pool`) using `DATABASE_URL`.
- **WASM testing (`PGlite`)**: Integrates real SQL schema evaluation during unit tests inside an isolated WASM sandbox, avoiding the slow setup or resource collision typical of container-dependent testing.

### Idempotent Migrations
- Executed on startup via `runMigrations()`.
- Reads `/packages/persistence/migrations/0001_initial.sql`.
- Splits statements on semicolons (`;`) and applies each statement in sequence.

---

## 9. Environment Variables

| Variable | Used By | Required/Optional | Default Value | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | `apps/api` | Optional (Dev) / Required (Prod) | `unset` (falls back to In-Memory) | PostgreSQL connection string. Sourced for persistence setups. |
| `SESSION_TOKEN_SECRET` | `apps/api` | Optional (Dev) / Required (Prod) | `dev-only-insecure-secret-change-me` | Signing secret for JWT tokens. Refuses to start in production if unset. |
| `PORT` | `apps/api` / `dev.js` | Optional | `3000` | Defines Fastify listening port. |
| `VITE_API_BASE_URL` | `apps/web` | Optional | `/api` | Web application client-facing API endpoint prefix. |
| `KLERION_API_ORIGIN` | `apps/web` (build) | Optional | `http://localhost:3001` | Proxy target used in `vite.config.ts` to map browser requests. |

---

## 10. Configuration Files

1. **`package.json` (Root)**: Coordinates workspace directories and runs scripts such as linter configurations (`eslint .`), composite typechecks (`tsc -b`), and multi-process start commands (`node dev.js`).
2. **`tsconfig.json` (Root)**: Structures compiler guidelines and enables standard ESM resolutions.
3. **`apps/web/vite.config.ts`**: Governs Vite bundler instructions, and sets up the server proxy forwarding `/api` paths to the API server origin.
4. **`eslint.config.js` (Root)**: Exposes modular, flat configs applying standardized parsing rules across ESM modules.

---

## 11. End-to-End Request Flow

An end-to-end trace of a user viewing organization appointments:

```text
[Browser View: AppointmentsView]
  │
  ├── 1. Dispatches listAppointments() call on the API Client instance.
  ▼
[API Client Hook: klerionApi]
  │
  ├── 2. Builds fetch() target pointing to "/api/appointments".
  ├── 3. Appends "Authorization: Bearer <JWT>" and "X-Tenant-Slug: <slug>".
  ▼
[Reverse Proxy / Vite Server]
  │
  ├── 4. Intercepts path containing "/api" prefix.
  ├── 5. Proxies the raw request to the backend port (http://localhost:3001).
  ▼
[Fastify Server Instance]
  │
  ├── 6. Tenant Context Plugin: Grabs "X-Tenant-Slug". Finds tenant ID in DB,
  │      decorates request.tenant with { tenantId, tenantSlug }.
  ├── 7. Auth Guard Plugin: Extracts JWT Bearer. Decodes claims, confirms
  │      claims.tenantId === request.tenant.tenantId. Decorates request.auth.
  ├── 8. Permission Check: Confirms request.auth has "appointment:read" permission.
  ├── 9. Router (appointments.ts): Matches GET "/appointments" and dispatches
  │      execution to AppointmentService.
  ▼
[AppointmentService]
  │
  ├── 10. Executes appointment-specific query using Tenant ID context.
  ▼
[PostgresAppointmentRepository]
  │
  ├── 11. Compiles and executes SQL query via Drizzle Client:
  │       "SELECT * FROM appointments WHERE tenant_id = $1"
  ▼
[PostgreSQL Database / PGlite WASM]
  │
  ├── 12. Executes table query, returns raw tuple array to Repository.
  ▼
[Fastify Router Response Serialization]
  │
  ├── 13. Services format domain records into sanitized JSON transfer models.
  └── 14. Server returns HTTP status 200 containing data payload to client.
```

---

## 12. Authentication and Session Lifecycle

1. **Sign Up / Organization Creation**:
   - Client posts company attributes (`name`, `slug`) to `/tenants`. This registry creates the Organization.
   - Client posts credentials (`email`, `password`) to `/auth/signup` containing the `X-Tenant-Slug` header.
   - If this is the *first* signup for that tenant, the database records their user account and maps their roles as `['owner']`. Subsequent user signups default to `['member']`.
2. **Sign In**:
   - User credentials are encrypted and verified against stored hashes (`scrypt`).
   - On success, `AuthService` signs a token using the SHA-256 Secret containing claims:
     ```json
     {
       "userId": "USR-...",
       "tenantId": "TNT-...",
       "email": "user@email.com",
       "roles": ["owner"]
     }
     ```
3. **Role & Permission Guard Check**:
   - Endpoints requiring permission check execute roles evaluation (`permission.ts`). Mappings:
     - `owner` $\rightarrow$ grants `tenant:manage`, `appointment:write`, `appointment:read`, `user:read`, `user:write`, `audit:read`.
     - `staff` $\rightarrow$ grants `appointment:write`, `appointment:read`.
     - `member` $\rightarrow$ grants `appointment:read`.

---

## 13. Monorepo Structural Dependency Map

To maintain structural isolation and clean architectural boundaries, Klerion mandates a **strict dependency direction**:

```text
    ┌───────────────────────────────────┐
    │          apps/web, apps/api       │
    └─────────────────┬─────────────────┘
                      │
                      ▼
    ┌───────────────────────────────────┐
    │          modules/domains/         │
    └─────────────────┬─────────────────┘
                      │
                      ▼
    ┌───────────────────────────────────┐
    │         modules/platform/         │
    └─────────────────┬─────────────────┘
                      │
                      ▼
    ┌───────────────────────────────────┐
    │        packages/persistence       │
    └───────────────────────────────────┘
```

- **Rule 1**: Applications (`apps/`) depend on modules, but modules never depend on applications.
- **Rule 2**: Domain modules (`modules/domains/`) depend on platform modules, but platform modules are strictly isolated and never import from domain modules.
- **Rule 3**: Persistence adapters (`packages/persistence`) depend on tenancy/identity interfaces to implements storage, ensuring low-level ORM definitions don't bleed back into domain-specific modules.

---

## 14. Coding Standards and Best Practices

- **Explicit Type Declarations**: Implicit any is banned. Function returns and parameters must declare complete, strong type signatures.
- **Strict Import Directives**: All imports must reside at the very top of file scopes. Use named imports exclusively; object destructuring from namespaces or imports of the form `import type` for standard runtime enums are strictly prohibited.
- **Standard Enum Declarations**: Constant enums (`const enum`) are forbidden. Standard `enum` types must be declared.
- **Zero Inline Styles**: Client-side layouts must only reference class declarations from centralized stylesheet directories.

---

## 15. AI Studio Workspace Adaptations

The AI Studio container introduces targeted, workspace-only adaptations to ensure developer server capabilities and seamless routing behind the single-port Nginx proxy.

> [!WARNING]
> **WORKSPACE ONLY - DO NOT COMMIT TO REMOTE GIT BRANCHES**

### 1. Unified Workspace Injection
The root `package.json` includes `"apps/web"` inside the workspaces array. This is a local-only convenience to allow automated installations of both backend and frontend dependencies in a single `npm install` execution in the container, diverging from the local instructions in `DEVELOPMENT.md`.

### 2. Port and Host Routing
- Klerion's standard execution binds `apps/api` to Port 3000 and `apps/web` to Port 5173.
- In this preview container, Port 3000 is the *only* externally exposed ingress port.
- Therefore, our workspace binds **`apps/web` to Port 3000** and **`apps/api` to Port 3001**.
- Vite proxies `/api` calls seamlessly to port 3001 using the workspace configuration overrides.

### 3. dev.js Orchestrator
A custom script (`dev.js`) running at the project root coordinates both servers in a unified process using `child_process.spawn`. This ensures both environments boot simultaneously on port 3000 (web) and 3001 (api).

---

## 16. Safe Files vs Workspace Files Reference

To ensure safe replication of code changes back to local IDE environments (such as VS Code), refer to the table below before copying files:

| File | Type | Safe to Copy? | Target Path | Notes |
|---|---|---|---|---|
| `packages/persistence/src/*` | Codebase | **YES** | `packages/persistence/src/*` | Database updates, schemas, and queries. |
| `modules/**/*` | Codebase | **YES** | `modules/**/*` | Business models, domain logics, and rules. |
| `apps/api/src/*` | Codebase | **YES** | `apps/api/src/*` | Endpoint routing, backend controllers. |
| `apps/web/src/*` | Codebase | **YES** | `apps/web/src/*` | React elements, views, components. |
| `package.json` | Config | **NO** (Workspace Adaptation) | Workspace Root | Contains `apps/web` in workspaces; local dev needs separate run. |
| `dev.js` | Utility | **NO** (Workspace Adaptation) | Workspace Root | Custom process manager built strictly for container routing. |
| `apps/web/vite.config.ts` | Config | **YES** (Verify Ports) | `apps/web/vite.config.ts` | Ensure proxy matches local ports when copying back to native shells. |

---

## 17. Known Issues & Limitations

*Below are discovered bugs or design gaps that must remain untouched during this analysis:*

1. **Lack of Migration Versioning (Severity: Medium)**:
   - *Location*: `/packages/persistence/src/connect.ts` (`runMigrations()`).
   - *Cause*: Replays `0001_initial.sql` in a simple loop splitting on semicolons. There is no schema version tracking table.
   - *Impact*: Safe only while schema statements use `IF NOT EXISTS` or `CREATE TABLE IF NOT EXISTS`. Adding complex column modifications without version tracking tables will cause runtime errors on subsequent boots.
2. **Hardcoded Fallback Arrays in Views (Severity: Low)**:
   - *Location*: `/apps/web/src/views/AppointmentsView.tsx` & `AuditView.tsx`.
   - *Cause*: Hardcoded static structures (`preview`) act as client fallbacks even in live modes when endpoints return empty.
   - *Impact*: Obscures empty database states from designers, making it seem like dummy data is returned by default.

---

## 18. Architectural Improvement Opportunities

*Suggested architectural enhancements (Do NOT implement in this session):*

1. **Integration of Drizzle Kit**: Transition from manual SQL scripts (`0001_initial.sql`) to structured Drizzle Kit migrations tracking versioned changes.
2. **Fastify Request Validation Schema**: Enhance request payload handling using central validation schemas (such as TypeBox or Zod) to secure routes instead of checking `unknown` objects inside handlers.
3. **Real-time Queue Subscriptions**: Refactor the hardcoded live queue (`QueueView.tsx`) to utilize Server-Sent Events (SSE) or WebSockets to reflect instant state changes from the backend.

---

## 19. Developer Notes

### Things Future Developers Should Know:
- **Never Break Multi-Tenancy**: Every DB repository must require a `tenantId`. Enforce tenant containment explicitly in all queries.
- **Do Not Short-Circuit Audit Chains**: Critical status transitions (bookings, permission edits) must execute audit logging via `auditLog.record()`. Tampering or bypassing this log breaks regulatory continuity.
- **Aesthetic Precision**: Maintain the paired fonts and slate neutral hues. Do not introduce raw visual grids or random layout modifications. Keep spacing clean, generous, and proportional.
