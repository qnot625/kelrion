import React from "react";
import { CheckCircle2, PauseCircle, XCircle } from "lucide-react";

interface QueueStatusBadgeProps {
  isActive: boolean;
  isPaused: boolean;
}

export const QueueStatusBadge: React.FC<QueueStatusBadgeProps> = ({
  isActive,
  isPaused,
}) => {
  if (!isActive) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
        <XCircle className="h-3 w-3 text-slate-500" />
        Inactive
      </span>
    );
  }

  if (isPaused) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
        <PauseCircle className="h-3 w-3 text-amber-600" />
        Paused
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
      Active
    </span>
  );
};
