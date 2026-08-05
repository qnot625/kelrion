import React from "react";
import { AttendanceState } from "../../hooks/useAttendance";

export interface AttendanceTimerProps {
  readonly state: AttendanceState;
  readonly now: Date;
}

export function formatDurationSeconds(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;
}

export const AttendanceTimer: React.FC<AttendanceTimerProps> = ({ state, now }) => {
  let displayLabel = "Shift Duration";
  let elapsedSeconds = 0;

  if (state.status === "ON_BREAK" && state.currentBreakStart) {
    displayLabel = "Current Break Duration";
    elapsedSeconds = Math.floor(
      (now.getTime() - new Date(state.currentBreakStart).getTime()) / 1000
    );
  } else if (state.clockInTime) {
    displayLabel = "Worked Time Today";
    const totalShiftSeconds = Math.floor(
      (now.getTime() - new Date(state.clockInTime).getTime()) / 1000
    );
    const breakMinutes = state.summary?.totalBreakMinutes || 0;
    elapsedSeconds = totalShiftSeconds - breakMinutes * 60;
  }

  const formattedTime = formatDurationSeconds(elapsedSeconds);

  return (
    <div className="py-4 text-center bg-slate-50/70 rounded-lg my-3 border border-slate-100">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {displayLabel}
      </div>
      <div className="text-3xl font-extrabold tracking-tight text-slate-900 mt-1 font-mono">
        {formattedTime}
      </div>
      {state.summary && (
        <div className="mt-1 text-xs text-slate-500 flex justify-center gap-4">
          <span>Logged: {state.summary.totalWorkMinutes} mins</span>
          <span>Breaks: {state.summary.totalBreakMinutes} mins</span>
        </div>
      )}
    </div>
  );
};
