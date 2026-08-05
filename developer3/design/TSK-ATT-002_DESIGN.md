# Klerion Engineering Design Specification: TSK-ATT-002 — Idempotency Engine & Clock Logic

**Task ID**: TSK-ATT-002  
**Task Name**: Idempotency Engine & Clock Logic  
**Milestone**: Milestone 6 — Time & Attendance Core Engine  
**Author**: Developer 3 (Workforce Core, Time & Attendance Architect)  
**Date**: 2026-08-01  
**Status**: DESIGN COMPLETE — AWAITING PHASE 3 ARCHITECTURE REVIEW & PHASE 4 APPROVAL  

---

## 1. Executive Summary

`TSK-ATT-002 — Idempotency Engine & Clock Logic` extends `@adminops/workforce-core` by providing an offline-safe, multi-tenant synchronization and idempotency engine for Time & Attendance events. Mobile devices, kiosks, and offline web clients operating in disconnected environments generate attendance events (`clock_in`, `clock_out`, `break_start`, `break_end`) locally with client-side idempotency keys and device timestamps. 

When connectivity is restored, clients transmit batch synchronization requests (`AttendanceSyncBatchRequest`). `TSK-ATT-002` introduces the `AttendanceSyncService` (a pure domain service) and `AttendanceIdempotencyStore` / `AttendanceSyncEngine` logic to:
1. Enforce tenant boundary isolation (`tenantId` matching).
2. Validate event schemas and client idempotency keys (`idempotencyKey`).
3. Deduplicate events against previous submissions (returning idempotent success results for re-transmitted events).
4. Sort out-of-order events chronologically by event timestamp (`occurredAt` / `timestamp`).
5. Perform clock drift reconciliation and guard against future timestamp manipulation.
6. Deterministically replay attendance events against `AttendanceRecord` aggregates.
7. Return clean batch processing receipts (`AttendanceSyncBatchResponse`) detailing processed, duplicate, and rejected items.

---

## 2. Architecture & Idempotency Design

### 2.1 Responsibility Allocation (Aggregate vs. Domain Service)
- **`AttendanceRecord` Aggregate**: Continues to strictly own attendance state transitions, duration calculations, exception detections, and invariant protections. It remains agnostic to batch network payloads or caching mechanisms.
- **`AttendanceSyncEngine` / `AttendanceSyncService` (Domain Service)**: Serves as the domain orchestration layer for batch processing, idempotency key cache/registry management, event reordering, clock validation, and aggregate replay orchestration.

### 2.2 Idempotency Key Specification
Each attendance event submitted for synchronization carries an explicit `idempotencyKey` (e.g., `clk_in_550e8400-e29b-41d4-a716-446655440000_1722500000`).
- **Idempotency Key Scope**: `tenantId` + `idempotencyKey`.
- **Deduplication Strategy**:
  - The engine tracks processed `idempotencyKey` records.
  - If a submitted key has already been successfully processed with identical payload hash, the engine returns the cached `PROCESSED_DUPLICATE` status with the original result without re-executing state mutation.
  - If a key is re-submitted with a conflicting payload (different event type or employee), the engine flags a `PAYLOAD_MISMATCH_CONFLICT` rejection.

---

## 3. Synchronization Workflow & Processing Pipeline

### 3.1 Processing Pipeline
```text
┌────────────────────────────────────────────────────────┐
│ 1. Receive Sync Batch (AttendanceSyncBatchRequest)      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Tenant Boundary & Schema Validation                 │
│    (Verify batch tenantId == event tenantId)           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Clock Validation & Drift Check                      │
│    (Reject future dates beyond threshold, e.g. >15m)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Deduplication & Idempotency Key Check              │
│    (Filter already-processed events)                   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 5. Chronological Sorting & Sequence Reordering         │
│    (Sort valid new events by event timestamp)          │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 6. Replay Events Against AttendanceRecord Aggregates    │
│    (Execute clockIn, startBreak, endBreak, clockOut)   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 7. Construct & Return AttendanceSyncBatchResponse      │
│    (Summary count, processed items, duplicates, errors)│
└────────────────────────────────────────────────────────┘
```

---

## 4. Event Ordering & Replay Strategy

### 4.1 Chronological Sorting
Offline devices may upload events out of order due to network queueing (e.g., `clock_out` delivered before `clock_in`).
- **Sorting Rule**: Events within a sync batch are grouped by `employeeId` + `workDate` and sorted ascending by ISO 8601 timestamp (`timestamp` / `occurredAt`).
- **Sequence Determinism**: If two events have identical millisecond timestamps, they are ordered deterministically by operational priority: `clock_in` (1) -> `start_break` (2) -> `end_break` (3) -> `clock_out` (4).

