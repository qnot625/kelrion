# Engineering Design Document: TSK-INT-001 — Cross-Tenant Security & Audit Validation

**Task ID**: TSK-INT-001  
**Task Name**: Cross-Tenant Security & Audit Validation  
**Milestone**: Milestone 10 — Integration & Quality Audit  
**Developer**: Developer 3 (Workforce Core, Employee Master Records, Time & Attendance, Security Audit)  
**Date**: 2026-08-03  
**Status**: APPROVED DESIGN  

---

## Executive Summary

Task **TSK-INT-001** is the final security and integration validation milestone for the Klerion Platform. It establishes a comprehensive audit and verification framework for multi-tenant data isolation, role-based access control (RBAC), immutable hash-chained audit logging, API authorization boundaries, and cross-module regression protections across all completed modules (`TSK-WFC-001` through `TSK-ATT-007`).

As an audit and validation task, **TSK-INT-001** introduces **zero production code modifications** (`0 production files modified/created`). All existing production endpoints, data stores, domain logic, and frontend views will be verified against strict security and contract invariants.

---

## 1. Security Architecture Audit & Findings

The Klerion security architecture enforces a defense-in-depth model across the platform API, domain engines, persistence repositories, and frontend interfaces.

### 1.1 Middleware Stack & Request Lifecycle Flow
Every secured API request processed by `apps/api` flows through a strict sequential Fastify hook chain:
1. **Tenant Resolution (`registerTenantContext`)**:
   - Inspects `X-Tenant-Slug` header.
   - Queries `TenantRepository.findBySlug(slug)`.
   - Rejects missing headers (`400 Bad Request`) or unknown tenant slugs (`404 Not Found`).
   - Attaches `request.tenant = { tenantId, tenantSlug }` to request context.
2. **Session Authentication & Guard (`registerAuthGuard`)**:
   - Extracts HTTP `Authorization: Bearer <token>`.
   - Rejects unauthenticated requests (`401 Unauthorized`).
   - Verifies JWT payload claims using HMAC SHA-256 (`AuthService.verifyToken`).
   - **Cross-Tenant Guard Check**: Validates `claims.tenantId === request.tenant.tenantId`. If a valid token issued under Tenant A is presented with header `X-Tenant-Slug: tenant-b`, request is rejected immediately with `401 Unauthorized: Token does not match the requested tenant`.
   - Attaches `request.auth = claims` (userId, email, roles, tenantId).
3. **Role-Based Permission Enforcement (`requirePermission`)**:
   - Pre-handler hook verifying `hasPermission(request.auth.roles, permission)`.
   - Rejects unauthorized roles (`403 Forbidden`).

---

## 2. Multi-Tenant Isolation Audit

### 2.1 Storage & Repository Isolation Strategy
- **Postgres Schema Level**: `tenant_id` column present on every table (`tenants`, `users`, `employees`, `attendance_events`, `attendance_summaries`, `attendance_corrections`, `audit_events`, `idempotency_records`).
- **Postgres Repository Layer**: Every SQL query executed by `PostgresEmployeeRepository`, `PostgresAttendanceRepository`, `PostgresAttendanceCorrectionRepository`, `PostgresAuditLog`, and `PostgresUserRepository` mandates `WHERE tenant_id = $tenantId`.
- **In-Memory Store Isolation**: Every memory store filters collections by `item.tenantId === targetTenantId`.
- **Domain Aggregates**: Aggregates (such as `Employee`) validate tenant boundaries during hierarchy updates (e.g. `validateManagerHierarchy` rejects manager candidates belonging to different tenants with HTTP `409 Conflict`).

---

## 3. RBAC Audit & Permission Matrix

### 3.1 Role Hierarchy & Permissions
Klerion defines three core system roles (`owner`, `staff`, `member`) mapped to granular permissions:

