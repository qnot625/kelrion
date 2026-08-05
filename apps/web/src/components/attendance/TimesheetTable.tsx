import { Clock, PlusCircle } from "lucide-react";
import type { ApiAttendanceSummary } from "../../lib/api";
import { DailyAttendanceCard } from "./DailyAttendanceCard";

export interface TimesheetTableProps {
  readonly summaries: ApiAttendanceSummary[];
  readonly loading?: boolean;
  readonly onRequestCorrection: (summary: ApiAttendanceSummary) => void;
}

export function TimesheetTable({ summaries, loading = false, onRequestCorrection }: TimesheetTableProps) {
  const formatTime = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  const getStatusBadge = (status: ApiAttendanceSummary["status"]) => {
    switch (status) {
      case "clocked_in":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
            Clocked In
          </span>
        );
      case "on_break":
        return (
          <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
            On Break
          </span>
        );
      case "clocked_out":
      default:
        return (
          <span className="px-2 py-0.5 text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 rounded-full">
            Completed
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
        <Clock className="mx-auto mb-2 animate-spin text-indigo-400" size={24} />
        <p className="text-sm">Loading timesheet records...</p>
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
        <p className="text-sm">No timesheet records found for the selected date range.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile view */}
      <div className="block md:hidden space-y-3">
        {summaries.map((summary, idx) => (
          <DailyAttendanceCard
            key={`${summary.employeeId}_${summary.workDate}_${idx}`}
            summary={summary}
            onRequestCorrection={onRequestCorrection}
          />
        ))}
      </div>

      {/* Desktop view */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Work Date</th>
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Clock In</th>
              <th className="px-4 py-3">Clock Out</th>
              <th className="px-4 py-3">Break Mins</th>
              <th className="px-4 py-3">Total Worked</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {summaries.map((summary, idx) => {
              const workHours = Math.round(((summary.totalWorkMinutes || 0) / 60) * 10) / 10;
              return (
                <tr key={`${summary.employeeId}_${summary.workDate}_${idx}`} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-200">{summary.workDate}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{summary.employeeId}</td>
                  <td className="px-4 py-3 font-mono">{formatTime(summary.clockInTime)}</td>
                  <td className="px-4 py-3 font-mono">{formatTime(summary.clockOutTime)}</td>
                  <td className="px-4 py-3 font-mono">{summary.totalBreakMinutes || 0}m</td>
                  <td className="px-4 py-3 font-semibold text-emerald-400 font-mono">{workHours} hrs</td>
                  <td className="px-4 py-3">{getStatusBadge(summary.status)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onRequestCorrection(summary)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/50 rounded-md transition-colors"
                    >
                      <PlusCircle size={12} />
                      Correction
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