### 4.2 Replay Mechanics
- Events are applied sequentially to the corresponding `AttendanceRecord` aggregate for that employee and date.
- If an event fails aggregate invariants (e.g., `clockIn` when already clocked in), that specific event item is marked `REJECTED_INVALID_STATE` in the batch response without corrupting previously valid events in the batch.

---

## 5. Clock Logic & Timestamp Reconciliation

### 5.1 Drift & Future Timestamp Guards
- **Server Timestamp Authority**: Server clock at time of batch receipt is denoted $T_{server}$.
- **Future Timestamp Protection**: Any event with $T_{event} > T_{server} + 15\text{ minutes}$ is rejected with `REJECTED_FUTURE_TIMESTAMP` to prevent client clock tampering.
- **Historical Offline Horizon**: Events with $T_{event} < T_{server} - 30\text{ days}$ require administrative audit flags or flag `REJECTED_STALE_OFFLINE_EVENT`.

---

## 6. Multi-Tenant Isolation Design

- **Batch Enclosure Rule**: `AttendanceSyncBatchRequest` requires top-level `tenantId`.
- **Event Item Enclosure Rule**: Every event item inside `events` array requires `tenantId`.
- **Strict Guard**: If any event item contains a `tenantId` different from the batch `tenantId`, the entire batch is rejected immediately with `DomainError("Tenant mismatch in sync batch")`.

---

## 7. Contract Design (`contracts.ts` Additions)

```typescript
export interface AttendanceSyncItem {
  eventId: string;
  tenantId: string;
  employeeId: string;
  workDate: string; // YYYY-MM-DD
  eventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  timestamp: string; // ISO 8601
  idempotencyKey: string;
  source: "web" | "mobile" | "kiosk" | "manual" | "system";
  location?: AttendanceLocation | null;
  notes?: string | null;
}

export interface AttendanceSyncBatchRequest {
  batchId: string;
  tenantId: string;
  submittedAt: string; // ISO 8601
  deviceId?: string;
  events: AttendanceSyncItem[];
}

export type SyncItemStatus = 
  | "PROCESSED_SUCCESS"
  | "PROCESSED_DUPLICATE"
  | "REJECTED_TENANT_MISMATCH"
  | "REJECTED_FUTURE_TIMESTAMP"
  | "REJECTED_INVALID_STATE"
  | "REJECTED_PAYLOAD_MISMATCH";

export interface SyncItemResult {
  eventId: string;
  idempotencyKey: string;
  status: SyncItemStatus;
  message?: string;
  recordId?: string;
}

export interface AttendanceSyncBatchResponse {
  batchId: string;
  tenantId: string;
  processedAt: string;
  totalReceived: number;
  processedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  results: SyncItemResult[];
}
```

---

## 8. File Impact Plan

### Files to Create
- `modules/domains/workforce-core/src/idempotency.ts`: Implements `AttendanceSyncEngine`, `InMemoryIdempotencyRegistry`, and sync logic.
- `modules/domains/workforce-core/tests/idempotency.test.ts`: Comprehensive test suite for batch sync, duplicate detection, out-of-order replay, clock drift guards, and multi-tenant isolation.

### Files to Modify
- `modules/domains/workforce-core/src/contracts.ts`: Add `AttendanceSyncItem`, `AttendanceSyncBatchRequest`, `SyncItemResult`, `AttendanceSyncBatchResponse` contracts and Zod schemas.
- `modules/domains/workforce-core/src/index.ts`: Export new idempotency engine classes, functions, and contract types.

---

## 9. Testing Strategy

1. **Duplicate Detection Tests**: Submitting identical batch twice returns `PROCESSED_DUPLICATE` without double-clocking or duplicate domain events.
2. **Out-of-Order Replay Tests**: Submitting `clock_out` before `clock_in` in batch payload sorts chronologically and processes successfully.
3. **Clock Drift Tests**: Rejecting timestamps > 15 minutes in the future.
4. **Tenant Isolation Tests**: Mismatched `tenantId` in batch or event item immediately throws/rejects.
5. **Batch Summary Metrics**: Verifying `totalReceived`, `processedCount`, `duplicateCount`, `rejectedCount` accuracy.

---

## 10. Design Risks & Mitigation

- **Risk**: Memory growth of idempotency key registry in long-running node instances.
  - **Mitigation**: `InMemoryIdempotencyRegistry` supports key TTL eviction (e.g. 30 days) and clean interface for pluggable persistent store in future database modules (TSK-ATT-003).
