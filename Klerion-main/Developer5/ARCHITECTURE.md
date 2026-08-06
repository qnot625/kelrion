# Developer 5 — Architectural Blueprint & Monorepo Discovery Analysis

This document summarizes the complete architectural analysis performed during **Phase 0.5 (DISC-001 → DISC-008)** for Developer 5's assigned ownership scope on the Klerion AdminOps OS platform.

---

## 🏛️ 1. Monorepo Map & Dependency Rules (DISC-001)

### Workspace Map & Module Locations
- **Platform Modules** (`modules/platform/`):
  - `@adminops/identity` (`modules/platform/identity/`): User entities, RBAC roles, permission evaluation, auth tokens.
  - `@adminops/tenancy` (`modules/platform/tenancy/`): Tenant entities, slug-to-ID mapping, AsyncLocalStorage context.
  - `@adminops/audit` (`modules/platform/audit/`): Tamper-evident hash-chained audit event logger.
  - `@adminops/forms` (`modules/platform/forms/`) — **Developer 5 Owned**: Form definition, versioning, schema rules, draft submission engine.
  - `@adminops/workflow` (`modules/platform/workflow/`) — **Developer 5 Owned**: Workflow DAG steps, state machine transitions, execution engine.
- **Domain Modules** (`modules/domains/`):
  - `@adminops/branch-flow` (`modules/domains/branch-flow/`): Appointment scheduling domain.
  - `@adminops/internal-services` (`modules/domains/internal-services/`) — **Developer 5 Owned**: Unified Approval Engine and Internal Service Desk ticketing.
- **Shared Infrastructure** (`packages/`):
  - `@adminops/persistence` (`packages/persistence/`): Drizzle ORM schema definitions (`schema.ts`), PostgreSQL connection managers (`connect.ts`), and PostgreSQL repository implementations.
- **Applications** (`apps/`):
  - `apps/api/`: Fastify REST API server, authentication plugins, tenant isolation middleware, dependency context container (`context.ts`).
  - `apps/web/`: React single-page application, Tailwind CSS UI components, API client (`klerionApi`), session state persistence.

### Dependency Direction Hierarchy
```text
┌─────────────────────────────────────────────────────────────┐
│                      apps/api / apps/web                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
     packages/persistence          modules/domains/*
               │                   (internal-services)
               │                               │
               └───────────────┬───────────────┘
                               ▼
                      modules/platform/*
             (identity, tenancy, audit, forms, workflow)
```

**Strict Architectural Invariants**:
1. Platform modules (`forms`, `workflow`, `identity`, `tenancy`, `audit`) MUST NEVER import from domain modules (`internal-services`, `branch-flow`).
2. Domain modules MAY import from Platform modules.
3. Domain & Platform core logic MUST NEVER import from `packages/persistence` or `apps/api`.
4. Infrastructure (`packages/persistence`) implements repository contracts exported by Domain & Platform modules.

---

## 🔐 2. Identity, Authentication & Permissions (DISC-002)

### Session Claims Schema
```typescript
export interface SessionClaims {
  readonly userId: string;
  readonly tenantId: string;
  readonly email: string;
  readonly roles: readonly string[];
}
```

### Authorization Architecture & Fastify Hooks
- **Authentication**: Fastify plugin `registerAuthGuard` checks the `Authorization: Bearer <token>` header, verifies the token via `AuthService.verifyToken(token)`, asserts `claims.tenantId === request.tenant.tenantId`, and attaches `request.auth = claims`.
- **RBAC Guard**: Pre-handler `requirePermission(permission)` checks `hasPermission(request.auth.roles, permission)` using `permissionsForRoles()`.
- **Developer 5 Permission Requirements**:
  - `forms:manage` (Form schema creation, updates, version publishing)
  - `forms:submit` (Form submission & draft saving)
  - `workflows:manage` (Workflow definition design & state machine configuration)
  - `approvals:process` (Processing approval requests: approve, reject, delegate)
  - `requests:submit` (Submitting internal service desk requests)
  - `servicedesk:manage` (Service desk agent workspace, ticket triage, SLA management)

---

## 🏢 3. Multi-Tenant Isolation Architecture (DISC-003)

