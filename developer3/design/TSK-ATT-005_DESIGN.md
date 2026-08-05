# Engineering Design Specification: TSK-ATT-005 — Attendance Correction Request Workflow API

**Task ID**: TSK-ATT-005  
**Task Name**: Attendance Correction Request Workflow API  
**Milestone**: Milestone 8 — Attendance REST APIs & Corrections  
**Developer**: Developer 3 (Workforce Core, Employee Master Records, Time & Attendance)  
**Date**: 2026-08-02  
**Status**: DESIGN PHASE (PENDING IMPLEMENTATION AUTHORIZATION)  

---

## 1. Executive Summary & Overview

Task TSK-ATT-005 establishes the end-to-end domain model, persistence layer, Fastify REST API endpoints, and transactional approval workflow for employee attendance correction requests within Klerion's `@adminops/workforce-core`, `@adminops/persistence`, and `@adminops/api`.

Employees occasionally miss clocking events (forgot to clock in, forgot to clock out, or incorrect timestamp recorded due to connectivity/device failure). The Attendance Correction Request workflow enables employees to submit request tickets to adjust target events or record missed events. Managers and Administrators review these requests, approving or rejecting them with review notes. 

When approved, the system transactionally updates the correction status, applies the requested event to the target `AttendanceRecord`, recalculates work and break duration metrics, updates the `attendance_summaries` record, and records an immutable hash-chained audit trail log entry.

---

## 2. Phase 1 — Repository & Architecture Analysis Findings

### 2.1 Database Schema Audit (`attendance_corrections`)
Inspection of `packages/persistence/src/schema.ts` confirms that the `attendance_corrections` table is fully defined and already deployed in the Drizzle ORM schema:

```typescript
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    targetEventId: uuid("target_event_id").references(() => attendanceEvents.id, { onDelete: "set null" }),
    requestedEventType: text("requested_event_type").notNull(),
    requestedTimestamp: timestamp("requested_timestamp", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attendance_corrections_tenant_status_idx").on(table.tenantId, table.status),
    index("attendance_corrections_tenant_emp_idx").on(table.tenantId, table.employeeId),
  ],
);
```

**Schema Findings**:
- **Foreign Keys**: Cascading deletion for `tenantId` and `employeeId`; SET NULL for `targetEventId` and `reviewedByUserId`.
- **Tenant Isolation**: Foreign key reference to `tenants.id` with mandatory composite indexes for high-speed tenant-scoped lookups.
- **Workflow State**: Supported values are `"pending"`, `"approved"`, and `"rejected"`.
- **Verdict**: The existing database schema is complete, well-indexed, and requires **ZERO schema modifications**.

### 2.2 Domain Contracts Audit (`@adminops/workforce-core`)
Inspection of `modules/domains/workforce-core/src/contracts.ts` confirms the existence of Zod schemas and TypeScript types:
- `CorrectionStatusSchema`: `"pending" | "approved" | "rejected"`
- `AttendanceCorrectionSchema`: Entity schema with UUID formats and timestamp strings.
- `RequestAttendanceCorrectionSchema`: Input validation schema for submission (`tenantId`, `employeeId`, `targetEventId`, `requestedEventType`, `requestedTimestamp`, `reason`).
- `ReviewAttendanceCorrectionSchema`: Input validation schema for approval/rejection (`tenantId`, `correctionId`, `reviewedByUserId`, `approved`, `reviewNotes`).

### 2.3 RBAC & Permission System Audit
Inspection of `modules/platform/identity/src/permission.ts` confirms:
- Permissions available:
  - `attendance:clock`: Required for submitting correction requests for oneself/employee.
  - `attendance:read`: Required for listing and viewing correction request details.
  - `attendance:manage`: Required for reviewing, approving, and rejecting correction requests.
- Roles mapping:
  - `owner`: Has `attendance:clock`, `attendance:read`, `attendance:sync`, `attendance:manage`.
  - `staff`: Has `attendance:clock`, `attendance:read`, `attendance:sync`, `attendance:manage`.
  - `member`: Has `attendance:clock`, `attendance:read`.

---

## 3. Domain Model Design

### 3.1 Attendance Correction Aggregate Lifecycle
The correction workflow follows a strict state transition lifecycle:

