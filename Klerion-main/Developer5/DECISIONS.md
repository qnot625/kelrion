# Developer 5 — Architectural Decisions (ADRs)

Record of key architectural decisions, rationale, alternatives considered, and expected impact.

---

## [ADR-002] Mandatory Phase 0.5 Repository Discovery Before Code Implementation

- **Date**: 2026-07-30
- **Status**: Accepted
- **Decision**: Introduce mandatory Phase 0.5 (Repository Discovery & Architectural Analysis) with step IDs `DISC-001` through `DISC-008` before writing any production code for Forms, Workflows, Approvals, or Service Desk.
- **Reason**: Writing production code based on assumptions about monorepo structure, context initialization, or audit Interfaces risks breaking existing code or violating project conventions.
- **Alternatives Considered**:
  1. Jump directly into writing Domain entities based on standard DDD templates (Rejected: risks mismatches with existing identity/tenancy abstractions).
  2. Implement code and discover repository conventions during testing (Rejected: causes costly refactoring).
- **Expected Impact**: Zero-risk integration, accurate adherence to existing project patterns, and zero violations of ownership boundaries.

---

## [ADR-001] Isolation of Developer 5 Workspace Directory

- **Date**: 2026-07-30
- **Status**: Accepted
- **Decision**: Create a dedicated `Developer5/` directory at root for developer-specific progress, prompt, and task tracking, kept separate from core platform source files and shared team documentation.
- **Reason**: Ensures Developer 5 has a clear, isolated source of truth for scope, step-by-step progress, and architectural decisions without interfering with team-wide repository configurations or other developers' spaces.
- **Alternatives Considered**:
  1. Storing tracking notes in root `README.md` (Rejected: cluttering shared team repository files).
  2. Maintaining external tracking outside git (Rejected: lose git-backed version control and workspace persistence).
- **Expected Impact**: Clean tracking of Developer 5 responsibilities with zero risk to shared infrastructure or surrounding developer modules.

---

## [ADR-003] Inversion of Control Hook Pattern for Workflow & Approval Engine Integration

- **Date**: 2026-08-02
- **Status**: Accepted
- **Decision**: Define the `ApprovalTaskHandler` interface contract in the platform layer (`@adminops/workflow`) and implement `WorkflowApprovalAdapter` in the domain layer (`@adminops/internal-services`).
- **Reason**: DDD architectural rule strictly forbids platform modules (`modules/platform/*`) from depending on domain modules (`modules/domains/*`). By using Dependency Inversion (Inversion of Control), the platform workflow engine executes approval steps without importing internal services, maintaining clean unidirectional dependencies.
- **Alternatives Considered**:
  1. Direct import of `ApprovalService` inside `WorkflowExecutionService` (Rejected: violates DDD rules by introducing platform-to-domain dependency).
  2. Generic event bus without direct callback response (Rejected: introduces eventual consistency delay when workflows need immediate synchronous step advancement upon approval).
- **Expected Impact**: Zero circular dependencies, clean DDD layer segregation, total testability in isolation, and seamless workflow step completion on approval decisions.
