import { CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import type { ApiAttendanceCorrection } from "../../lib/api";

export interface ApprovalHistoryPanelProps {
  readonly resolvedRequests: ApiAttendanceCorrection[];
}

export function ApprovalHistoryPanel({ resolvedRequests }: ApprovalHistoryPanelProps) {
  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return iso;
    }
  };

  if (resolvedRequests.length === 0) {
    return (
      <div className="p-6 text-center text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800">
        <p className="text-xs">No resolved approval history yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-6">
      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
        <ShieldCheck size={16} className="text-indigo-400" />
        Resolved Approval History
      </h4>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
            <tr>
              <th className="px-4 py-2.5">Employee ID</th>
              <th className="px-4 py-2.5">Event Type</th>
              <th className="px-4 py-2.5">Requested Time</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Reviewed By</th>
              <th className="px-4 py-2.5">Review Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {resolvedRequests.map((req) => (
              <tr key={req.id} className="hover:bg-slate-800/30">
                <td className="px-4 py-2.5 font-mono text-slate-300">{req.employeeId}</td>
                <td className="px-4 py-2.5 uppercase font-medium text-slate-300">
                  {req.requestedEventType.replace("_", " ")}
                </td>
                <td className="px-4 py-2.5 font-mono text-slate-400">
                  {formatTimestamp(req.requestedTimestamp)}
                </td>
                <td className="px-4 py-2.5">
                  {req.status === "approved" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                      <CheckCircle2 size={12} /> Approved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full">
                      <XCircle size={12} /> Rejected
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">
                  {req.reviewedByUserId || "Manager"}
                </td>
                <td className="px-4 py-2.5 text-slate-300 italic text-xs">
                  {req.reviewNotes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
