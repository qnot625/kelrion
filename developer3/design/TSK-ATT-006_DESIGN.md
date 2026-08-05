# Engineering Design Specification: TSK-ATT-006 — Real-time Clock-In / Clock-Out UI Widget & Local Queue Sync

**Task ID**: TSK-ATT-006  
**Task Name**: Real-time Clock-In / Clock-Out UI Widget & Local Queue Sync  
**Milestone**: Milestone 9 — Attendance UI & Clock Controls  
**Developer**: Developer 3 (Workforce Core, Employee Master Records, Time & Attendance)  
**Date**: 2026-08-03  
**Status**: DESIGN PHASE (PENDING IMPLEMENTATION AUTHORIZATION)  

---

## Executive Summary

Task TSK-ATT-006 delivers a production-grade, highly responsive, real-time Clock-In / Clock-Out UI widget and offline local queue sync engine for the Klerion workforce application. Built as an extensible client-side module in `apps/web`, this design bridges end-user workforce clocking actions with the high-concurrency backend services established in TSK-ATT-001 through TSK-ATT-005 (`/attendance/clock-in`, `/attendance/clock-out`, `/attendance/break-start`, `/attendance/break-end`, and `/attendance/sync`).

The solution incorporates real-time clock state visualization (`CLOCKED_OUT`, `CLOCKED_IN`, `ON_BREAK`), live second-by-second shift/break timers, deterministic client-side idempotency generation, a robust `localStorage`-backed offline queue with FIFO replay, exponential retry policies, and real-time connectivity feedback.

---

## 1. Repository Analysis Findings (Phase 1)

### 1.1 Frontend Architecture (`apps/web`)
- **Framework & Styling**: React 18 SPA with Vite, TypeScript, and standard Tailwind CSS utility styling.
- **Layout Shell (`src/components/Shell.tsx`)**: Renders top navigation, mobile drawer, profile menu, and live workspace connectivity status (`apiReachable`).
- **State & Session (`src/lib/session.ts`)**: Persists session in `localStorage` under `klerion_session`. `KlerionSession` contains `{ mode, tenantSlug, tenantName, email, userId, roles, token }`.
- **API Client (`src/lib/api.ts`)**: Encapsulates `KlerionApi` class for `/health`, `/auth/*`, `/employees/*`, `/users/*`, `/appointments/*`, and `/audit-events`. Currently requires extension to expose attendance REST endpoints.

### 1.2 Backend Interface Audit (ATT-003, ATT-004, ATT-005)
The backend routes in `apps/api/src/routes/attendance.ts` and `attendance-corrections.ts` expose the following contracts:
1. `POST /attendance/clock-in`: Accepts `{ employeeId, workDate?, timestamp?, idempotencyKey?, source?, location?, notes? }`. Requires `attendance:clock`. Returns `201 Created` with `{ message, record, summary }`.
2. `POST /attendance/clock-out`: Accepts `{ employeeId, workDate?, timestamp?, idempotencyKey?, source?, location?, notes? }`. Requires `attendance:clock`. Returns `200 OK`.
3. `POST /attendance/break-start`: Accepts `{ employeeId, workDate?, timestamp?, idempotencyKey?, source?, location?, notes? }`. Requires `attendance:clock`. Returns `200 OK`.
4. `POST /attendance/break-end`: Accepts `{ employeeId, workDate?, timestamp?, idempotencyKey?, source?, location?, notes? }`. Requires `attendance:clock`. Returns `200 OK`.
5. `POST /attendance/sync`: Accepts `{ batchId?, submittedAt?, deviceId?, events: AttendanceSyncItem[] }`. Requires `attendance:sync`. Returns `200/207/400` with `AttendanceBatchResult`.
6. `GET /attendance/employee/:employeeId`: Returns active record & summary for `workDate`. Requires `attendance:read`.
7. `GET /attendance/summary`: Returns attendance summaries with range filtering. Requires `attendance:read`.

### 1.3 Offline Capabilities & Queue Gap
- The frontend currently tracks connectivity status via `klerionApi.health()`.
- No client-side persistent event queue exists. If an employee clocks in while offline or suffering network degradation, the request fails unless an offline queue traps the intent and replays it when connection is restored.

---

## 2. Engineering Architecture & Component Design (Phase 2)

### 2.1 UI Component Architecture