### Tenant Resolution Lifecycle
1. Request arrives at Fastify server with header `X-Tenant-Slug: <tenant-slug>`.
2. `registerTenantContext` plugin extracts the header, resolves the tenant via `tenantRepository.findBySlug(slug)`, and sets `request.tenant = { tenantId, tenantSlug }`.
3. If missing or invalid slug, returns `400 Bad Request` or `404 Not Found`.
4. Domain Services and Repositories MUST require `tenantId` parameter on ALL query and mutation methods.

### Tenant Query Filter Standard
- **In-Memory Store Pattern**:
  ```typescript
  async findById(tenantId: string, id: string): Promise<T | undefined> {
    const item = this.byId.get(id);
    return item && item.tenantId === tenantId ? item : undefined;
  }
  ```
- **Drizzle ORM Pattern**:
  ```typescript
  async findById(tenantId: string, id: string): Promise<T | undefined> {
    const [row] = await this.db
      .select()
      .from(table)
      .where(and(eq(table.tenantId, tenantId), eq(table.id, id)))
      .limit(1);
    return row ? toDomain(row) : undefined;
  }
  ```

---

## 📜 4. Tamper-Evident Audit Event Protocol (DISC-004)

### Audit Event Recording Protocol
Every state transition across Developer 5 modules MUST record an audit event via `AuditLog.record()`.

```typescript
await auditLog.record({
  tenantId: request.tenant!.tenantId,
  actorUserId: request.auth?.userId ?? null,
  action: "form.published", // Standard action naming: <domain>.<verb>
  targetType: "form_definition",
  targetId: form.id,
  metadata: { version: form.version, title: form.title },
});
```

---

## ⚡ 5. Fastify API Server & Endpoint Conventions (DISC-005)

### Route Registration Pattern
Routes are registered as modular Fastify plugins with strict parameter typing, request body validation, domain error handling, and permission guards.

```typescript
export function registerFormRoutes(
  app: FastifyInstance,
  formsService: FormDefinitionService,
  auditLog: AuditLog,
): void {
  app.post(
    "/forms",
    { preHandler: requirePermission("forms:manage") },
    async (request, reply) => {
      // 1. Input Validation
      // 2. Call Domain Service
      // 3. Record Audit Log Event
      // 4. Return HTTP 201 Response with Payload
    },
  );
}
```

---

## 💾 6. Persistence Dual-Wiring & Repository Strategy (DISC-006)

### Dual-Repository Architecture
Every Developer 5 module provides two repository implementations:
1. **In-Memory Repository**: High-speed, zero-dependency store for domain unit tests and local dev mock mode.
2. **PostgreSQL Repository**: Production Drizzle ORM store defined in `packages/persistence/src/`.

### App Context Factory Wiring (`apps/api/src/context.ts`)
```typescript
export interface AppContext {
  // Existing...
  formsService: FormDefinitionService;
  submissionService: SubmissionService;
  workflowService: WorkflowExecutionService;
  approvalService: ApprovalService;
  ticketService: TicketService;
}
```

---

## 🎨 7. Frontend Integration Architecture (DISC-007)

### API Client Method Structure (`apps/web/src/lib/api.ts`)
- Use `this.authorizedRequest<T>(session, path, init)` for all authenticated endpoints.
- Auto-injects `Authorization: Bearer <session.token>` and `X-Tenant-Slug: session.tenantSlug`.

---

## 🏁 8. Developer 5 Integration Blueprint & Checklist (DISC-008)

### Verification Checklist Before Feature Development (`FRM-001`)
- [x] Architecture & package exports mapped (`DISC-001`).
- [x] Identity & auth guard mechanisms understood (`DISC-002`).
- [x] Multi-tenant isolation filter pattern established (`DISC-003`).
- [x] Audit event logging protocol verified (`DISC-004`).
- [x] Fastify route handler & error mapping conventions documented (`DISC-005`).
- [x] Dual-persistence in-memory/postgres pattern confirmed (`DISC-006`).
- [x] Web client `authorizedRequest` integration pattern verified (`DISC-007`).
- [x] Master execution roadmap updated in `EXECUTION_PLAN.md` and `TODO.md` (`DISC-008`).
