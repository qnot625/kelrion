# Engineering Design Specification: TSK-ATT-007 — Attendance Timesheets & Manager Review UI

**Task ID**: TSK-ATT-007  
**Task Name**: Attendance Timesheets & Manager Review UI  
**Milestone**: Milestone 9 — Attendance UI & Clock Controls  
**Developer**: Developer 3 (Workforce Core, Employee Master Records, Time & Attendance)  
**Date**: 2026-08-03  
**Status**: DESIGN COMPLETE — AWAITING PHASE 4 REVIEW & AUTHORIZATION  

---

## 1. Executive Summary & Purpose

Task **TSK-ATT-007** is the final component of Milestone 9 ("Attendance UI & Clock Controls"). It delivers a comprehensive, production-grade frontend workspace for employee time tracking, historical timesheet inspection, date-range summaries, and manager review of attendance correction requests.

Building directly upon the REST API infrastructure delivered in **TSK-ATT-004** and the Attendance Correction Workflow API delivered in **TSK-ATT-005**, as well as the real-time clock widget created in **TSK-ATT-006**, this workspace empowers:
1. **Employees** to view their weekly/monthly timesheets, inspect raw clock events, view calculated worked and break durations, and request time corrections for missed or inaccurate clock punches.
2. **Managers & HR Administrators** to review pending correction requests in a centralized inbox, inspect rationale and requested timestamps, approve or reject requests with review notes, view team-wide timesheet summaries, and monitor workforce attendance metrics.

All frontend components adhere strictly to Klerion's design language, multi-tenant isolation rules, role-based access control (RBAC), and clean React state management patterns.

---

## 2. Phase 1 — Repository Analysis Findings

### 2.1 Frontend Architecture Audit
- **Views**: `apps/web/src/views/` contains existing top-level workspace views (`DashboardView`, `EmployeeDirectoryView`, `AuditView`, etc.). We will create `AttendanceTimesheetView.tsx` to serve as the main timesheet and manager review hub, registered under the `"timesheets"` route in `App.tsx` and `Shell.tsx`.
- **Components**: `apps/web/src/components/attendance/` houses `ClockWidget.tsx` and its supporting components from ATT-006. We will expand this directory with modular, single-responsibility timesheet and review components.
- **API Client**: `apps/web/src/lib/api.ts` currently defines `KlerionApi` with methods for authentication, employees, users, and basic attendance clocking (`clockIn`, `clockOut`, `startBreak`, `endBreak`, `getEmployeeAttendance`, `syncAttendance`). We will extend `KlerionApi` with typed methods for listing attendance summaries and managing attendance corrections (`listAttendanceSummaries`, `listAttendanceCorrections`, `createAttendanceCorrection`, `approveAttendanceCorrection`, `rejectAttendanceCorrection`).

### 2.2 Existing Backend Capability Audit
- **Attendance Summaries**: `GET /attendance/summary` supports `startDate`, `endDate`, and `employeeId` query parameters.
- **Attendance Records**: `GET /attendance/employee/:employeeId?workDate=YYYY-MM-DD` returns detailed record events.
- **Correction Request Management**: `POST /attendance/corrections` (create request), `GET /attendance/corrections` (list requests by `status` and `employeeId`), `POST /attendance/corrections/:id/approve` (approve & apply to attendance record), `POST /attendance/corrections/:id/reject` (reject with rationale).
- **Conclusion**: **100% of required backend capabilities are already fully built and verified in ATT-004 and ATT-005.** No new backend endpoints or database schema changes are required.

### 2.3 UI & Design System Audit
- **Aesthetic**: Slate/Zinc panel containers (`panel`, `view-heading`), high contrast borders (`border-slate-800`), refined status chips (`CLOCKED_IN` -> Emerald, `ON_BREAK` -> Amber, `CLOCKED_OUT` -> Slate, `PENDING` -> Amber pulse, `APPROVED` -> Emerald, `REJECTED` -> Rose).
- **Icons**: `lucide-react` icons (`Calendar`, `Clock`, `CheckCircle2`, `XCircle`, `AlertTriangle`, `FileText`, `Filter`, `Search`, `User`, `UserCheck`, `RefreshCw`, `Plus`).

---

## 3. Component Architecture & Hierarchy Design