```
apps/web/src/
├── components/
│   ├── attendance/
│   │   ├── ClockWidget.tsx              # Primary real-time clock widget container
│   │   ├── AttendanceStatusCard.tsx     # Current state badge, employee info & work date
│   │   ├── AttendanceTimer.tsx          # Live ticking second-by-second shift/break timer
│   │   ├── ClockControls.tsx            # Clock In, Clock Out, Break Start/End action buttons
│   │   ├── OfflineQueueBadge.tsx        # Pending queue counter & connection status chip
│   │   ├── SyncStatusIndicator.tsx      # Real-time sync feedback (Synced, Syncing, Error)
│   │   └── QueueHistoryPanel.tsx        # Collapsible drawer/modal showing queued offline items
├── hooks/
│   ├── useAttendance.ts                 # High-level attendance state management hook
│   ├── useAttendanceSync.ts             # Offline queue replay & network listener hook
│   ├── useOfflineQueue.ts               # Low-level localStorage queue CRUD operations
│   └── useClock.ts                      # Ticking timer hook (1000ms interval)
└── lib/
    ├── attendance-queue.ts              # Queue persistence manager & idempotency builder
    └── api.ts                           # Extended KlerionApi with attendance methods
```

### 2.2 Component Specifications

#### 1. `ClockWidget.tsx`
- **Responsibility**: Top-level UI container mounted in `DashboardView` and available via quick-actions in `Shell.tsx`.
- **Sub-components**: Renders `AttendanceStatusCard`, `AttendanceTimer`, `ClockControls`, `SyncStatusIndicator`, and `OfflineQueueBadge`.
- **States**: Handles loading, active state (`CLOCKED_OUT`, `CLOCKED_IN`, `ON_BREAK`), offline mode, and error banners.

#### 2. `AttendanceStatusCard.tsx`
- **Visuals**: Modern Tailwind card displaying active status badge with color coding:
  - `CLOCKED_OUT`: Slate / Neutral badge ("Not Clocked In")
  - `CLOCKED_IN`: Emerald badge ("Clocked In · Working")
  - `ON_BREAK`: Amber badge ("On Break")
- **Metadata**: Shows current work date, shift start timestamp, last activity time, and location tag if captured.

#### 3. `AttendanceTimer.tsx`
- **Timer Modes**:
  - `Working Time`: Calculates `now - clockInTime - totalBreakTime` in `HH:MM:SS`.
  - `Break Time`: Calculates `now - currentBreakStart` in `MM:SS`.
- **Performance**: Powered by `useClock()`, updating DOM state without memory leaks or drift.

#### 4. `ClockControls.tsx`
- **Button Lifecycle**:
  - When `CLOCKED_OUT`: Primary action `Clock In`.
  - When `CLOCKED_IN`: Secondary action `Start Break`, Primary action `Clock Out`.
  - When `ON_BREAK`: Primary action `End Break`.
- **Interaction Feedback**: Disables controls during active API calls or queue insertion. Provides tactile visual loading spinners.

#### 5. `OfflineQueueBadge.tsx` & `SyncStatusIndicator.tsx`
- **Network Badge**: Displays `Online` (Emerald dot) or `Offline (Queueing)` (Amber dot).
- **Queue Count**: Displays number of pending offline items (e.g., `3 pending syncs`). Clicking opens `QueueHistoryPanel`.
- **Manual Retry**: Button to force immediate sync replay when online.

---

## 3. Local Offline Queue Architecture (`attendance-queue.ts`)

### 3.1 Data Schema

```typescript
export interface QueuedAttendanceItem {
  readonly id: string; // Unique client UUID
  readonly eventId: string; // Unique event ID
  readonly tenantId: string;
  readonly employeeId: string;
  readonly eventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  readonly timestamp: string; // ISO-8601 recorded at button click
  readonly workDate: string; // YYYY-MM-DD
  readonly idempotencyKey: string; // Deterministic string
  readonly source: "web";
  readonly location?: { latitude: number; longitude: number; accuracy?: number } | null;
  readonly notes?: string;
  readonly createdAt: string;
  readonly attempts: number;
  readonly lastAttemptAt?: string;
  readonly status: "pending" | "syncing" | "failed";
  readonly error?: string;
}
```

### 3.2 Idempotency Key Generation Algorithm
To guarantee zero duplicate submissions regardless of network re-transmissions:
```typescript
export function generateIdempotencyKey(
  employeeId: string,
  eventType: string,
  timestamp: string,
): string {
  const timeMs = new Date(timestamp).getTime();
  return `clk_${eventType}_${employeeId}_${timeMs}`;
}
```

