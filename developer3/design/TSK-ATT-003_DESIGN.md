# Klerion Engineering Design Specification: TSK-ATT-003 — Postgres Attendance Repository

**Task ID**: TSK-ATT-003  
**Task Name**: Postgres Attendance Repository  
**Milestone**: Milestone 7 — Attendance Persistence Layer  
**Author**: Developer 3 (Workforce Core & Persistence Architect)  
**Date**: 2026-08-01  
**Status**: DESIGN COMPLETE — AWAITING PHASE 3 ARCHITECTURE REVIEW & PHASE 4 APPROVAL  

---

## 1. Executive Summary

`TSK-ATT-003 — Postgres Attendance Repository` bridges the `@adminops/workforce-core` domain aggregate root `AttendanceRecord` with the `@adminops/persistence` Drizzle ORM PostgreSQL persistence layer.

The task implements `PostgresAttendanceRepository`, providing concrete PostgreSQL persistence for:
1. `AttendanceRecord` aggregates (persisting to `attendance_summaries` table and storing break/exception states in JSON/relational attributes).
2. Attendance events (persisting event items to `attendance_events` table).
3. `AttendanceRecordStore` and `IdempotencyRegistryStore` implementations backed by PostgreSQL to power `AttendanceSyncEngine` in persistent environments.

---

## 2. Repository Architecture & Contract Design

### 2.1 Class Structure & Constructor
The repository follows the established pattern in `PostgresEmployeeRepository` (`packages/persistence/src/postgres-employee-repository.ts`):

```typescript
export class PostgresAttendanceRepository implements AttendanceRecordStore, IdempotencyRegistryStore {
  constructor(private readonly db: KlerionDatabase) {}

  // Aggregate operations
  public async save(record: AttendanceRecord): Promise<void>;
  public async findById(tenantId: string, id: string): Promise<AttendanceRecord | null>;
  public async findByEmployeeAndDate(tenantId: string, employeeId: string, workDate: string): Promise<AttendanceRecord | null>;
  
  // AttendanceRecordStore interface compatibility (for AttendanceSyncEngine)
  public async getRecord(tenantId: string, employeeId: string, workDate: string): Promise<AttendanceRecord | null>;
  public async saveRecord(record: AttendanceRecord): Promise<void>;

  // IdempotencyRegistryStore interface compatibility (for AttendanceSyncEngine)
  public async has(tenantId: string, idempotencyKey: string): Promise<boolean>;
  public async get(tenantId: string, idempotencyKey: string): Promise<IdempotencyRegistryEntry | null>;
  public async saveIdempotencyEntry(entry: IdempotencyRegistryEntry): Promise<void>;
}
```

### 2.2 Domain Boundary Protection
- The repository consumes standard domain instances (`AttendanceRecord`) and converts them to row models using mapping functions.
- The repository returns reconstituted aggregate roots (`AttendanceRecord.reconstitute(...)`) with zero uncommitted events.
- All errors are wrapped using `mapPgError()` from `pg-errors.ts` to throw `AttendanceDomainError` or `PersistenceError`.

---

## 3. Aggregate Persistence & Database Schema Mapping

### 3.1 Mapping `AttendanceRecord` to `attendance_summaries`
The `attendance_summaries` table (`packages/persistence/src/schema.ts`) stores aggregate state:
- `id`: UUID (Primary Key matching `record.id`)
- `tenant_id`: UUID (`record.tenantId`)
- `employee_id`: UUID (`record.employeeId`)
- `work_date`: Text YYYY-MM-DD (`record.workDate`)
- `first_clock_in`: Timestamp UTC (`record.clockInTime`)
- `last_clock_out`: Timestamp UTC (`record.clockOutTime`)
- `total_work_minutes`: Integer (`record.summary.totalWorkMinutes`)
- `total_break_minutes`: Integer (`record.summary.totalBreakMinutes`)
- `total_overtime_minutes`: Integer (`record.summary.overtimeMinutes`)
- `status`: Text (`IDLE`, `CLOCKED_IN`, `ON_BREAK`, `CLOCKED_OUT`)
- `summary_metadata`: JSON field holding embedded breaks (`breaks: BreakIntervalState[]`) and exceptions (`exceptions: AttendanceExceptionState[]`)