```
apps/web/src/views/AttendanceTimesheetView.tsx
├── AttendanceSummaryHeader.tsx
│   ├── Total Worked Hours Metric Card
│   ├── Total Break Hours Metric Card
│   ├── Pending Correction Requests Metric Card
│   └── Active Employees Metric Card
├── TimesheetFilters.tsx
│   ├── Active Tab Switcher ("My Timesheet" | "Team Timesheets" | "Correction Requests Inbox")
│   ├── Date Range Selector (Start Date / End Date)
│   ├── Employee Search / Dropdown Filter
│   ├── Status Filter Dropdown
│   └── Refresh Button
├── TimesheetTable.tsx
│   ├── Table Header (Employee, Work Date, Clock In, Clock Out, Break Mins, Total Worked, Status, Actions)
│   ├── Table Rows (Daily Summary & Status Badges)
│   ├── Expanded Row Detail (DailyAttendanceCard.tsx)
│   └── Pagination Controls
├── ManagerReviewPanel.tsx
│   ├── Pending Request Cards & Accordion
│   ├── Requested vs Actual Event Comparison
│   ├── Review Rationale & Review Notes Input
│   └── Approve / Reject Buttons with Spinner Feedback
├── ApprovalHistoryPanel.tsx
│   └── Audit Trail Table of Resolved Correction Requests (Approved / Rejected)
└── CorrectionRequestDrawer.tsx
    ├── Modal Backdrop & Slide-over Drawer
    ├── Target Work Date & Optional Event Selector
    ├── Requested Event Type Dropdown (Clock In, Clock Out, Break Start, Break End)
    ├── Requested Timestamp Input (ISO Local Date-Time)
    ├── Mandatory Reason Textarea
    └── Submit Request Button with Validation Errors
```

---

## 4. Custom Hooks Design

### 4.1 `useAttendanceTimesheets`
- **Location**: `apps/web/src/hooks/useAttendanceTimesheets.ts`
- **Responsibilities**: Fetches daily attendance summaries across date ranges, manages filtering (employee ID, start/end dates), handles loading/error states, and calculates aggregate metrics (total work hours, total break hours).
- **Inputs**: `{ session: KlerionSession; initialStartDate?: string; initialEndDate?: string; initialEmployeeId?: string }`
- **Outputs**:
  - `summaries: ApiAttendanceSummary[]`
  - `totalHours: number`
  - `totalBreakHours: number`
  - `loading: boolean`
  - `error: string | null`
  - `startDate: string`, `setStartDate: (date: string) => void`
  - `endDate: string`, `setEndDate: (date: string) => void`
  - `employeeId: string`, `setEmployeeId: (id: string) => void`
  - `refetch: () => Promise<void>`

### 4.2 `useAttendanceCorrections`
- **Location**: `apps/web/src/hooks/useAttendanceCorrections.ts`
- **Responsibilities**: Fetches pending and historical attendance correction requests, handles request submission, handles manager approval and rejection actions with optimistic UI updates.
- **Inputs**: `{ session: KlerionSession; initialStatus?: "pending" | "approved" | "rejected" }`
- **Outputs**:
  - `corrections: ApiAttendanceCorrection[]`
  - `pendingCount: number`
  - `loading: boolean`
  - `submitting: boolean`
  - `actionLoadingId: string | null`
  - `error: string | null`
  - `submitCorrection: (payload: CreateCorrectionPayload) => Promise<boolean>`
  - `approveCorrection: (id: string, notes?: string) => Promise<boolean>`
  - `rejectCorrection: (id: string, notes?: string) => Promise<boolean>`
  - `refetch: () => Promise<void>`

---

## 5. API Integration & Client Extensions

We will extend `apps/web/src/lib/api.ts` with the following TypeScript interfaces and methods:

```typescript
export interface ApiAttendanceCorrection {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly targetEventId?: string | null;
  readonly requestedEventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  readonly requestedTimestamp: string;
  readonly reason: string;
  readonly status: "pending" | "approved" | "rejected";
  readonly reviewedByUserId?: string | null;
  readonly reviewedAt?: string | null;
  readonly reviewNotes?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListCorrectionsParams {
  employeeId?: string;
  status?: "pending" | "approved" | "rejected";
  limit?: number;
  offset?: number;
}

export interface ListCorrectionsResponse {
  readonly corrections: readonly ApiAttendanceCorrection[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// KlerionApi Extensions:
async listAttendanceSummaries(
  session: KlerionSession,
  params: { startDate?: string; endDate?: string; employeeId?: string }
): Promise<{ summaries: ApiAttendanceSummary[]; count: number }>;

async listAttendanceCorrections(
  session: KlerionSession,
  params: ListCorrectionsParams = {}
): Promise<ListCorrectionsResponse>;

async createAttendanceCorrection(
  session: KlerionSession,
  payload: {
    employeeId: string;
    targetEventId?: string;
    requestedEventType: "clock_in" | "clock_out" | "break_start" | "break_end";
    requestedTimestamp: string;
    reason: string;
  }
): Promise<{ message: string; correction: ApiAttendanceCorrection }>;

async approveAttendanceCorrection(
  session: KlerionSession,
  id: string,
  reviewNotes?: string
): Promise<{ message: string; correction: ApiAttendanceCorrection; attendanceRecord: ApiAttendanceRecord }>;

async rejectAttendanceCorrection(
  session: KlerionSession,
  id: string,
  reviewNotes?: string
): Promise<{ message: string; correction: ApiAttendanceCorrection }>;
```

