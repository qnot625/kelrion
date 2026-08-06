# Developer 5 Workspace — Klerion Enterprise Operations Platform

Welcome to the personal development workspace for **Developer 5**. This workspace serves as the single source of truth for tracking, planning, documenting, and auditing Developer 5's contributions to the Klerion project.

---

## 🎯 Developer 5 Responsibilities & Scope

Developer 5 is responsible for end-to-end design, implementation, and maintenance of the following core systems:

1. **Forms Platform**: Dynamic form definition schemas, version control, conditional validation rules, draft persistence, and form submissions.
2. **Workflow Engine**: State machines, workflow definition schemas, workflow execution instances, step handlers, human approval tasks, delegation, escalations, and event history tracking.
3. **Approval Engine**: Unified approval request lifecycle, approval inbox, approval action processing (approve/reject/reassign/request info), audit trail integration, and workflow hooks.
4. **Internal Service Desk**: Service request catalog, employee request submission portal, agent triage workspace, comment feeds, SLA tracking, status transitions, and assignment engines.

---

## 📁 Ownership Boundaries

Developer 5 strictly owns and operates within the following directory boundaries:

### Backend Ownership
- `modules/platform/forms/`
- `modules/platform/workflow/`
- `modules/domains/internal-services/`
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

---

## 🚫 Explicit Non-Touch Areas

Developer 5 **must never modify** without explicit authorization:
- Identity & Authentication (`modules/platform/identity/`)
- Tenancy Platform (`modules/platform/tenancy/`)
- Audit Platform (`modules/platform/audit/`)
- Appointments & Branch Flow Domain (`modules/domains/branch-flow/`)
- Queue, Attendance, Employees, Leave, Analytics, Dashboards
- Shared Infrastructure (`packages/persistence/`, root `package.json`, root `tsconfig.json`)
- Other developer ownership boundaries (Developers 1–4, 6)

---

## 🏛️ Architectural Principles

- **Platform vs. Domain Boundary**: Platform modules (`forms`, `workflow`) **never** import from domain modules (`internal-services`). Domain modules **may** depend on platform modules.
- **Tenant Isolation**: Every database query and business operation requires a verified `tenantId`.
- **Server-Side Authorization**: Every API route enforces RBAC and tenant authorization server-side.
- **Audit Logging**: All significant state transitions emit structured audit events.
- **Clean Architecture & DDD**: Clear layer separation (Domain Models, Repositories, Application Services, API Handlers, UI Components).

---

## 🛠️ Workspace Files Overview

| File | Purpose |
| :--- | :--- |
| [`README.md`](./README.md) | Overview, scope, architecture rules, and ownership boundaries. |
| [`EXECUTION_PLAN.md`](./EXECUTION_PLAN.md) | Master execution plan, phase roadmap, task breakdown, and risk register. |
| [`TODO.md`](./TODO.md) | Structured checklist of tasks organized by Phase, Feature, and Step ID. |
| [`PROGRESS.md`](./PROGRESS.md) | Live progress dashboard and module completion percentages. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Chronological log of code changes, additions, and refactors. |
| [`DECISIONS.md`](./DECISIONS.md) | Architectural Decision Records (ADRs). |
| [`QUESTIONS.md`](./QUESTIONS.md) | Log of open questions, blockages, and dependencies. |
| [`NOTES.md`](./NOTES.md) | Technical insights, patterns, repository conventions, and commands. |
| [`PROMPTS.md`](./PROMPTS.md) | Archive of prompts used during development sessions. |
