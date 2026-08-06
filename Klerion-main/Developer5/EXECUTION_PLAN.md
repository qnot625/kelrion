# Developer 5 Master Execution Plan — Klerion Platform & Domains

This document is the **Master Execution Roadmap** for Developer 5 on the Klerion enterprise operations platform. It governs all architectural decisions, discovery tasks, granular vertical slices, step IDs, test plans, risk mitigations, learning goals, and step-by-step implementations across Developer 5's assigned ownership areas.

---

## 🎯 1. Ownership Boundaries & Assigned Scope

### Backend Ownership
- Platform Module: `modules/platform/forms/` (Forms Engine)
- Platform Module: `modules/platform/workflow/` (Workflow Engine)
- Domain Module: `modules/domains/internal-services/` (Internal Service Desk & Approval Domain)
- Fastify API Routes:
  - `apps/api/src/routes/forms.ts`
  - `apps/api/src/routes/workflows.ts`
  - `apps/api/src/routes/requests.ts`
  - `apps/api/src/routes/approvals.ts`
  - `apps/api/src/routes/service-desk.ts`

### Frontend Ownership
- `apps/web/src/features/forms/`
- `apps/web/src/features/workflows/`
- `apps/web/src/features/requests/`
- `apps/web/src/features/approvals/`
- `apps/web/src/features/service-desk/`

### Explicit Non-Touch Boundaries
- `modules/platform/identity/`, `modules/platform/tenancy/`, `modules/platform/audit/`, `modules/domains/branch-flow/`
- Shared root infrastructure (`packages/persistence/`), shared build configurations (`package.json`, `tsconfig.json`), root configs, and modules owned by Developers 1–4 and 6.

---

## 🗺️ 2. High-Level Roadmap

```text
Phase 0: Workspace & Standards Setup (Completed)
  └─ SETUP-001, SETUP-002, SETUP-003, SETUP-004

Phase 0.5: Repository Discovery & Architectural Analysis (DISC Series - MANDATORY BEFORE CODE)
  └─ DISC-001 -> DISC-008 (Analyzing monorepo, context, tenancy, audit, routes, persistence, & UI hooks)

Phase 1: Forms Platform (FRM Series)
  ├─ Phase 1A: Form Definition Spec, Value Objects & Aggregate Root (FRM-001 -> FRM-007)
  ├─ Phase 1B: Form Submission Engine & Draft Lifecycle (FRM-008 -> FRM-012)
  └─ Phase 1C: Forms Fastify API & React Builder/Renderer (FRM-013 -> FRM-018)

Phase 2: Workflow Engine (WF Series - Completed)
  ├─ Phase 2A: Workflow Definition Spec, DAG Steps & State Machine (WF-001 -> WF-008)
  ├─ Phase 2B: Human Approval Tasks, Escalation & Audit Log (WF-009 -> WF-010)
  └─ Phase 2C: Workflow Fastify API & Visual Builder UI (WF-011 -> WF-015)

Phase 3: Approval Engine (APR Series)
  ├─ Phase 3A: Approval Request Spec, Lifecycle & Actions (APR-001 -> APR-006)
  └─ Phase 3B: Approval Fastify API & Unified Inbox UI (APR-007 -> APR-011)

Phase 4: Internal Service Desk (SD Series)
  ├─ Phase 4A: Request Catalog Spec, Ticket Lifecycle & SLA Rules (SD-001 -> SD-006)
  └─ Phase 4B: Service Desk API & Employee/Agent Portal UI (SD-007 -> SD-012)

Phase 5: Cross-Module Integration & Verification (INT Series)
  └─ INT-001 -> INT-003: End-to-end Form -> Workflow -> Approval -> Service Desk Verification

Phase 6: Enterprise Security & Hardening (SEC Series - Completed)
  └─ SEC-001 -> SEC-016: Argon2id, JWT, MFA, RBAC, Helmet, Rate Limiting, Encryption, Sanitization, Audit Chaining
```

---

## 🔬 3. Phase 0.5 — Repository Discovery Tasks

*Note: Requires Repository Verification before writing production code.*