---

## 6. UI Behaviour & Interactive Workflows

1. **Tab Navigation**:
   - **My Timesheet**: Displays personal daily attendance records for the active date range. Shows clock-in/out times, break durations, calculated total hours, and a button to request a correction for missing/inaccurate events.
   - **Team Timesheets** (Managers/Admins only): Displays multi-employee attendance table with employee filter, search input, and summary aggregation metrics.
   - **Correction Requests Inbox**: Manager review dashboard displaying all pending correction requests across the organization with target vs requested time diffs, rationale, and quick Approve / Reject controls.
2. **Correction Request Drawer**:
   - Interactive slide-over modal triggered by clicking "Request Correction".
   - Form fields: Work Date, Event Type (`Clock In`, `Clock Out`, `Break Start`, `Break End`), Requested ISO Date-Time picker, and mandatory Reason text box.
   - Validates client-side before submission; provides inline error messaging and success toast confirmation.
3. **Manager Approval / Rejection Workflow**:
   - Manager reviews request card in the inbox panel.
   - Optional text area for review notes.
   - Clicking "Approve" fires `POST /attendance/corrections/:id/approve`, updating the status to `approved`, auto-updating the attendance record, and removing the item from the pending list.
   - Clicking "Reject" fires `POST /attendance/corrections/:id/reject`, updating the status to `rejected`, and refreshing the view.

---

## 7. Accessibility & Responsive Layout Strategy

- **Accessibility**:
  - WAI-ARIA compliant dialog modal (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
  - Screen reader friendly status badges (`aria-label="Status: Clocked In"`).
  - Keyboard shortcut support (ESC to close drawer).
- **Responsive Design**:
  - Desktop (`lg:`, `xl:`): High-density data table with side-by-side metric cards and inline action buttons.
  - Tablet (`md:`): Scrollable data table with stacked header controls.
  - Mobile (`sm:`): Card-based responsive list view substituting table rows, compact summary header, full-screen correction request modal.

---

## 8. Testing Strategy

We will build an automated test suite in `apps/web/tests/attendance-timesheets.test.ts`:
1. **Summary & Filtering Tests**: Verify date range filtering, employee ID filtering, and total worked/break hour calculations.
2. **Correction Drawer Form Validation**: Verify mandatory field validation (reason, valid ISO timestamp, event type).
3. **Manager Review & Approval Flow**: Test optimistic status updates, payload structure for approve/reject API calls, and audit trail record creation.
4. **RBAC Permission Guards**: Confirm manager inbox tabs and approval controls are conditionally displayed based on user role (`owner`, `admin`, `manager`).

---

## 9. Planned File Changes for Implementation (Phase 5)

### Files to Create:
1. `apps/web/src/views/AttendanceTimesheetView.tsx`
2. `apps/web/src/components/attendance/AttendanceSummaryHeader.tsx`
3. `apps/web/src/components/attendance/TimesheetFilters.tsx`
4. `apps/web/src/components/attendance/TimesheetTable.tsx`
5. `apps/web/src/components/attendance/DailyAttendanceCard.tsx`
6. `apps/web/src/components/attendance/ManagerReviewPanel.tsx`
7. `apps/web/src/components/attendance/ApprovalHistoryPanel.tsx`
8. `apps/web/src/components/attendance/CorrectionRequestDrawer.tsx`
9. `apps/web/src/hooks/useAttendanceTimesheets.ts`
10. `apps/web/src/hooks/useAttendanceCorrections.ts`
11. `apps/web/src/hooks/useManagerReview.ts`
12. `apps/web/tests/attendance-timesheets.test.ts`
13. `developer3/design/TSK-ATT-007_DESIGN.md`
14. `developer3/design/TSK-ATT-007_DESIGN_REVIEW.md`

### Files to Modify:
1. `apps/web/src/lib/api.ts` (Extend `KlerionApi` with attendance correction & summary methods)
2. `apps/web/src/components/Shell.tsx` (Add `"timesheets"` navigation item)
3. `apps/web/src/App.tsx` (Wire `"timesheets"` route to `AttendanceTimesheetView`)

---

**Status**: DESIGN COMPLETE — AWAITING PHASE 4 REVIEW & AUTHORIZATION