```
        [ Submit Correction ]
                  │
                  ▼
            ┌───────────┐
            │  PENDING  │
            └─────┬─────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
 [ Manager Approve ]  [ Manager Reject ]
        │                   │
        ▼                   ▼
  ┌───────────┐       ┌───────────┐
  │ APPROVED  │       │ REJECTED  │
  └───────────┘       └───────────┘
```

### 3.2 State Transition Invariants & Rules
1. **Initial State**: New requests are always created in the `"pending"` status.
2. **Terminal States**: `"approved"` and `"rejected"` are immutable terminal states. Once a correction reaches `"approved"` or `"rejected"`, no further state transitions or reviews are permitted. Attempting to re-review returns a `409 Conflict` domain error.
3. **Reason Requirement**: `reason` must be a non-empty string explaining the context of the correction request.
4. **Target Event Validation**: If `targetEventId` is provided, it must reference an existing `attendance_events` record belonging to the same tenant and employee. If `targetEventId` is null, the request represents a missing clock event insertion.
5. **Timestamp Validation**: `requestedTimestamp` must be an ISO 8601 string in the past or present (reject future timestamps exceeding clock drift threshold of +5 minutes).

---

## 4. Repository & Persistence Design

### 4.1 Repository Interface (`AttendanceCorrectionRepository`)
We define a clean repository contract in `modules/domains/workforce-core/src/contracts.ts` (or package exports):

```typescript
export interface AttendanceCorrectionFilterOptions {
  employeeId?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
  offset?: number;
}

export interface AttendanceCorrectionRepository {
  create(correction: AttendanceCorrectionInput): Promise<AttendanceCorrection>;
  findById(tenantId: string, id: string): Promise<AttendanceCorrection | null>;
  list(tenantId: string, options?: AttendanceCorrectionFilterOptions): Promise<AttendanceCorrection[]>;
  count(tenantId: string, options?: AttendanceCorrectionFilterOptions): Promise<number>;
  updateStatus(
    tenantId: string,
    id: string,
    status: "approved" | "rejected",
    reviewedByUserId: string,
    reviewNotes?: string
  ): Promise<AttendanceCorrection>;
}
```

### 4.2 Implementation (`PostgresAttendanceCorrectionRepository`)
Created in `packages/persistence/src/postgres-attendance-correction-repository.ts`:
- Reuses Drizzle ORM instance (`Database`).
- Implements tenant boundary isolation on every query (`eq(attendanceCorrections.tenantId, tenantId)`).
- Maps DB rows to `AttendanceCorrection` domain contract objects.

---

## 5. Transaction & Approval Strategy Design

### 5.1 Approval Atomic Transaction Flow
When a manager/owner calls `POST /attendance/corrections/:id/approve`, the operation is wrapped in a single database transaction (`db.transaction`):

```
BEGIN TRANSACTION
  1. Acquire lock & select attendance_corrections row WHERE id = :id AND tenant_id = :tenantId
  2. Validate correction status == "pending" (Throw 409 if already approved/rejected)
  3. Update attendance_corrections:
       status = "approved"
       reviewed_by_user_id = :userId
       review_notes = :reviewNotes
       updated_at = NOW()
  4. Fetch or create AttendanceRecord for employeeId on workDate = requestedTimestamp.slice(0, 10)
  5. Apply requested event to AttendanceRecord based on requestedEventType:
       - "clock_in": record.clockIn(requestedTimestamp, { source: "manual", notes: "Correction #" + id })
       - "clock_out": record.clockOut(requestedTimestamp, { source: "manual", notes: "Correction #" + id })
       - "break_start": record.startBreak(requestedTimestamp, { source: "manual", notes: "Correction #" + id })
       - "break_end": record.endBreak(requestedTimestamp, { source: "manual", notes: "Correction #" + id })
  6. Save updated AttendanceRecord (Upsert attendance_summaries row & insert attendance_events row)
  7. Write hash-chained audit log entry (`attendance.correction_approved`)
COMMIT TRANSACTION
```

If any step in the transaction fails (e.g., domain invalid state transition in `AttendanceRecord`), the entire transaction is rolled back, guaranteeing zero partial or corrupted states.

### 5.2 Rejection Transaction Flow
When calling `POST /attendance/corrections/:id/reject`:
```
BEGIN TRANSACTION
  1. Select attendance_corrections row WHERE id = :id AND tenant_id = :tenantId
  2. Validate correction status == "pending" (Throw 409 if already approved/rejected)
  3. Update attendance_corrections:
       status = "rejected"
       reviewed_by_user_id = :userId
       review_notes = :reviewNotes
       updated_at = NOW()
  4. Write hash-chained audit log entry (`attendance.correction_rejected`)
COMMIT TRANSACTION
```

