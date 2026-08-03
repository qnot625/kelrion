import React from "react";
import { TicketStatus, QueuePriority } from "../types/queue";

interface TicketBadgeProps {
  status?: TicketStatus;
  priority?: QueuePriority;
}

export const TicketStatusBadge: React.FC<{ status: TicketStatus }> = ({ status }) => {
  const upperStatus = (status || "").toUpperCase();

  const getStyles = () => {
    switch (upperStatus) {
      case "WAITING":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "CALLED":
      case "IN_SERVICE":
        return "bg-amber-50 text-amber-700 border-amber-200 animate-pulse";
      case "COMPLETED":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "SKIPPED":
        return "bg-slate-100 text-slate-600 border-slate-200";
      case "CANCELLED":
      case "NO_SHOW":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "TRANSFERRED":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider border ${getStyles()}`}>
      {upperStatus.replace("_", " ")}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: QueuePriority }> = ({ priority }) => {
  const getStyles = () => {
    switch (priority) {
      case "EMERGENCY":
        return "bg-rose-100 text-rose-800 border-rose-300 font-extrabold";
      case "VIP":
        return "bg-purple-100 text-purple-800 border-purple-300 font-bold";
      case "APPOINTMENT":
        return "bg-indigo-100 text-indigo-800 border-indigo-300 font-bold";
      case "STANDARD":
      default:
        return "bg-slate-100 text-slate-700 border-slate-200 font-semibold";
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${getStyles()}`}>
      {priority}
    </span>
  );
};
