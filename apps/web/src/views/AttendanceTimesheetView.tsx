import { AlertCircle, Clock } from "lucide-react";
import { useState } from "react";
import { ApprovalHistoryPanel } from "../components/attendance/ApprovalHistoryPanel";
import { AttendanceSummaryHeader } from "../components/attendance/AttendanceSummaryHeader";
import { CorrectionRequestDrawer } from "../components/attendance/CorrectionRequestDrawer";
import { ManagerReviewPanel } from "../components/attendance/ManagerReviewPanel";
import { TimesheetFilters } from "../components/attendance/TimesheetFilters";
import { TimesheetTable } from "../components/attendance/TimesheetTable";
import { useAttendanceCorrections } from "../hooks/useAttendanceCorrections";
import { useAttendanceTimesheets } from "../hooks/useAttendanceTimesheets";
import { useManagerReview } from "../hooks/useManagerReview";
import type { ApiAttendanceSummary } from "../lib/api";
import type { KlerionSession } from "../lib/session";

export interface AttendanceTimesheetViewProps {
  readonly session: KlerionSession;
}

export function AttendanceTimesheetView({ session }: AttendanceTimesheetViewProps) {
  const [activeTab, setActiveTab] = useState<"my" | "team" | "inbox">("my");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [targetSummary, setTargetSummary] = useState<ApiAttendanceSummary | null>(null);

  const timesheets = useAttendanceTimesheets({ session });
  const corrections = useAttendanceCorrections(session);
  const managerReview = useManagerReview(session);

  const handleOpenDrawer = (summary: ApiAttendanceSummary) => {
    setTargetSummary(summary);
    setDrawerOpen(true);
  };

  const handleRefresh = async () => {
    await Promise.all([
      timesheets.refetch(),
      corrections.refetch(),
      managerReview.isManager ? managerReview.refetch() : Promise.resolve(),
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="view-heading">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Clock className="text-indigo-400" size={24} />
            Time & Attendance Workspace
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Review employee time logs, date-range work summaries, and manager attendance correction approvals.
          </p>
        </div>
      </div>

      <AttendanceSummaryHeader
        totalWorkedHours={timesheets.totalWorkedHours}
        totalBreakHours={timesheets.totalBreakHours}
        pendingCorrectionsCount={managerReview.pendingCount}
        totalRecordsCount={timesheets.summaries.length}
      />

      <TimesheetFilters
        startDate={timesheets.startDate}
        endDate={timesheets.endDate}
        employeeId={timesheets.employeeId}
        activeTab={activeTab}
        isManager={managerReview.isManager}
        pendingInboxCount={managerReview.pendingCount}
        onStartDateChange={timesheets.setStartDate}
        onEndDateChange={timesheets.setEndDate}
        onEmployeeIdChange={timesheets.setEmployeeId}
        onTabChange={setActiveTab}
        onRefresh={handleRefresh}
        loading={timesheets.loading || managerReview.loading}
      />

      {(timesheets.error || managerReview.error || corrections.error) && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
          <AlertCircle size={16} />
          <span>{timesheets.error || managerReview.error || corrections.error}</span>
        </div>
      )}

      {activeTab === "inbox" && managerReview.isManager ? (
        <div className="space-y-6">
          <ManagerReviewPanel
            pendingRequests={managerReview.pendingRequests}
            loading={managerReview.loading}
            actionLoadingId={managerReview.actionLoadingId}
            onApprove={managerReview.approveCorrection}
            onReject={managerReview.rejectCorrection}
          />
          <ApprovalHistoryPanel resolvedRequests={managerReview.resolvedRequests} />
        </div>
      ) : (
        <TimesheetTable
          summaries={timesheets.summaries}
          loading={timesheets.loading}
          onRequestCorrection={handleOpenDrawer}
        />
      )}

      <CorrectionRequestDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        targetSummary={targetSummary}
        onSubmit={corrections.submitCorrection}
        submitting={corrections.submitting}
      />
    </div>
  );
}