---

## 6. REST API Endpoints Design

### 6.1 `POST /attendance/corrections` — Submit Correction Request
- **HTTP Method**: `POST`
- **Route**: `/attendance/corrections`
- **Purpose**: Submit a new attendance correction request ticket.
- **Authentication**: Required (Bearer JWT / Session token).
- **Permission**: `attendance:clock` or `attendance:read`.
- **Tenant Isolation**: Strict `request.tenant!.tenantId` boundary enforcement.
- **Request Body**:
  ```json
  {
    "employeeId": "uuid-string",
    "targetEventId": "uuid-string (optional)",
    "requestedEventType": "clock_in | clock_out | break_start | break_end",
    "requestedTimestamp": "2026-08-02T08:00:00.000Z",
    "reason": "Forgot to clock in upon arrival at client site"
  }
  ```
- **Response Body (201 Created)**:
  ```json
  {
    "message": "Attendance correction request submitted successfully",
    "correction": {
      "id": "uuid-string",
      "tenantId": "uuid-string",
      "employeeId": "uuid-string",
      "targetEventId": "uuid-string | null",
      "requestedEventType": "clock_in",
      "requestedTimestamp": "2026-08-02T08:00:00.000Z",
      "reason": "Forgot to clock in upon arrival at client site",
      "status": "pending",
      "reviewedByUserId": null,
      "reviewNotes": null,
      "createdAt": "2026-08-02T09:00:00.000Z",
      "updatedAt": "2026-08-02T09:00:00.000Z"
    }
  }
  ```
- **Validation Rules**:
  - `employeeId`: required UUID string.
  - `requestedEventType`: must be one of `clock_in`, `clock_out`, `break_start`, `break_end`.
  - `requestedTimestamp`: valid ISO 8601 string, not in future (> 5 mins drift).
  - `reason`: non-empty string (min 1 char).
- **Status Codes**: `201 Created`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.
- **Audit Event**: `attendance.correction_submitted`.

---

### 6.2 `GET /attendance/corrections` — List Correction Requests
- **HTTP Method**: `GET`
- **Route**: `/attendance/corrections`
- **Purpose**: Query attendance correction requests for the tenant with optional status and employee filters.
- **Authentication**: Required.
- **Permission**: `attendance:read`.
- **Tenant Isolation**: Enforced (`WHERE tenant_id = request.tenant!.tenantId`).
- **Query Parameters**:
  - `employeeId` (optional UUID string)
  - `status` (optional string: `"pending" | "approved" | "rejected"`)
  - `limit` (optional integer, default 50)
  - `offset` (optional integer, default 0)
- **Response Body (200 OK)**:
  ```json
  {
    "corrections": [ /* array of correction objects */ ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
  ```
- **Status Codes**: `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`.

---

### 6.3 `GET /attendance/corrections/:id` — Get Single Correction Request
- **HTTP Method**: `GET`
- **Route**: `/attendance/corrections/:id`
- **Purpose**: Retrieve detailed information for a single correction request by ID.
- **Authentication**: Required.
- **Permission**: `attendance:read`.
- **Tenant Isolation**: Enforced (`WHERE id = :id AND tenant_id = request.tenant!.tenantId`).
- **Response Body (200 OK)**:
  ```json
  {
    "correction": { /* correction object */ }
  }
  ```
