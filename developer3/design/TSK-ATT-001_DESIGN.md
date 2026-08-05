# Klerion Engineering Design Specification: TSK-ATT-001 — Attendance Domain Aggregate & Events

**Task ID**: TSK-ATT-001  
**Task Name**: Attendance Domain Aggregate & Events  
**Milestone**: Milestone 6 — Time & Attendance Core Engine  
**Author**: Developer 3 (Workforce Core, Time & Attendance Architect)  
**Date**: 2026-08-01  
**Status**: DESIGN COMPLETE — AWAITING PHASE 3 ARCHITECTURE REVIEW & PHASE 4 APPROVAL  

---

## 1. Executive Summary

`TSK-ATT-001 — Attendance Domain Aggregate & Events` establishes the core Time & Attendance domain engine within `@adminops/workforce-core`. Building upon the value objects and contract schemas established in `TSK-WFC-002` (`AttendanceStatus`, `AttendanceEvent`, `AttendanceSummary`, `AttendanceException`), TSK-ATT-001 implements the rich `AttendanceRecord` Aggregate Root, encapsulating the clock-in, clock-out, break interval lifecycle, active duration calculations, attendance exception detection logic, and domain event creation.

All domain operations maintain strict domain boundaries, pure functional immutability, multi-tenant isolation via mandatory `tenantId` enforcement, and complete decoupled domain event generation following Klerion's standard event envelope schema (`DomainEventEnvelope`).

---

## 2. Attendance Aggregate Design

### 2.1 Aggregate Root: `AttendanceRecord`
The `AttendanceRecord` Aggregate Root governs the lifecycle of an employee's time recording session for a specific calendar date or work shift.

#### Core Responsibilities
1. Enforce valid state transitions (`IDLE` -> `CLOCKED_IN` -> `ON_BREAK` -> `CLOCKED_IN` -> `CLOCKED_OUT`).
2. Manage break intervals (`BreakInterval` value objects) and ensure break invariants.
3. Calculate active work duration (Total Elapsed Time minus Break Duration).
4. Perform attendance exception detection (Late Arrival, Missing Clock-Out, Excessive Break, Early Departure).
5. Record un-emitted domain events during lifecycle transitions for downstream processing.
6. Support clean reconstitution from stored state without emitting duplicate creation events.

### 2.2 Aggregate Internal State (`AttendanceRecordState`)
```typescript
export interface BreakInterval {
  breakId: string;
  startTime: string; // ISO 8601
  endTime: string | null; // ISO 8601 or null if currently active
  durationMinutes: number | null;
}

export interface AttendanceRecordState {
  recordId: string;
  tenantId: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  status: 'IDLE' | 'CLOCKED_IN' | 'ON_BREAK' | 'CLOCKED_OUT';
  clockInTime: string | null; // ISO 8601
  clockOutTime: string | null; // ISO 8601
  breaks: BreakInterval[];
  activeDurationMinutes: number;
  totalBreakMinutes: number;
  exceptions: AttendanceException[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

### 2.3 Lifecycle & Factory Methods
1. `AttendanceRecord.create(params: CreateAttendanceRecordParams): AttendanceRecord`
   - Instantiates a new `AttendanceRecord` in `IDLE` state.
   - Emits no initial events until `clockIn()` is called (or optionally initializes and clocks in directly via `AttendanceRecord.clockIn()`).
2. `AttendanceRecord.reconstitute(state: AttendanceRecordState): AttendanceRecord`
   - Re-hydrates an aggregate instance directly from database or repository state without recording new domain events.
3. `AttendanceRecord.toSummary(): AttendanceSummary`
   - Exposes an immutable snapshot conforming to the `AttendanceSummary` contract defined in `contracts.ts`.

---

## 3. State Transition Design

### 3.1 State Machine Rules
```text
      ┌───────────┐
      │   IDLE    │
      └─────┬─────┘
            │ clockIn()
            ▼
      ┌───────────┐  startBreak()  ┌───────────┐
      │ CLOCKED_IN├───────────────►│ ON_BREAK  │
      │           │◄───────────────┤           │
      └─────┬─────┘   endBreak()   └─────┬─────┘
            │                            │
            │ clockOut()                 │ clockOut() [Auto-closes break]
            ▼                            ▼
      ┌────────────────────────────────────────┐
      │              CLOCKED_OUT               │
      └────────────────────────────────────────┘