### 3.3 Storage & Queue Invariants
1. **Persistence Target**: `localStorage` key `klerion_attendance_queue_${tenantSlug}_${employeeId}`.
2. **FIFO Queue Ordering**: Items are strictly sorted by `timestamp` chronologically before replay to maintain domain state transition validity (`CLOCKED_OUT` -> `CLOCKED_IN` -> `ON_BREAK` -> `CLOCKED_IN` -> `CLOCKED_OUT`).
3. **Queue Replay Mechanics**:
   - Replay is triggered automatically on `window.addEventListener("online", ...)` or when `apiReachable` flips to `true`.
   - Sends items in batch via `POST /attendance/sync`.
   - Removes successfully processed (`status === "processed"`) or duplicate (`status === "duplicate"`) items.
   - Retains failed items with error flags for user inspection or manual retry.

---

## 4. UI State Transition Matrix

| Current UI State | Action Triggered | Target State | Network Direct Call | Offline Behavior |
| :--- | :--- | :--- | :--- | :--- |
| `CLOCKED_OUT` | Click "Clock In" | `CLOCKED_IN` | `POST /attendance/clock-in` | Enqueue `clock_in` event, update local UI state optimistically |
| `CLOCKED_IN` | Click "Start Break" | `ON_BREAK` | `POST /attendance/break-start` | Enqueue `break_start` event, update local UI state optimistically |
| `ON_BREAK` | Click "End Break" | `CLOCKED_IN` | `POST /attendance/break-end` | Enqueue `break_end` event, update local UI state optimistically |
| `CLOCKED_IN` | Click "Clock Out" | `CLOCKED_OUT` | `POST /attendance/clock-out` | Enqueue `clock_out` event, update local UI state optimistically |

---

## 5. API Contract & Integration Audit

### 5.1 Backend Endpoint Compatibility
- **`POST /attendance/clock-in`**: Compatible. Frontend will send `{ employeeId, workDate, timestamp, idempotencyKey, source: "web" }`.
- **`POST /attendance/clock-out`**: Compatible.
- **`POST /attendance/break-start`**: Compatible.
- **`POST /attendance/break-end`**: Compatible.
- **`POST /attendance/sync`**: Compatible. Frontend sends queued items matching `AttendanceSyncItem` contract.

### 5.2 System Multi-Tenant & RBAC Isolation
- All API calls propagate `Authorization: Bearer <token>` and `X-Tenant-Slug: <tenantSlug>`.
- Client-side queues are keyed per tenant (`klerion_attendance_queue_${tenantSlug}_${employeeId}`), preventing cross-tenant event leakage on shared browsers.

---

## 6. Verification & Test Plan Strategy

When implementation is authorized, testing will cover:
1. **Unit Tests (`apps/web/tests/attendance-queue.test.ts`)**:
   - Queue addition, FIFO sorting, idempotency key uniqueness, localStorage persistence, item removal on sync success.
2. **Hook Tests (`apps/web/tests/useAttendance.test.ts`)**:
   - Real-time timer calculations, status state transitions, online/offline fallback switching.
3. **Component Integration Tests (`apps/web/tests/ClockWidget.test.ts`)**:
   - Rendering state badges, button toggle logic, offline queue badge updates, manual sync trigger.

---

## 7. Target File Modifications & Creations Summary

### Files to be Created (during Implementation Phase):
- `apps/web/src/lib/attendance-queue.ts`
- `apps/web/src/hooks/useAttendance.ts`
- `apps/web/src/hooks/useAttendanceSync.ts`
- `apps/web/src/hooks/useOfflineQueue.ts`
- `apps/web/src/hooks/useClock.ts`
- `apps/web/src/components/attendance/ClockWidget.tsx`
- `apps/web/src/components/attendance/AttendanceStatusCard.tsx`
- `apps/web/src/components/attendance/AttendanceTimer.tsx`
- `apps/web/src/components/attendance/ClockControls.tsx`
- `apps/web/src/components/attendance/OfflineQueueBadge.tsx`
- `apps/web/src/components/attendance/SyncStatusIndicator.tsx`
- `apps/web/src/components/attendance/QueueHistoryPanel.tsx`
- `apps/web/tests/attendance-widget.test.ts`

### Files to be Modified (during Implementation Phase):
- `apps/web/src/lib/api.ts` (Add attendance API methods)
- `apps/web/src/views/DashboardView.tsx` (Embed ClockWidget)
- `apps/web/src/components/Shell.tsx` (Add attendance quick indicator)

---

## Conclusion & Implementation Readiness

This design specification provides a robust, zero-regression roadmap for building the real-time clock widget and offline queue sync engine. Production files remain completely untouched during this design phase.

**Implementation Readiness**: READY FOR AUTHORIZATION.