| Permission | Description | `owner` | `staff` | `member` |
| :--- | :--- | :---: | :---: | :---: |
| `appointments:book` | Book client appointments | ✅ | ✅ | ✅ |
| `appointments:manage` | Reschedule / cancel appointments | ✅ | ✅ | ❌ |
| `appointments:view` | View appointment schedules | ✅ | ✅ | ❌ |
| `tenant:manage` | Manage tenant settings & staff accounts | ✅ | ❌ | ❌ |
| `employees:create` | Create employee master record | ✅ | ✅ | ❌ |
| `employees:read` | Read employee directory & profiles | ✅ | ✅ | ✅ |
| `employees:update` | Edit employee details | ✅ | ✅ | ❌ |
| `employees:delete` | Soft delete / terminate employee | ✅ | ❌ | ❌ |
| `employees:manage_hierarchy` | Update reporting manager & placement | ✅ | ✅ | ❌ |
| `attendance:clock` | Submit clock in/out & break events | ✅ | ✅ | ✅ |
| `attendance:read` | View attendance logs & timesheets | ✅ | ✅ | ✅ |
| `attendance:sync` | Batch sync offline attendance logs | ✅ | ✅ | ❌ |
| `attendance:manage` | Approve/Reject attendance corrections | ✅ | ✅ | ❌ |

---

## 4. Audit Logging Architecture & Cryptographic Hash Chain

### 4.1 Immutable Hash Chaining Design
The `AuditLog` platform module (`@adminops/audit`) records state-changing domain events with cryptographic tamper-evidence:
- **Canonical Payload JSON**: Serializes `{ tenantId, actorUserId, action, targetType, targetId, occurredAt, metadata, previousHash }`.
- **SHA-256 Hash Computation**: `computeEventHash()` produces a 64-character hex hash.
- **Link Verification**: Each new audit record includes `previousHash` matching the prior event's `hash`.
- **Chain Verification Engine**: `verifyChainIntegrity(events)` recalculates hash links sequentially to detect any downstream modification, deletion, or reordering.

---

## 5. API Security & Endpoint Audit Specification

| Method & Route | Auth Guard | Permission Required | Tenant Isolation | Audit Event Written |
| :--- | :---: | :---: | :---: | :---: |
| `POST /auth/login` | Public | None | Resolved via Slug | `user.login` |
| `GET /employees` | Bearer | `employees:read` | `request.tenant.tenantId` | None |
| `POST /employees` | Bearer | `employees:create` | `request.tenant.tenantId` | `employee.created` |
| `PATCH /employees/:id` | Bearer | `employees:update` | `request.tenant.tenantId` | `employee.updated` |
| `POST /employees/:id/terminate` | Bearer | `employees:delete` | `request.tenant.tenantId` | `employee.terminated` |
| `POST /attendance/clock-in` | Bearer | `attendance:clock` | `request.tenant.tenantId` | `attendance.clocked_in` |
| `POST /attendance/clock-out` | Bearer | `attendance:clock` | `request.tenant.tenantId` | `attendance.clocked_out` |
| `POST /attendance/sync` | Bearer | `attendance:sync` | `request.tenant.tenantId` | `attendance.batch_synced` |
| `GET /attendance/summary` | Bearer | `attendance:read` | `request.tenant.tenantId` | None |
| `GET /attendance/corrections` | Bearer | `attendance:read` | `request.tenant.tenantId` | None |
| `POST /attendance/corrections` | Bearer | `attendance:clock` | `request.tenant.tenantId` | `attendance_correction.requested` |
| `POST /attendance/corrections/:id/approve` | Bearer | `attendance:manage` | `request.tenant.tenantId` | `attendance_correction.approved` |
| `POST /attendance/corrections/:id/reject` | Bearer | `attendance:manage` | `request.tenant.tenantId` | `attendance_correction.rejected` |

---

## 6. Planned Repository Diff (Phase 4 Plan)

- **Planned Production Files Created**: 0
- **Planned Production Files Modified**: 0
- **Planned Test Files Created/Modified**: 0
- **Planned Documentation Files Created**: 2 (`developer3/design/TSK-INT-001_DESIGN.md`, `developer3/design/TSK-INT-001_DESIGN_REVIEW.md`)
- **Scope Compliance**: 100% audit & validation task.

---

## 7. Verification Strategy & Regression Safeguards

Validation will be executed across all test environments:
1. **API Integration Suite**: `npm test -w apps/api` (21 suites, 100% passing).
2. **Domain Core Suite**: `npm test -w modules/domains/workforce-core` (48 tests, 100% passing).
3. **Persistence Layer Suite**: `npm test -w packages/persistence` (22 tests, 100% passing).
4. **Web Frontend Suites**: `apps/web/tests/attendance-timesheets.test.ts`, `attendance-widget.test.ts`, `employee-directory.test.ts` (22 tests, 100% passing).
5. **Static Analysis & Build**: `npm run lint` and `compile_applet`.