- **Status Codes**: `200 OK`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`.

---

### 6.4 `POST /attendance/corrections/:id/approve` — Approve Correction Request
- **HTTP Method**: `POST`
- **Route**: `/attendance/corrections/:id/approve`
- **Purpose**: Review and approve a pending attendance correction request, transactionally updating attendance records.
- **Authentication**: Required.
- **Permission**: `attendance:manage`.
- **Tenant Isolation**: Enforced.
- **Request Body**:
  ```json
  {
    "reviewNotes": "Approved by branch supervisor"
  }
  ```
- **Response Body (200 OK)**:
  ```json
  {
    "message": "Attendance correction approved successfully",
    "correction": {
      "id": "uuid-string",
      "status": "approved",
      "reviewedByUserId": "user-uuid",
      "reviewNotes": "Approved by branch supervisor",
      "updatedAt": "2026-08-02T10:00:00.000Z"
    },
    "attendanceRecord": { /* updated attendance record state */ }
  }
  ```
- **Status Codes**: `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`.
- **Audit Event**: `attendance.correction_approved`.

---

### 6.5 `POST /attendance/corrections/:id/reject` — Reject Correction Request
- **HTTP Method**: `POST`
- **Route**: `/attendance/corrections/:id/reject`
- **Purpose**: Review and reject a pending attendance correction request with mandatory or optional review notes.
- **Authentication**: Required.
- **Permission**: `attendance:manage`.
- **Tenant Isolation**: Enforced.
- **Request Body**:
  ```json
  {
    "reviewNotes": "Rejected: Insufficient justification provided"
  }
  ```
- **Response Body (200 OK)**:
  ```json
  {
    "message": "Attendance correction rejected successfully",
    "correction": {
      "id": "uuid-string",
      "status": "rejected",
      "reviewedByUserId": "user-uuid",
      "reviewNotes": "Rejected: Insufficient justification provided",
      "updatedAt": "2026-08-02T10:00:00.000Z"
    }
  }
  ```
- **Status Codes**: `200 OK`, `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`.
- **Audit Event**: `attendance.correction_rejected`.

---

## 7. API Contract Audit

| Endpoint | Method | Permission | Tenant Scoped | Validation Schema | Audit Log Event | Status Codes |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `/attendance/corrections` | POST | `attendance:clock` | Yes | `RequestAttendanceCorrectionSchema` | `attendance.correction_submitted` | 201, 400, 401, 403, 404 |
| `/attendance/corrections` | GET | `attendance:read` | Yes | Query validation (limit, offset, status) | N/A | 200, 400, 401, 403 |
| `/attendance/corrections/:id` | GET | `attendance:read` | Yes | Params validation (id UUID) | N/A | 200, 401, 403, 404 |
| `/attendance/corrections/:id/approve` | POST | `attendance:manage` | Yes | `ReviewAttendanceCorrectionSchema` | `attendance.correction_approved` | 200, 400, 401, 403, 404, 409 |
| `/attendance/corrections/:id/reject` | POST | `attendance:manage` | Yes | `ReviewAttendanceCorrectionSchema` | `attendance.correction_rejected` | 200, 400, 401, 403, 404, 409 |

---

## 8. Integration Audit

| Module / Subsystem | Integration Assessment & Risk Verification | Status | Mitigation Strategy |
| :--- | :--- | :---: | :--- |
| **Employee Module** | Requests validate target `employeeId` exists in employee repository | Verified | Return `404 Not Found` if employee does not exist or belongs to another tenant. |
| **Attendance Repository** | Approval transaction interacts with `PostgresAttendanceRepository` | Verified | Perform all status changes and record updates inside single `db.transaction`. |
| **AttendanceSyncEngine** | Re-uses domain event processing for corrected events | Verified | Apply standard `AttendanceRecord` methods (`clockIn`, `clockOut`, `startBreak`, `endBreak`). |
| **Idempotency Engine** | Unique idempotency key generated for approved correction events | Verified | Prefix key `corr_appr_${correctionId}` to prevent batch collision. |
| **RBAC / Identity** | Guards endpoints with `attendance:clock`, `attendance:read`, `attendance:manage` | Verified | Existing permissions in `@adminops/identity` fully support all correction routes. |
| **Audit Logging** | Integrates hash-chained logging via `auditLog.record()` | Verified | Action names `attendance.correction_submitted`, `approved`, `rejected` follow conventions. |
| **Tenant Isolation** | All SQL queries filter on `tenantId` | Verified | Extracted strictly from `request.tenant!.tenantId`. |
| **Existing REST APIs** | Routes registered in `apps/api/src/routes/attendance.ts` | Verified | No breaking changes to existing `/attendance/clock-in`, `/attendance/clock-out`, `/attendance/sync` routes. |
| **Database Schema** | `attendance_corrections` table already defined in Drizzle schema | Verified | **0 schema migrations required**. |

---

## 9. Implementation Readiness & Conclusion

Task TSK-ATT-005 design is complete, verified against all repository constraints, and fully specified. Upon authorization, implementation will proceed through the standard testing, linting, verification, and closure pipeline.
