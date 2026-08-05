import { Check, X, Clock, AlertTriangle, MessageSquare } from "lucide-react";
import { useState } from "react";
import type { ApiAttendanceCorrection } from "../../lib/api";

export interface ManagerReviewPanelProps {
  readonly pendingRequests: ApiAttendanceCorrection[];
  readonly loading?: boolean;
  readonly actionLoadingId: string | null;
  readonly onApprove: (id: string, notes?: string) => Promise<boolean>;
  readonly onReject: (id: string, notes?: string) => Promise<boolean>;
}

export function ManagerReviewPanel({
  pendingRequests,
  loading = false,
  actionLoadingId,
  onApprove,
  onReject,
}: ManagerReviewPanelProps) {
  const [notesState, setNotesState] = useState<Record<string, string>>({});

  const handleNotesChange = (id: string, val: string) => {
    setNotesState((prev) => ({ ...prev, [id]: val }));
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
        <Clock className="mx-auto mb-2 animate-spin text-indigo-400" size={24} />
        <p className="text-sm">Loading pending correction requests...</p>
      </div>
    );
  }

  if (pendingRequests.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
        <p className="text-sm font-medium text-slate-300">No pending correction requests</p>
        <p className="text-xs text-slate-500 mt-1">All attendance correction submissions have been reviewed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
        <AlertTriangle size={18} className="text-amber-400" />
        Pending Corrections ({pendingRequests.length})
      </h3>

      <div className="space-y-4">
        {pendingRequests.map((req) => {
          const isProcessing = actionLoadingId === req.id;
          const currentNote = notesState[req.id] || "";

          return (
            <div
              key={req.id}
              className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <span className="text-xs font-mono text-slate-400">Employee ID: {req.employeeId}</span>
                  <span className="text-xs text-slate-500 ml-3">Requested: {formatTimestamp(req.createdAt)}</span>
                </div>
                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full animate-pulse">
                  PENDING REVIEW
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
                <div>
                  <span className="text-slate-400 block font-medium">Event Type</span>
                  <span className="font-semibold text-indigo-300 uppercase tracking-wide">
                    {req.requestedEventType.replace("_", " ")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Requested Timestamp</span>
                  <span className="font-mono text-slate-200">{formatTimestamp(req.requestedTimestamp)}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-slate-400 block font-medium">Employee Reason / Rationale</span>
                  <p className="text-slate-200 text-xs italic mt-0.5">"{req.reason}"</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <MessageSquare size={14} />
                  <span>Review Notes (Optional):</span>
                </div>
                <input
                  type="text"
                  placeholder="Add manager review notes..."
                  value={currentNote}
                  onChange={(e) => handleNotesChange(req.id, e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => onReject(req.id, currentNote)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <X size={14} />
                  Reject
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => onApprove(req.id, currentNote)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-800/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Check size={14} />
                  Approve & Apply
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
