# Engineering Design Specification: TSK-ATT-004 — Attendance REST API & Sync Routes

**Task ID**: TSK-ATT-004  
**Task Name**: Attendance REST API & Sync Routes  
**Milestone**: Milestone 8 — Attendance REST APIs & Corrections  
**Developer**: Developer 3 (Workforce Core, Employee Master Records, Time & Attendance)  
**Date**: 2026-08-02  
**Status**: APPROVED DESIGN (Phase 2)  

---

## 1. Executive Summary

Task TSK-ATT-004 exposes the core Time & Attendance capabilities via high-performance, secure, and multi-tenant Fastify REST API endpoints in `@adminops/api`. It provides real-time event endpoints (`clock-in`, `clock-out`, `break-start`, `break-end`), single-employee daily lookup, date-range historical queries, daily summary metrics, and an offline batch synchronization engine (`/attendance/sync`).

All endpoints strictly adhere to Fastify route registration conventions, JWT authentication (`auth-guard`), RBAC permissions (`requirePermission`), multi-tenant context resolution (`tenant-context`), Zod schema validation, structured error handling (`AttendanceDomainError` mapping), and audit logging (`AuditLog`).

---

## 2. Architecture & Request Pipeline

### 2.1 API Request Flow Architecture

```
HTTP Request
   │
   ▼
[Fastify Server]
   │
   ├──▶ [tenant-context Plugin]  ──▶ Validate x-tenant-id & attach request.tenant
   │
   ├──▶ [auth-guard Plugin]      ──▶ Validate JWT Authorization header & attach request.auth
   │
   ├──▶ [requirePermission Plugin] ──▶ Verify request.auth.roles against target Permission
   │
   └──▶ [Route Handler]
          │
          ├──▶ Zod Request Validation ──▶ 400 Bad Request on failure
          │
          ├──▶ Domain Service / Sync Engine Integration
          │      ├──▶ PostgresAttendanceRepository (Record & Idempotency Store)
          │      └──▶ AttendanceSyncEngine / AttendanceRecord Domain Aggregate
          │
          ├──▶ Audit Logging (auditLog.record())
          │
          └──▶ HTTP Response (200 / 201 / 202)
```

---

## 3. Endpoints Specification

### 3.1 `POST /attendance/clock-in`
- **Description**: Records a clock-in event for an employee.
- **Permission**: `attendance:clock`
- **Request Body**:
  ```json
  {
    "employeeId": "emp_123",
    "workDate": "2026-08-02",
    "timestamp": "2026-08-02T08:00:00.000Z",
    "idempotencyKey": "evt_clock_in_001",
    "location": { "latitude": 37.7749, "longitude": -122.4194 },
    "notes": "Shift start"
  }
  ```
- **Response**: `201 Created` with reconstituted attendance record payload.

### 3.2 `POST /attendance/clock-out`
- **Description**: Records a clock-out event for an active employee.
- **Permission**: `attendance:clock`
- **Response**: `200 OK` with updated attendance record.

### 3.3 `POST /attendance/break-start`
- **Description**: Begins a break interval for an active employee.
- **Permission**: `attendance:clock`
- **Response**: `200 OK` with updated attendance record.

### 3.4 `POST /attendance/break-end`
- **Description**: Ends a break interval and resumes active working state.
- **Permission**: `attendance:clock`
- **Response**: `200 OK` with updated attendance record.

### 3.5 `POST /attendance/sync`
- **Description**: Processes an offline batch of attendance events idempotently with chronological sorting, drift checking, and batch execution status responses.
- **Permission**: `attendance:sync`
- **Request Body**: `AttendanceSyncBatchRequestSchema`
- **Response**: `200 OK` / `207 Multi-Status` with `AttendanceSyncBatchResponse` breakdown (`processed`, `duplicates`, `rejected`, `items`).

### 3.6 `GET /attendance/employee/:employeeId`
- **Description**: Retrieves daily attendance record for a specific employee and date (defaults to current server date).
- **Permission**: `attendance:read`
- **Query Params**: `workDate` (YYYY-MM-DD, optional)

### 3.7 `GET /attendance/summary`
- **Description**: Queries aggregated daily attendance summaries for tenant reporting.
- **Permission**: `attendance:read`
- **Query Params**: `startDate` (YYYY-MM-DD), `endDate` (YYYY-MM-DD), `departmentId` (optional), `limit` (optional), `offset` (optional)

---

## 4. RBAC Permission Additions

The `@adminops/identity` package `Permission` type will be extended with:
- `attendance:clock` — Granted to `owner`, `staff`, `member`
- `attendance:read` — Granted to `owner`, `staff`, `member`
- `attendance:sync` — Granted to `owner`, `staff`
- `attendance:manage` — Granted to `owner`, `staff`

---

## 5. Security & Multi-Tenancy

1. **Strict Tenant Isolation**: All queries enforce `request.tenant.tenantId`.
2. **Replay & Idempotency Protection**: Batch and real-time operations pass unique `idempotencyKey` strings handled by `PostgresAttendanceRepository`.
3. **Audit Trail**: Operational events emit audit entries through `AuditLog.record()`.

---

## 6. Implementation Plan & File Modifications

- `modules/platform/identity/src/permission.ts`: Add attendance permissions.
- `apps/api/src/routes/attendance.ts`: New Fastify route registration file.
- `apps/api/src/server.ts`: Register `registerAttendanceRoutes`.
- `apps/api/src/context.ts`: Inject `attendanceRepository` and `attendanceSyncEngine`.
- `apps/api/tests/attendance-routes.test.ts`: Integration test suite for REST API endpoints.
