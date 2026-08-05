import React from "react";
import { AttendanceState } from "../../hooks/useAttendance";

export interface AttendanceStatusCardProps {
  readonly state: AttendanceState;
  readonly isOffline?: boolean;
}

export const AttendanceStatusCard: React.FC<AttendanceStatusCardProps> = ({ state, isOffline }) => {
  const getBadgeStyle = () => {
    switch (state.status) {
      case "CLOCKED_IN":
        return {
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          dot: "bg-emerald-500",
          label: "Clocked In · Working",
        };
      case "ON_BREAK":
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          dot: "bg-amber-500 animate-pulse",
          label: "On Break",
        };
      case "CLOCKED_OUT":
      default:
        return {
          bg: "bg-slate-100 text-slate-700 border-slate-200",
          dot: "bg-slate-400",
          label: "Not Clocked In",
        };
    }
  };

  const badge = getBadgeStyle();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
      <div>
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          Work Date: {state.workDate}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${badge.bg}`}
          >
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            {badge.label}
          </span>

          {isOffline && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
              Offline Mode
            </span>
          )}
        </div>
      </div>

      {state.clockInTime && (
        <div className="text-right">
          <span className="text-xs text-slate-500">Shift Started</span>
          <div className="text-sm font-semibold text-slate-800">
            {new Date(state.clockInTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      )}
    </div>
  );
};
