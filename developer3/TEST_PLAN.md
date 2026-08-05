# Developer 3 Master Test Plan & Quality Assurance Strategy

This document defines the complete testing specification for Developer 3. Every business invariant, aggregate rule, repository query, API endpoint, and UI component owned by Developer 3 must be validated against these test cases.

---

## 1. Unit Testing Specifications

### 1.1 Employee Domain Unit Tests (`employee.spec.ts`)

#### Test Case UT-EMP-001: Unique Employee Number Validation
- **Purpose**: Verify that an employee cannot be created or updated with a duplicate employee number within the same tenant.
- **Expected Behaviour**: Domain service rejects creation and throws `DuplicateEmployeeNumberError`.
- **Pass Criteria**: Error thrown with message containing duplicate number.
- **Fail Criteria**: Employee created or duplicate silently ignored.

#### Test Case UT-EMP-002: Email Address Formatting Validation
- **Purpose**: Validate email format during employee instantiation.
- **Expected Behaviour**: Rejects malformed email strings (e.g. `john.doe@invalid`).
- **Pass Criteria**: Invalid string rejected with `InvalidEmailError`.
- **Fail Criteria**: Malformed email accepted into domain model.

#### Test Case UT-EMP-003: Self-Manager Assignment Prevention
- **Purpose**: Ensure an employee cannot be set as their own manager.
- **Expected Behaviour**: Domain entity throws `SelfManagerError` when `managerId === id`.
- **Pass Criteria**: Domain exception thrown immediately.
- **Fail Criteria**: Employee assigned to self as manager.

#### Test Case UT-EMP-004: Circular Reporting Hierarchy Detection
- **Purpose**: Detect and prevent reporting loops (e.g., A reports to B, B reports to C, C reports to A).
- **Expected Behaviour**: Graph traversal detects loop and throws `CircularHierarchyError`.
- **Pass Criteria**: Exception thrown before updating placement state.
- **Fail Criteria**: Cyclic manager assignment allowed into model state.

#### Test Case UT-EMP-005: Employment Status Transition Governance
- **Purpose**: Restrict illegal status transitions (e.g., Terminated -> Active without formal re-hire).
- **Expected Behaviour**: Invalid state transitions throw `InvalidStatusTransitionError`.
- **Pass Criteria**: Enforces valid state machine transitions.
- **Fail Criteria**: Direct transition from Terminated to Active permitted.

---

### 1.2 Attendance Domain Unit Tests (`attendance.spec.ts`)

#### Test Case UT-ATT-001: Offline Event Idempotency Key De-duplication
- **Purpose**: Ensure identical events submitted twice with the same `idempotencyKey` process exactly once.
- **Expected Behaviour**: Second event is skipped and marked as duplicate without error.
- **Pass Criteria**: Single `AttendanceEvent` saved; aggregate state updated once.
- **Fail Criteria**: Multiple duplicate events stored or secondary event causes crash.

#### Test Case UT-ATT-002: Clock-Out Without Active Clock-In Rejection
- **Purpose**: Enforce requirement that an employee must be clocked in before clocking out.
- **Expected Behaviour**: Event handler flags `NO_ACTIVE_CLOCK_IN` exception.
- **Pass Criteria**: Event saved with exception flag; state remains un-clocked out.
- **Fail Criteria**: Clock-out event successfully closes nonexistent clock-in session.

#### Test Case UT-ATT-003: Break Event Sequencing Validation
- **Purpose**: Ensure `BREAK_START` occurs after `CLOCK_IN` and `BREAK_END` occurs after `BREAK_START`.
- **Expected Behaviour**: Out-of-sequence break events flag exception.
- **Pass Criteria**: Invalid break sequence flagged; break duration calculation safely handled.
- **Fail Criteria**: Negative break minutes computed.

#### Test Case UT-ATT-004: Overnight Shift Calculation Accuracy
- **Purpose**: Validate duration calculation when a clock-in occurs at 22:00 and clock-out at 06:00 next day.
- **Expected Behaviour**: Computes 480 total work minutes spanning midnight.
- **Pass Criteria**: `totalWorkMinutes === 480`.
- **Fail Criteria**: Negative work minutes calculated or date boundary failure.

#### Test Case UT-ATT-005: Missing Clock-Out Detection Rule
- **Purpose**: Automatically flag daily summary if employee clocks in but does not clock out within 14 hours.
- **Expected Behaviour**: Daily summary rollup status marked as `MISSING_CLOCK_OUT`.
- **Pass Criteria**: Exception added to `AttendanceSummary`.
- **Fail Criteria**: Session remains open indefinitely without exception flag.

---

## 2. Repository Testing Specifications (`repository.spec.ts`)

#### Test Case RT-WFC-001: Multi-Tenant Data Isolation
- **Purpose**: Ensure queries executing under Tenant A never return records belonging to Tenant B.
- **Expected Behaviour**: Repository methods strictly append `WHERE tenant_id = tenantA`.
- **Pass Criteria**: Tenant B employees remain invisible to Tenant A repository instance.
- **Fail Criteria**: Cross-tenant data leak occurs.

#### Test Case RT-WFC-002: Optimistic Concurrency Control
- **Purpose**: Verify concurrent updates to employee placement fail gracefully when version mismatch occurs.
- **Expected Behaviour**: Throw `OptimisticLockError` if row version has changed.
- **Pass Criteria**: Second concurrent write rejected.
- **Fail Criteria**: Silent overwrite of newer data.

---

## 3. API Integration Testing Specifications (`api.spec.ts`)

#### Test Case API-EMP-001: RBAC Permission Enforcement on `/api/v1/employees`
- **Purpose**: Verify non-authorized users cannot access employee endpoints.
- **Expected Behaviour**: Requests without `employees:read` return `403 Forbidden`.
- **Pass Criteria**: Response status `403` with JSON error details.
- **Fail Criteria**: Unauthenticated or unauthorized user receives `200 OK`.

#### Test Case API-ATT-001: Offline Batch Event Sync Endpoint Validation
- **Purpose**: Test `/api/v1/attendance/sync` with batch payload containing 5 events.
- **Expected Behaviour**: Returns `200 OK` with detailed sync result array.
- **Pass Criteria**: All 5 items processed; duplicates correctly flagged in report.
- **Fail Criteria**: Partial batch failure crashes entire endpoint without response.

---

## 4. Frontend Component & Integration Testing (`ui.spec.ts`)

#### Test Case UI-CLK-001: Clock-In Widget Real-time State & Local Storage Sync
- **Purpose**: Verify punch button switches to "Clock Out" and stores event locally when offline.
- **Expected Behaviour**: Widget updates state instantly; queues payload in `localStorage` if network fails.
- **Pass Criteria**: Punch stored locally; synced automatically when network recovers.
- **Fail Criteria**: UI freezes on network disconnect.

#### Test Case UI-EMP-001: Employee Directory Filtering & Search
- **Purpose**: Test client directory filtering by department name and status.
- **Expected Behaviour**: List updates dynamically without full page refresh.
- **Pass Criteria**: Correct filtered results rendered; empty state shown when no matches found.
- **Fail Criteria**: Unfiltered list displayed or incorrect state rendering.