```

### 3.2 Method Rules & Invariants

#### 1. `clockIn(timestamp: string, location?: string, metadata?: Record<string, unknown>): void`
- **Allowed From**: `IDLE` or `CLOCKED_OUT` (if creating a new shift entry).
- **Forbidden From**: `CLOCKED_IN` or `ON_BREAK` (throws `DomainError: Employee is already clocked in`).
- **State Change**: Sets `status = 'CLOCKED_IN'`, `clockInTime = timestamp`, updates `updatedAt`.
- **Event Emitted**: `attendance.clocked_in.v1`.

#### 2. `startBreak(timestamp: string, breakId?: string): void`
- **Allowed From**: `CLOCKED_IN`.
- **Forbidden From**: `IDLE`, `ON_BREAK`, `CLOCKED_OUT` (throws `DomainError: Cannot start break unless clocked in`).
- **Invariant**: Cannot start a break if a previous break is currently open (`endTime === null`).
- **State Change**: Sets `status = 'ON_BREAK'`, appends new `BreakInterval` to `breaks`, updates `updatedAt`.
- **Event Emitted**: `attendance.break_started.v1`.

#### 3. `endBreak(timestamp: string): void`
- **Allowed From**: `ON_BREAK`.
- **Forbidden From**: `IDLE`, `CLOCKED_IN`, `CLOCKED_OUT` (throws `DomainError: Employee is not currently on break`).
- **Invariant**: `timestamp` must be greater than or equal to `break.startTime`.
- **State Change**: Sets `endTime` and calculates `durationMinutes` for active break interval, sets `status = 'CLOCKED_IN'`, recalculates `totalBreakMinutes`, updates `updatedAt`.
- **Event Emitted**: `attendance.break_ended.v1`.

#### 4. `clockOut(timestamp: string, location?: string, metadata?: Record<string, unknown>): void`
- **Allowed From**: `CLOCKED_IN` or `ON_BREAK`.
- **Forbidden From**: `IDLE` or `CLOCKED_OUT` (throws `DomainError: Cannot clock out when not clocked in`).
- **Invariant Side Effect**: If currently `ON_BREAK`, auto-ends the open break at `timestamp` before clocking out. `timestamp` must be greater than or equal to `clockInTime`.
- **State Change**: Sets `status = 'CLOCKED_OUT'`, `clockOutTime = timestamp`, calculates final `activeDurationMinutes` and `totalBreakMinutes`, updates `updatedAt`.
- **Event Emitted**: `attendance.clocked_out.v1`.
- **Triggers**: `detectExceptions()`.

#### 5. `detectExceptions(expectedShiftStart?: string, expectedShiftEnd?: string, maxBreakMinutes = 60): AttendanceException[]`
- Evaluates rules:
  - **LATE_ARRIVAL**: `clockInTime` > `expectedShiftStart` (+ threshold).
  - **EARLY_DEPARTURE**: `clockOutTime` < `expectedShiftEnd` (- threshold).
  - **EXCESSIVE_BREAK**: `totalBreakMinutes` > `maxBreakMinutes`.
  - **MISSING_CLOCK_OUT**: Status remains `CLOCKED_IN` or `ON_BREAK` past end of date shift window.
- If new exceptions are detected, appends to `exceptions` and emits `attendance.exception_detected.v1` for each new exception.

---

## 4. Value Object Design

1. **`BreakInterval`**:
   - Encapsulates break timing (`startTime`, `endTime`, `durationMinutes`).
   - Immutable once closed.
2. **`AttendanceDuration`**:
   - Calculates exact active minutes between two ISO 8601 timestamps excluding non-working break minutes.
   - Guarded against negative durations or invalid date strings.
3. **`AttendanceException`**:
   - Reuses value object schema from `contracts.ts` (`exceptionId`, `type`, `severity`, `message`, `resolved`).

---

## 5. Domain Event Design

All events conform to `DomainEventEnvelope<T>` in `events.ts`:

### 5.1 Event Schemas & Payloads

#### 1. `attendance.clocked_in.v1`
```typescript
export interface AttendanceClockedInPayload {
  recordId: string;
  tenantId: string;
  employeeId: string;
  date: string;
  clockInTime: string;
  location?: string;
  metadata?: Record<string, unknown>;
}
```

#### 2. `attendance.clocked_out.v1`
```typescript
export interface AttendanceClockedOutPayload {
  recordId: string;
  tenantId: string;
  employeeId: string;
  date: string;
  clockInTime: string;
  clockOutTime: string;
  activeDurationMinutes: number;
  totalBreakMinutes: number;
  location?: string;
  metadata?: Record<string, unknown>;
}
```

#### 3. `attendance.break_started.v1`
```typescript
export interface AttendanceBreakStartedPayload {
  recordId: string;
  tenantId: string;
  employeeId: string;
  breakId: string;
  startTime: string;
}
```

#### 4. `attendance.break_ended.v1`
```typescript
export interface AttendanceBreakEndedPayload {
  recordId: string;
  tenantId: string;
  employeeId: string;
  breakId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
}
```

#### 5. `attendance.exception_detected.v1`
```typescript
export interface AttendanceExceptionDetectedPayload {
  recordId: string;
  tenantId: string;
  employeeId: string;
  exception: AttendanceException;
}
```

---

## 6. Business Rule Invariants

1. **Multi-Tenant Boundaries**: Every domain method requires or enforces matching `tenantId`. Attempting operations across tenant boundaries throws `DomainError`.
2. **Timestamp Chronology**: `clockOutTime` >= `clockInTime`; break `endTime` >= break `startTime`.
3. **Duration Calculation**:
   $$\text{Active Minutes} = \max\left(0, \left\lfloor \frac{\text{ClockOut} - \text{ClockIn}}{60000} \right\rfloor - \text{Total Break Minutes}\right)$$
4. **Overnight Shifts**: Handled cleanly by computing millisecond deltas between ISO 8601 UTC timestamps rather than parsing local clock hour components.

---

## 7. File Impact Plan

### Files to Create
- `modules/domains/workforce-core/src/attendance.ts`: Defines `AttendanceRecord` Aggregate Root, `BreakInterval`, aggregate state, and methods.
- `modules/domains/workforce-core/tests/attendance.test.ts`: Unit test suite covering all state transitions, duration calculations, exceptions, and event emissions.

### Files to Modify
- `modules/domains/workforce-core/src/events.ts`: Add `AttendanceClockedInPayload`, `AttendanceClockedOutPayload`, `AttendanceBreakStartedPayload`, `AttendanceBreakEndedPayload`, `AttendanceExceptionDetectedPayload`, and factory helper functions.
- `modules/domains/workforce-core/src/index.ts`: Export `AttendanceRecord`, `AttendanceRecordState`, `BreakInterval`, and new event types/helpers.

---

## 8. Testing Strategy

1. **Lifecycle Tests**: `create()`, `clockIn()`, `startBreak()`, `endBreak()`, `clockOut()`, `reconstitute()`.
2. **Invariant Tests**: Rejection of double clock-in, clock-out without clock-in, ending unstarted break, out-of-order timestamps.
3. **Duration Calculation Tests**: Single break, multiple breaks, auto-closed break on clock-out, zero-length break, overnight shift.
4. **Exception Tests**: Late arrival, excessive break, early departure exception emission.
5. **Event Emission Tests**: Verification that domain events are produced with correct payloads and `DomainEventEnvelope` envelope parameters.

---

## 9. Design Risks & Mitigation

- **Risk**: Clock-out while on break could leave floating break intervals.
  - **Mitigation**: `clockOut()` explicitly checks for open breaks and auto-closes them using the clock-out timestamp before finalizing duration.
- **Risk**: Negative duration calculation due to clock drift or manual corrections.
  - **Mitigation**: Math bounds check `Math.max(0, ...)` and strict timestamp validation.
