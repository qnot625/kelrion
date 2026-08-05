# Engineering Design Review: TSK-ATT-004 — Attendance REST API & Sync Routes

**Task ID**: TSK-ATT-004  
**Task Name**: Attendance REST API & Sync Routes  
**Milestone**: Milestone 8 — Attendance REST APIs & Corrections  
**Reviewer**: Developer 3 (Architecture Lead)  
**Date**: 2026-08-02  
**Status**: APPROVED DESIGN REVIEW  

---

## 1. Architecture Review Summary

The proposed design for `TSK-ATT-004` (`TSK-ATT-004_DESIGN.md`) has been evaluated against enterprise architecture standards, Domain-Driven Design principles, and existing monorepo patterns.

### Findings & Evaluation Matrix

| Category | Evaluation | Status |
| :--- | :--- | :---: |
| **DDD Compliance** | High. Domain aggregates (`AttendanceRecord`, `AttendanceSyncEngine`) maintain business rules. Fastify handlers act solely as HTTP adapters. | Approved |
| **Multi-Tenant Isolation** | All endpoints depend on `request.tenant!.tenantId` injected by `tenant-context`. No cross-tenant leaks. | Approved |
| **Idempotency & Batch Sync** | `/attendance/sync` reuses `AttendanceSyncEngine` with `PostgresAttendanceRepository` acting as `IdempotencyRegistryStore`. | Approved |
| **Security & RBAC** | Explicit permission guards (`attendance:clock`, `attendance:read`, `attendance:sync`, `attendance:manage`) added to `@adminops/identity`. | Approved |
| **Error Handling** | Standardized domain error translation (`400`, `404`, `409`, `422`, `500`). | Approved |

---

## 2. Key Architectural Decisions (ADR)

### ADR-DEV3-011: Unified Attendance Route Registration (`registerAttendanceRoutes`)
- **Context**: The Fastify API application standardizes endpoint registration via modular route functions.
- **Decision**: All real-time clocking, historical retrieval, summary aggregation, and offline batch sync endpoints will be registered under `/attendance` in `apps/api/src/routes/attendance.ts`.
- **Consequences**: Provides single-source endpoint management, simplifies API context dependency injection, and ensures uniform auth & tenant guard enforcement.

---

## 3. Verification & Test Plan Strategy

The test suite in `apps/api/tests/attendance-routes.test.ts` will verify:
1. `POST /attendance/clock-in` creates initial attendance record and returns `201`.
2. `POST /attendance/clock-out` updates state and computes duration.
3. `POST /attendance/sync` handles offline event batches, rejects duplicate idempotency keys, and flags future timestamp drift.
4. `GET /attendance/summary` filters per date range and enforces tenant scoping.
5. RBAC guards return `403 Forbidden` for unauthorized roles.

---

## 4. Final Review Outcome

**DESIGN APPROVED FOR IMPLEMENTATION**

The design is sound, comprehensive, and ready for Stage 3 completion. Implementation will await explicit authorization.