| Step ID | Objective / Task Title | Expected Output | Completion Criteria | Verification Checklist |
| :--- | :--- | :--- | :--- | :--- |
| **DISC-001** | Inspect Monorepo Structure & Module Package Exports | Complete map of `modules/platform/`, `modules/domains/`, and `packages/` exports. | Understand TypeScript path aliases and package export maps without breaking imports. | View `package.json`, `tsconfig.json`, and module `index.ts` entry points. |
| **DISC-002** | Analyze Identity, Auth & Session Context Patterns | Map how `sessionToken` and user authentication flow through `apps/api/src/context.ts`. | Understand how user identity and role claims are attached to request context. | View `apps/api/src/context.ts` and `apps/web/src/lib/session.ts`. |
| **DISC-003** | Analyze Tenancy Context & Isolation Enforcers | Map how `tenantId` is passed and validated in Fastify requests and repositories. | Confirm exact pattern for tenant isolation on every database query. | Inspect `modules/platform/tenancy` and existing repositories. |
| **DISC-004** | Analyze Audit Event Logging Interfaces & Conventions | Map `AuditLogger` interface and payload requirements in `modules/platform/audit`. | Know exact event names, metadata schemas, and logging calls required for state changes. | View `modules/platform/audit/src/index.ts`. |
| **DISC-005** | Analyze Fastify Server Routing & Plugin Registration | Map how routes are registered in `apps/api/src/server.ts` and route file conventions. | Ensure route handler signatures match existing project patterns. | Inspect `apps/api/src/routes/*.ts` and `server.ts`. |
| **DISC-006** | Analyze Database Access & Persistence Conventions | Inspect `packages/persistence/src/` schema and repository implementations. | Understand Drizzle ORM usage and in-memory fallback patterns. | View `packages/persistence/src/schema.ts` and existing postgres repos. |
| **DISC-007** | Analyze Frontend API Integration & Custom Hooks | Inspect `apps/web/src/lib/api.ts` client helpers and view layout patterns. | Understand standard fetch wrapper, error handling, and component state hooks. | View `apps/web/src/lib/api.ts` and `App.tsx`. |
| **DISC-008** | Formulate Architectural Blueprint & Integration Contracts | Document Developer 5 module contracts, interfaces, and public exports. | Complete architectural design contract ready for Phase 1. | Publish discovery analysis in `Developer5/NOTES.md`. |

---

## 📋 4. Granular Feature & Task Breakdown

### Phase 1: Forms Platform (`modules/platform/forms`)

| Step ID | Title / Vertical Slice | Complexity | Dependencies | Output Artifacts | Acceptance Criteria |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **FRM-001** | Form Definition Spec & Design Review | Small | DISC-008 | `Developer5/NOTES.md` (FRM spec section) | Complete architectural specification answering aggregate boundaries, field types, and invariants. |
| **FRM-002** | Form Definition Value Objects | Small | FRM-001 | `modules/platform/forms/src/form-field.ts` | Immutable value objects for `FormField`, `ValidationRule`, and `VisibilityCondition`. |
| **FRM-003** | Form Definition Aggregate Root | Medium | FRM-002 | `modules/platform/forms/src/form-definition.ts` | Aggregate root managing versioning, field lists, schema publishing, and immutability rules. |
| **FRM-004** | Form Definition Repository Contract | Small | FRM-003 | `modules/platform/forms/src/form-repository.ts` | Typed interface for CRUD operations enforcing tenant isolation. |
| **FRM-005** | Form Definition In-Memory Repository | Small | FRM-004 | `modules/platform/forms/src/in-memory-form-repository.ts` | In-memory implementation with strict `tenantId` query scoping. |
| **FRM-006** | Form Definition Application Service | Medium | FRM-005 | `modules/platform/forms/src/form-service.ts` | Use cases for create form, update draft, publish version, and archive with audit logs. |
| **FRM-007** | Form Definition Domain & Service Tests | Small | FRM-006 | `modules/platform/forms/src/__tests__/form-definition.test.ts` | Passing unit tests for schema validation, version bumping, and audit event generation. |
| **FRM-008** | Form Submission Value Objects & Rules | Small | FRM-001 | `modules/platform/forms/src/submission-value.ts` | Field response value object and conditional evaluation runner logic. |
| **FRM-009** | Form Submission Aggregate Root | Medium | FRM-008 | `modules/platform/forms/src/form-submission.ts` | Aggregate root tracking submission status (`DRAFT`, `SUBMITTED`, `REJECTED`), submitter ID, and payload. |
| **FRM-010** | Form Submission Repository Contract & Store | Small | FRM-009 | `modules/platform/forms/src/submission-repository.ts` | Interface and in-memory store for form submission persistence. |
| **FRM-011** | Form Submission Application Service | Medium | FRM-010 | `modules/platform/forms/src/submission-service.ts` | Handles draft saving, field validation against published form schema, and submission locking. |
| **FRM-012** | Form Submission Unit & Integration Tests | Small | FRM-011 | `modules/platform/forms/src/__tests__/submission.test.ts` | Tests for valid submissions, invalid schema payloads, draft saving, and tenant isolation. |
| **FRM-013** | Fastify API Routes for Forms & Submissions | Medium | FRM-006, FRM-011 | `apps/api/src/routes/forms.ts` | REST API routes (`/api/forms`, `/api/forms/:id/submissions`) with RBAC & tenant scoping. |
| **FRM-014** | Forms Fastify API Integration Tests | Small | FRM-013 | `apps/api/src/__tests__/forms-api.test.ts` | HTTP status code checks (200, 201, 400, 401, 403, 404) and cross-tenant block tests. |
| **FRM-015** | Forms Frontend API Client Layer | Small | FRM-013 | `apps/web/src/features/forms/api.ts` | Typed fetch client helpers and custom React hooks (`useForms`, `useFormSubmission`). |
| **FRM-016** | Interactive Form Builder UI Component | Large | FRM-015 | `apps/web/src/features/forms/FormBuilder.tsx` | Drag-and-drop form schema builder with field settings inspector and live preview. |
| **FRM-017** | Dynamic Form Renderer UI Component | Medium | FRM-015 | `apps/web/src/features/forms/FormRenderer.tsx` | Dynamic form renderer with conditional field visibility, client validation, and draft auto-save. |
| **FRM-018** | Phase 1 Architectural & Functional Review | Small | FRM-017 | `Developer5/PROGRESS.md` | Comprehensive Phase 1 review checkpoint and verification against Definition of Done. |

