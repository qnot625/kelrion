import { Calendar, RefreshCw, Search } from "lucide-react";

export interface TimesheetFiltersProps {
  readonly startDate: string;
  readonly endDate: string;
  readonly employeeId: string;
  readonly activeTab: "my" | "team" | "inbox";
  readonly isManager: boolean;
  readonly pendingInboxCount: number;
  readonly onStartDateChange: (date: string) => void;
  readonly onEndDateChange: (date: string) => void;
  readonly onEmployeeIdChange: (id: string) => void;
  readonly onTabChange: (tab: "my" | "team" | "inbox") => void;
  readonly onRefresh: () => void;
  readonly loading?: boolean;
}

export function TimesheetFilters({
  startDate,
  endDate,
  employeeId,
  activeTab,
  isManager,
  pendingInboxCount,
  onStartDateChange,
  onEndDateChange,
  onEmployeeIdChange,
  onTabChange,
  onRefresh,
  loading = false,
}: TimesheetFiltersProps) {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "my"
                ? "bg-indigo-600 text-white"
                : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
            }`}
            onClick={() => onTabChange("my")}
          >
            My Timesheet
          </button>
          {isManager && (
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "team"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => onTabChange("team")}
            >
              Team Timesheets
            </button>
          )}
          {isManager && (
            <button
              type="button"
              className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "inbox"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => onTabChange("inbox")}
            >
              Manager Review Inbox
              {pendingInboxCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-rose-500 text-white rounded-full">
                  {pendingInboxCount}
                </span>
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {activeTab !== "inbox" && (
        <div className="flex flex-wrap items-center gap-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-400">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            />
            <span className="text-slate-500 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {activeTab === "team" && (
            <div className="flex items-center gap-2 ml-auto">
              <Search size={16} className="text-slate-400" />
              <input
                type="text"
                placeholder="Filter by Employee ID..."
                value={employeeId}
                onChange={(e) => onEmployeeIdChange(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-md px-3 py-1.5 w-48 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
