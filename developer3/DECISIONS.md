# Developer 3 Architectural Decision Records (ADRs)

This document tracks all formal architectural, design, and domain decisions made during the development of Developer 3's Workforce Core, Employee Master Records, and Time & Attendance modules.

---

## Decision Log

### ADR-DEV3-001: Creation of Dedicated Developer 3 Documentation Workspace
- **Decision ID**: ADR-DEV3-001
- **Date**: 2026-07-30
- **Problem**: Root-level documentation files (`README.md`, `PROGRESS.md`, `CHANGELOG.md`) are shared across all developers, creating a high risk of merge conflicts and loss of developer-specific tracking details.
- **Options Considered**:
  1. Append Developer 3 progress directly into shared root `PROGRESS.md`.
  2. Create a dedicated `/developer3/` workspace directory containing isolated tracking and handbook files.
- **Decision**: Option 2 — Create `/developer3/` documentation workspace containing `README.md`, `TODO.md`, `PROGRESS.md`, `CHANGELOG.md`, `TEST_PLAN.md`, `DECISIONS.md`, `IMPLEMENTATION_LOG.md`, `FILE_INDEX.md`, and `NOTES.md`.
- **Reason**: Prevents merge collisions with other developers, establishes a clear audit trail of Developer 3 deliverables, and provides a clear blueprint.
- **Trade-offs**: Requires disciplined updates to `developer3/` files after every task completion.
- **Impact**: Zero merge conflicts on root documentation; 100% visibility into Developer 3's progress.

---

### ADR-DEV3-002: Client-Generated UUID Idempotency Keys for Offline Attendance Events
- **Decision ID**: ADR-DEV3-002
- **Date**: 2026-07-30
- **Problem**: Mobile/offline clock-in/out events submitted over poor or intermittent network connections can be transmitted multiple times, leading to duplicate punches and inaccurate timesheets.
- **Options Considered**:
  1. Rely on server-side timestamp deduplication within a 5-minute window.
  2. Require every client-initiated event to carry a client-generated UUID `idempotencyKey` stored locally before network transmission.
- **Decision**: Option 2 — Client-generated UUID `idempotencyKey` enforced in schema and domain model.
- **Reason**: Guarantees at-most-once processing regardless of network retries, connection drops, or batch resubmissions.
- **Trade-offs**: Requires client UI widget to generate and persist UUIDs in LocalStorage prior to HTTP dispatch.
- **Impact**: Database enforces uniqueness on `(tenant_id, idempotency_key)`, rendering duplicate network requests completely safe and idempotent.

---

### ADR-DEV3-003: Privacy-Preserving Attendance Location Tracking
- **Decision ID**: ADR-DEV3-003
- **Date**: 2026-07-30
- **Problem**: High-precision GPS tracking on employee mobile clock-ins raises employee privacy concerns and GDPR/local compliance issues.
- **Options Considered**:
  1. Store raw high-precision GPS lat/long coordinates unconditionally.
  2. Obfuscate precise coordinates to 2 decimal places (~1km radius) unless geofencing validation is explicitly enabled for a branch.
- **Decision**: Option 2 — Obfuscate raw location coordinates at API route level according to tenant privacy policy settings.
- **Reason**: Protects employee privacy while preserving sufficient location context for branch attendance verification.
- **Trade-offs**: Raw precision is discarded unless explicitly required by tenant configuration.
- **Impact**: Ensures Klerion compliance with workplace privacy standards.

---

### ADR-DEV3-004: Decoupled Cross-Module Branch Reference via String Identifier
- **Decision ID**: ADR-DEV3-004
- **Date**: 2026-07-30
- **Problem**: Employee placements require assignment to a physical branch owned by Developer 1 (BranchFlow). Importing Developer 1's domain or database models directly into Workforce Core would break module encapsulation.
- **Options Considered**:
  1. Import Branch domain models and foreign key references from Developer 1's package.
  2. Use a loose string identifier `branchId` in `EmploymentPlacement` without direct persistence-level foreign key constraints.
- **Decision**: Option 2 — Store `branchId` as a verified string identifier in `EmploymentPlacement`.
- **Reason**: Upholds team boundary rules ("Never import another team's persistence layer directly") and allows independent database migrations.
- **Trade-offs**: Branch existence validation must occur via application service contract or API check rather than database FK.
- **Impact**: Clean architectural boundary; workforce module can run independently during unit tests.

---

### ADR-DEV3-005: Standardized Enterprise Engineering Verification Report Template
- **Decision ID**: ADR-DEV3-005
- **Date**: 2026-07-31
- **Problem**: As the codebase matures into Milestone 3 (Persistence) and Milestone 4 (APIs), tasks require structured, reproducible, and enterprise-grade audit verification reports covering executed CLI commands, environment metadata, DDD aggregate boundary checks, multi-tenancy enforcement, and test coverage.
- **Options Considered**:
  1. Informal ad-hoc text summaries in chat upon task completion.
  2. A canonical, mandatory Verification Report Schema (`developer3/VERIFICATION_REPORT_TEMPLATE.md`) with standardized sections for CLI logs, environment metadata, DDD checks, multi-tenancy security audit, test results, linter/compiler outputs, and documentation synchronization.
- **Decision**: Option 2 — Adopt the canonical Verification Report Template starting from task TSK-EMP-003.
- **Reason**: Establishes complete auditability, reproducible quality verification, and strict quality governance across all Developer 3 deliverables.
- **Trade-offs**: Adds minor documentation overhead per task completion.
- **Impact**: Guarantees zero regressions, 100% test reproducibility, and full audit compliance.