*(Detailed task breakdowns for Phases 2, 3, 4, and 5 follow the exact same vertical slice pattern).*

---

## 🧪 5. Comprehensive Testing Strategy

Every task MUST specify and execute (or document local requirement for) the following test layers:

1. **Domain Unit Tests**: Test entity invariants, value object validations, version bumping, and state machine transitions in total isolation.
2. **Repository Unit & Isolation Tests**: Test CRUD queries and verify that querying data with `tenant-A` context NEVER returns records belonging to `tenant-B`.
3. **Application Service Tests**: Test orchestration logic, mock repository calls, transaction boundaries, and audit event payload generation.
4. **API Integration Tests**: Use Fastify `inject()` or HTTP calls to test route endpoints, JSON schema validation, HTTP error statuses (400, 401, 403, 404, 500), and RBAC permissions.
5. **UI Integration & Hook Tests**: Verify React state hooks, form input rendering, conditional field visibility updates, and error feedback display.
6. **Cross-Tenant Isolation Tests**: Explicitly test cross-tenant access attempts to ensure 403 Forbidden or 404 Not Found response codes are enforced server-side.
7. **Audit Event Trail Verification**: Assert that `AuditLogger.log()` is called with correct `tenantId`, `actorId`, `eventType`, and structured metadata upon every state change.

---

## 🔗 6. Dependency Map & Risk Register

### Internal & External Dependency Map
- **Developer 1 (Identity & Auth)**: Depends on `sessionToken` and `req.tenantContext` provided by API context. *(Status: Shared API context already provides mock/jwt tenant context, unblocked).*
- **Developer 2 (Tenancy Platform)**: Depends on `tenantId` string. *(Status: Unblocked, using string tenant IDs in context).*
- **Developer 3 (Audit Platform)**: Depends on `AuditLogger` interface. *(Status: Unblocked, using standard `AuditLogger` abstraction).*
- **Developers 4 & 6**: No direct code dependencies. Developer 5 domain modules are self-contained.

### Risk Register

| Risk ID | Risk Description | Probability | Impact | Severity | Mitigation Strategy | Owner |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **RSK-001** | Circular dependencies between Workflow Engine and Approval Engine. | Medium | High | High | Keep Approval Engine in domain layer (`modules/domains/internal-services/`). Workflow engine only defines abstract step task contracts without depending on domain models. | Dev 5 |
| **RSK-002** | Dynamic form validation schema performance for complex nested fields. | Low | Medium | Medium | Use pure TypeScript validation functions and lightweight JSON-schema based evaluators without external heavy runtime engines. | Dev 5 |
| **RSK-003** | Fastify route registration conflicts across developer routes. | Medium | High | High | Register routes inside dedicated route plugins under distinct URL prefixes (`/api/forms`, `/api/workflows`, `/api/approvals`, `/api/requests`, `/api/service-desk`). | Dev 5 |
| **RSK-004** | Breaking shared build configs or TypeScript path mappings. | Low | Critical | High | Developer 5 strictly avoids modifying root `package.json` or root `tsconfig.json`. All module aliases are registered cleanly. | Dev 5 |

---

## 🏁 7. Enterprise Definition of Done (DoD)

A task/step is strictly considered **✅ Completed** ONLY when ALL 12 conditions are satisfied:

