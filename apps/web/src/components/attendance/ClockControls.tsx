import React from "react";
import { AttendanceStatus } from "../../hooks/useAttendance";

export interface ClockControlsProps {
  readonly status: AttendanceStatus;
  readonly isPending: boolean;
  readonly onClockIn: () => void;
  readonly onClockOut: () => void;
  readonly onStartBreak: () => void;
  readonly onEndBreak: () => void;
}

export const ClockControls: React.FC<ClockControlsProps> = ({
  status,
  isPending,
  onClockIn,
  onClockOut,
  onStartBreak,
  onEndBreak,
}) => {
  if (status === "CLOCKED_OUT") {
    return (
      <div className="mt-2">
        <button
          type="button"
          disabled={isPending}
          onClick={onClockIn}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
        >
          {isPending ? "Recording..." : "Clock In Now"}
        </button>
      </div>
    );
  }

  if (status === "CLOCKED_IN") {
    return (
      <div className="mt-2 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={onStartBreak}
          className="py-2.5 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 disabled:opacity-50 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
        >
          {isPending ? "Updating..." : "Start Break"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onClockOut}
          className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
        >
          {isPending ? "Updating..." : "Clock Out"}
        </button>
      </div>
    );
  }

  if (status === "ON_BREAK") {
    return (
      <div className="mt-2 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={onEndBreak}
          className="col-span-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
        >
          {isPending ? "Updating..." : "End Break"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onClockOut}
          className="col-span-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:opacity-50 text-white font-medium rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
        >
          {isPending ? "Updating..." : "Clock Out"}
        </button>
      </div>
    );
  }

  return null;
};
