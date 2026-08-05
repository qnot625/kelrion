import { Clock, Coffee, PlusCircle } from "lucide-react";
import type { ApiAttendanceSummary } from "../../lib/api";

export interface DailyAttendanceCardProps {
  readonly summary: ApiAttendanceSummary;
  readonly onRequestCorrection: (summary: ApiAttendanceSummary) => void;
}

export function DailyAttendanceCard({ summary, onRequestCorrection }: DailyAttendanceCardProps) {
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

  const formatTime = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "—";
    }
  };

  const workHours = Math.round(((summary.totalWorkMinutes || 0) / 60) * 10) / 10;
  const breakMinutes = summary.totalBreakMinutes || 0;

  return (
    <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-200">{summary.workDate}</h4>
          <span className="text-xs text-slate-400 font-mono">Emp ID: {summary.employeeId}</span>
        </div>
        {getStatusBadge(summary.status)}
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-slate-400" />
          <div>
            <span className="text-slate-400 block">Clock In / Out</span>
            <span className="font-mono text-slate-200">
              {formatTime(summary.clockInTime)} - {formatTime(summary.clockOutTime)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Coffee size={14} className="text-slate-400" />
          <div>
            <span className="text-slate-400 block">Worked / Break</span>
            <span className="font-mono text-slate-200">
              {workHours} hrs ({breakMinutes}m break)
            </span>
          </div>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={() => onRequestCorrection(summary)}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-indigo-300 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/50 rounded-lg transition-colors"
        >
          <PlusCircle size={13} />
          Request Correction
        </button>
      </div>
    </div>
  );
}