### 3.2 Aggregate Reconstitution Pipeline
```text
┌─────────────────────────┐
│ attendance_summaries    │
│ row from PostgreSQL     │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Parse summary_metadata  │
│ (breaks, exceptions)    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Reconstitute            │
│ AttendanceRecordState   │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ AttendanceRecord.       │
│ reconstitute(state, []) │
└─────────────────────────┘
```

---

## 4. Attendance Domain Event & Idempotency Persistence

### 4.1 Persistence of Attendance Events (`attendance_events`)
When `save(record)` is executed:
1. Uncommitted events on `record.uncommittedEvents` are mapped to `attendance_events` table rows:
   - `id`: UUID (`event.eventId`)
   - `tenant_id`: UUID (`event.tenantId`)
   - `employee_id`: UUID (`event.payload.employeeId`)
   - `event_type`: Text (`clock_in`, `clock_out`, `break_start`, `break_end`, `exception_detected`)
   - `event_timestamp`: Timestamp UTC (`event.occurredAt`)
   - `work_date`: Text (`event.payload.workDate`)
   - `source`: Text (`mobile`, `web`, `kiosk`, etc.)
   - `idempotency_key`: Text (`event.payload.idempotencyKey`)
   - `metadata`: JSON (`event.payload`)
2. `record.clearUncommittedEvents()` is invoked upon successful transaction commit.

### 4.2 Idempotency Persistence via `attendance_events`
- `has(tenantId, idempotencyKey)` queries `attendance_events` table where `tenant_id = tenantId` AND `idempotency_key = idempotencyKey`.
- `get(tenantId, idempotencyKey)` fetches the corresponding `attendance_events` row and converts it into `IdempotencyRegistryEntry`.

---

## 5. Transaction Boundary & Multi-Tenant Isolation

### 5.1 Transactional Atomicity
Saving an attendance record and its uncommitted events is wrapped in a database transaction:
```typescript
await this.db.transaction(async (tx) => {
  // 1. Upsert attendance_summaries row
  // 2. Insert uncommitted domain events into attendance_events
  // 3. Commit
});
record.clearUncommittedEvents();
```

### 5.2 Multi-Tenant Query Filtering
Every query strictly requires `tenantId`.
- Index: `idx_attendance_summaries_tenant_emp_date` (`tenant_id`, `employee_id`, `work_date`)
- Unique constraint: `(tenant_id, employee_id, work_date)` ensures an employee can have at most one attendance record per work date per tenant.

---

## 6. Testing Strategy

Using PGlite embedded PostgreSQL database engine in `packages/persistence/tests`:
1. `PostgresAttendanceRepository.save()` & `findByEmployeeAndDate()` roundtrip.
2. Reconstitution of breaks, active shift state, and exceptions from `summary_metadata`.
3. Idempotent key registration and duplicate detection via `has()` and `get()`.
4. Transaction rollback verification on database failure.
5. Multi-tenant boundary isolation (queries with different `tenantId` return `null`).

---

## 7. File Impact Plan

### Files to Create
- `packages/persistence/src/postgres-attendance-repository.ts`
- `packages/persistence/tests/postgres-attendance-repository.test.ts`

### Files to Modify
- `packages/persistence/src/index.ts` (Export `PostgresAttendanceRepository`)
- `packages/persistence/package.json` (Register test file in test runner)

---

## 8. Risks & Mitigation

- **Risk**: Metadata JSON parsing error if schema changes in future releases.
  - **Mitigation**: Guard JSON parsing using Zod schemas during aggregate reconstitution; throw clear `PersistenceError` on schema mismatch.
