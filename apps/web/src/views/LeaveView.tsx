import { CalendarCheck2, Check, Clock3, Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  klerionApi,
  type ApiLeaveBalance,
  type ApiLeaveRequest,
  type ApiLeaveType,
} from "../lib/api";
import type { KlerionSession } from "../lib/session";

const demoRequests: ApiLeaveRequest[] = [
  {
    id: "demo-leave-1",
    requesterUserId: "demo-owner",
    type: "annual",
    startDate: "2026-08-10T00:00:00.000Z",
    endDate: "2026-08-14T00:00:00.000Z",
    workingDays: 5,
    reason: "Annual leave",
    status: "pending",
    decisionNote: null,
    createdAt: "2026-07-30T08:00:00.000Z",
  },
];

const demoBalances: ApiLeaveBalance[] = [
  { type: "annual", allocatedDays: 20, approvedDays: 5, pendingDays: 5, remainingDays: 10 },
  { type: "sick", allocatedDays: 10, approvedDays: 1, pendingDays: 0, remainingDays: 9 },
  { type: "parental", allocatedDays: 90, approvedDays: 0, pendingDays: 0, remainingDays: 90 },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(value),
  );
}

export function LeaveView({ session }: { readonly session: KlerionSession }) {
  const canApprove = session.roles.some((role) => role === "owner" || role === "staff");
  const [requests, setRequests] = useState<ApiLeaveRequest[]>([]);
  const [balances, setBalances] = useState<ApiLeaveBalance[]>([]);
  const [scope, setScope] = useState<"mine" | "all">(canApprove ? "all" : "mine");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load(nextScope = scope) {
    setLoading(true);
    setError("");
    try {
      if (session.mode === "demo") {
        setRequests(demoRequests);
        setBalances(demoBalances);
      } else {
        const [nextRequests, nextBalances] = await Promise.all([
          klerionApi.listLeaveRequests(session, nextScope),
          klerionApi.listLeaveBalances(session),
        ]);
        setRequests(nextRequests);
        setBalances(nextBalances);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load leave records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(scope); }, [scope]);

  const pending = useMemo(() => requests.filter((request) => request.status === "pending").length, [requests]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorking("submit");
    setError("");
    try {
      const input = {
        type: data.get("type") as ApiLeaveType,
        startDate: String(data.get("startDate")),
        endDate: String(data.get("endDate")),
        reason: String(data.get("reason")),
      };
      const created =
        session.mode === "demo"
          ? { ...demoRequests[0], id: `demo-${Date.now()}`, ...input, createdAt: new Date().toISOString() }
          : await klerionApi.submitLeaveRequest(session, input);
      setRequests((current) => [created, ...current]);
      setShowForm(false);
      event.currentTarget.reset();
      if (session.mode !== "demo") setBalances(await klerionApi.listLeaveBalances(session));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not submit leave request");
    } finally {
      setWorking(null);
    }
  }

  async function decide(request: ApiLeaveRequest, decision: "approve" | "reject") {
    setWorking(request.id);
    setError("");
    try {
      const updated =
        session.mode === "demo"
          ? { ...request, status: decision === "approve" ? "approved" as const : "rejected" as const }
          : await klerionApi.decideLeaveRequest(session, request.id, decision);
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update leave request");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Workforce lifecycle</span>
          <h1>Leave and availability</h1>
          <p>Submit leave, protect team coverage and keep every approval decision traceable.</p>
        </div>
        <button className="primary" onClick={() => setShowForm((value) => !value)}>
          <Plus size={16} /> New request
        </button>
      </div>

      <div className="lifecycle-metrics">
        {balances.slice(0, 3).map((balance) => (
          <article key={balance.type}>
            <span><CalendarCheck2 size={18} /></span>
            <div>
              <small>{balance.type} leave</small>
              <strong>{balance.remainingDays ?? "Flexible"}</strong>
              <em>{balance.remainingDays === null ? "Policy managed" : "days remaining"}</em>
            </div>
          </article>
        ))}
        <article>
          <span><Clock3 size={18} /></span>
          <div><small>Awaiting decision</small><strong>{pending}</strong><em>requests</em></div>
        </article>
      </div>

      {showForm && (
        <form className="panel lifecycle-form" onSubmit={submit}>
          <header><div><h2>Request time away</h2><p>Weekends are excluded automatically.</p></div></header>
          <div className="lifecycle-form-grid">
            <label>Leave type<select name="type" defaultValue="annual"><option value="annual">Annual</option><option value="sick">Sick</option><option value="parental">Parental</option><option value="unpaid">Unpaid</option><option value="other">Other</option></select></label>
            <label>Start date<input name="startDate" type="date" required /></label>
            <label>End date<input name="endDate" type="date" required /></label>
            <label className="wide">Reason<textarea name="reason" required minLength={3} maxLength={500} placeholder="Give your manager enough context to plan coverage." /></label>
          </div>
          <footer><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={working === "submit"}>{working === "submit" && <Loader2 size={14} className="spin" />}Submit request</button></footer>
        </form>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="toolbar lifecycle-toolbar">
        <strong>{scope === "all" ? "Team requests" : "My requests"}</strong>
        {canApprove && <select value={scope} onChange={(event) => setScope(event.target.value as "mine" | "all")}><option value="all">Entire team</option><option value="mine">My requests</option></select>}
      </div>

      <section className="panel table-panel">
        {loading ? <div className="empty-state"><Loader2 className="spin" />Loading leave records…</div> : (
          <table>
            <thead><tr><th>Request</th><th>Dates</th><th>Duration</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id}>
                  <td><div className="stack"><strong>{request.type[0].toUpperCase() + request.type.slice(1)} leave</strong><small>{request.reason}</small></div></td>
                  <td>{formatDate(request.startDate)} – {formatDate(request.endDate)}</td>
                  <td>{request.workingDays} working day{request.workingDays === 1 ? "" : "s"}</td>
                  <td><span className={`status-pill ${request.status}`}>{request.status.replace("_", " ")}</span></td>
                  <td>
                    <div className="row-actions">
                      {canApprove && request.status === "pending" && <>
                        <button onClick={() => void decide(request, "approve")} disabled={working === request.id}><Check size={13} />Approve</button>
                        <button onClick={() => void decide(request, "reject")} disabled={working === request.id}><X size={13} />Reject</button>
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && <tr><td colSpan={5}><div className="empty-state">No leave requests yet.</div></td></tr>}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
