import { AlertCircle, Clock, Send, X } from "lucide-react";
import { useState } from "react";
import type { ApiAttendanceSummary } from "../../lib/api";

export interface CorrectionRequestDrawerProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly targetSummary?: ApiAttendanceSummary | null;
  readonly onSubmit: (input: {
    employeeId: string;
    requestedEventType: "clock_in" | "clock_out" | "break_start" | "break_end";
    requestedTimestamp: string;
    reason: string;
  }) => Promise<boolean>;
  readonly submitting?: boolean;
}

export function CorrectionRequestDrawer({
  isOpen,
  onClose,
  targetSummary,
  onSubmit,
  submitting = false,
}: CorrectionRequestDrawerProps) {
  const [eventType, setEventType] = useState<"clock_in" | "clock_out" | "break_start" | "break_end">("clock_in");
  const [requestedTime, setRequestedTime] = useState("");
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!requestedTime) {
      setValidationError("Please select a valid date and time.");
      return;
    }
    if (!reason.trim()) {
      setValidationError("Please provide a reason / rationale for this correction request.");
      return;
    }

    const isoTimestamp = new Date(requestedTime).toISOString();
    const success = await onSubmit({
      employeeId: targetSummary?.employeeId || "",
      requestedEventType: eventType,
      requestedTimestamp: isoTimestamp,
      reason: reason.trim(),
    });

    if (success) {
      setReason("");
      setRequestedTime("");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between overflow-y-auto">
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Clock size={18} className="text-indigo-400" />
                Request Attendance Correction
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Target Date: <strong className="text-slate-200">{targetSummary?.workDate}</strong> (Emp: {targetSummary?.employeeId})
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {validationError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center gap-2 text-rose-400 text-xs">
              <AlertCircle size={16} />
              <span>{validationError}</span>
            </div>
          )}

          <form id="correction-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Target Event Type</label>
              <select
                value={eventType}
                onChange={(e) => setEventType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                <option value="clock_in">Clock In</option>
                <option value="clock_out">Clock Out</option>
                <option value="break_start">Start Break</option>
                <option value="break_end">End Break</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Requested Timestamp</label>
              <input
                type="datetime-local"
                value={requestedTime}
                onChange={(e) => setRequestedTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Reason / Rationale <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={4}
                placeholder="Explain why this clock correction is needed (e.g. forgot to clock out, system sync error)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          </form>
        </div>

        <div className="pt-6 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="correction-form"
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors disabled:opacity-50"
          >
            <Send size={14} />
            Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}
