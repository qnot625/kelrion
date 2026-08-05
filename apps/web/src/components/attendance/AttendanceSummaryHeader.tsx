import { Clock, Coffee, AlertCircle, FileSpreadsheet } from "lucide-react";

export interface AttendanceSummaryHeaderProps {
  readonly totalWorkedHours: number;
  readonly totalBreakHours: number;
  readonly pendingCorrectionsCount: number;
  readonly totalRecordsCount: number;
}

export function AttendanceSummaryHeader({
  totalWorkedHours,
  totalBreakHours,
  pendingCorrectionsCount,
  totalRecordsCount,
}: AttendanceSummaryHeaderProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="panel p-4 flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg">
          <Clock size={22} />
        </div>
        <div>
          <small className="text-slate-400 font-medium block text-xs uppercase tracking-wider">
            Total Hours Worked
          </small>
          <div className="text-2xl font-semibold text-slate-100">{totalWorkedHours} hrs</div>
        </div>
      </div>

      <div className="panel p-4 flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg">
          <Coffee size={22} />
        </div>
        <div>
          <small className="text-slate-400 font-medium block text-xs uppercase tracking-wider">
            Total Break Duration
          </small>
          <div className="text-2xl font-semibold text-slate-100">{totalBreakHours} hrs</div>
        </div>
      </div>

      <div className="panel p-4 flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-lg">
          <FileSpreadsheet size={22} />
        </div>
        <div>
          <small className="text-slate-400 font-medium block text-xs uppercase tracking-wider">
            Timesheet Records
          </small>
          <div className="text-2xl font-semibold text-slate-100">{totalRecordsCount}</div>
        </div>
      </div>

      <div className="panel p-4 flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div className="p-3 bg-rose-500/10 text-rose-400 rounded-lg">
          <AlertCircle size={22} />
        </div>
        <div>
          <small className="text-slate-400 font-medium block text-xs uppercase tracking-wider">
            Pending Corrections
          </small>
          <div className="text-2xl font-semibold text-slate-100">{pendingCorrectionsCount}</div>
        </div>
      </div>
    </div>
  );
}