1. **Architectural Design Review**: Design & review stage completed and documented in `Developer5/NOTES.md`.
2. **Clean Scope & Ownership Compliance**: Code resides strictly within Developer 5's assigned ownership directories.
3. **Zero Forbidden Cross-Layer Imports**: Platform modules (`forms`, `workflow`) NEVER import from domain modules (`internal-services`).
4. **Tenant Security Enforced**: Every query and mutation mandates server-side `tenantId` filtering.
5. **RBAC & Authorization Enforced**: API routes enforce user permissions server-side.
6. **Structured Audit Events**: Major state changes emit structured audit logs.
7. **No Placeholders or Demo Stubs**: Code is production-ready with real types, logic, and validation.
8. **Automated Verification**: Domain unit tests, repository tests, and API tests executed and passing.
9. **Linter & Compiler Clean**: Passes `lint_applet` and `compile_applet` with zero errors or warnings.
10. **Manual UI/API Verification**: Manual route or UI check performed and verified.
11. **No Ownership Boundaries Violated**: No files outside Developer 5's ownership modified without explicit permission.
12. **Personal Workspace Documentation Synchronized**: `Developer5/TODO.md`, `PROGRESS.md`, `CHANGELOG.md`, `DECISIONS.md`, `NOTES.md`, `PROMPTS.md`, and `EXECUTION_PLAN.md` updated with exact step details.

---

## 📊 8. Progress Tracker

| Step ID | Task Name | Phase | Status | % Done | Dependencies |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **SETUP-001** | Personal Workspace Setup | Phase 0 | ✅ Completed | 100% | None |
| **SETUP-002** | Adoption of Prompt 2.5 Standards | Phase 0 | ✅ Completed | 100% | SETUP-001 |
| **SETUP-003** | Developer 5 Master Execution Plan | Phase 0 | ✅ Completed | 100% | SETUP-002 |
| **SETUP-004** | Execution Plan Refinement & Alignment | Phase 0 | ✅ Completed | 100% | SETUP-003 |
| **DISC-001** | Inspect Monorepo Structure & Package Exports | Phase 0.5 | ✅ Completed | 100% | Independent |
| **DISC-002** | Analyze Identity, Auth & Session Context | Phase 0.5 | ✅ Completed | 100% | DISC-001 |
| **DISC-003** | Analyze Tenancy Context & Isolation Enforcers | Phase 0.5 | ✅ Completed | 100% | DISC-001 |
| **DISC-004** | Analyze Audit Event Logging Interfaces | Phase 0.5 | ✅ Completed | 100% | DISC-001 |
| **DISC-005** | Analyze Fastify Server Routing & Plugins | Phase 0.5 | ✅ Completed | 100% | DISC-001 |
| **DISC-006** | Analyze Database Access & Persistence Conventions | Phase 0.5 | ✅ Completed | 100% | DISC-001 |
| **DISC-007** | Analyze Frontend API Integration & Hooks | Phase 0.5 | ✅ Completed | 100% | DISC-001 |
| **DISC-008** | Formulate Architectural Blueprint & Integration Contracts | Phase 0.5 | ✅ Completed | 100% | DISC-001 to 007 |
| **FRM-001** | Form Definition Spec & Design Review | Phase 1A | ✅ Completed | 100% | DISC-008 |
| **FRM-002** to **FRM-018** | Forms Platform Granular Vertical Slices | Phase 1 | ✅ Completed | 100% | FRM-001 |
| **WF-001** to **WF-015** | Workflow Engine Granular Vertical Slices | Phase 2 | ✅ Completed | 100% | Phase 1 |
| **APR-001** to **APR-011** | Approval Engine Granular Vertical Slices | Phase 3 | ✅ Completed | 100% | Phase 2 |
| **SD-001** to **SD-012** | Internal Service Desk Granular Vertical Slices | Phase 4 | ✅ Completed | 100% | Phase 3 |
| **INT-001** to **INT-003** | Cross-Module Integration & Verification | Phase 5 | ✅ Completed | 100% | Phase 4 |

---

## 🎓 9. Software Engineering Learning Objectives

As we build each step, you will learn and master the following core enterprise engineering concepts:

1. **Domain-Driven Design (DDD)**: Aggregate roots, entities, value objects, domain events, domain services, ubiquitous language, bounded contexts.
2. **Clean / Hexagonal Architecture**: Separating core business logic from frameworks, UI, and storage mechanisms.
3. **Repository Pattern & In-Memory Test Doubles**: Abstracting database queries behind interface contracts so business logic can be tested with lightning-fast in-memory stores before connecting to SQL persistence.
4. **Finite State Machines (FSM)**: Controlling complex lifecycles (workflows, approvals, tickets) safely using explicit status transitions and guard conditions.
5. **Multi-Tenant Security Architecture**: Ensuring absolute data isolation by mandating tenant context scoping on all queries and mutations.
6. **Dynamic Schema & Rule Validation Engines**: Building extensible form validation engines without hardcoding fixed database columns.
7. **REST API Design & Fastify Hooks**: Crafting clean HTTP request handlers, route schemas, error handlers, and authorization hooks.
