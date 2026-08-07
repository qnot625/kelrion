import { Check, Clock3, Coffee, Loader2, LogIn, LogOut, RotateCcw, UserRoundCheck, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { KlerionSession } from "../../lib/session";
import {
  workforceApi,
  type ApiAttendanceAction,
  type ApiAttendanceCorrection,
  type ApiAttendanceRecord,
  type ApiEmployee,
} from "./workforceApi";

const demoEmployee: ApiEmployee = {
  id: "demo-employee-1",
  tenantId: "demo-tenant",
  userId: "demo-owner",
  employeeNumber: "EMP-001",
  firstName: "Amina",
  lastName: "Yusuf",
  email: "amina@klerion.demo",
  hireDate: "2025-03-10",
  employmentType: "full_time",
  employmentStatus: "active",
  departmentId: null,
  positionId: null,
  managerId: null,
  branchId: null,
  terminationDate: null,
  createdAt: "2025-03-10T08:00:00.000Z",
  updatedAt: "2026-08-06T08:00:00.000Z",
};

function demoRecord(status: ApiAttendanceRecord["status"] = "clocked_in"): ApiAttendanceRecord {
  return {
    id: "demo-attendance-1",
    tenantId: "demo-tenant",
    employeeId: demoEmployee.id,
    workDate: new Date().toISOString().slice(0, 10),
    status,
    clockInAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    clockOutAt: status === "clocked_out" ? new Date().toISOString() : null,
    breaks: [],
    activeDurationMinutes: status === "clocked_out" ? 450 : 0,
    totalBreakMinutes: 30,
    exceptions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short" }).format(new Date(`${value}T00:00:00Z`));
}

function actionFor(record: ApiAttendanceRecord | null): { action: ApiAttendanceAction; label: string; icon: typeof LogIn } | null {
  if (!record || record.status === "idle") return { action: "clock_in", label: "Clock in", icon: LogIn };
  if (record.status === "clocked_in") return { action: "break_start", label: "Start break", icon: Coffee };
  if (record.status === "on_break") return { action: "break_end", label: "End break", icon: RotateCcw };
  return null;
}

export function AttendanceView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [employee, setEmployee] = useState<ApiEmployee | null>(null);
  const [today, setToday] = useState<ApiAttendanceRecord | null>(null);
  const [records, setRecords] = useState<ApiAttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<ApiAttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showCorrection, setShowCorrection] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (session.mode === "demo") {
        const record = demoRecord();
        setEmployee(demoEmployee);
        setToday(record);
        setRecords([record]);
        setCorrections([]);
      } else {
        const [self, nextRecords, nextCorrections] = await Promise.all([
          workforceApi.getMyAttendance(session),
          workforceApi.listAttendanceRecords(session),
          workforceApi.listAttendanceCorrections(session),
        ]);
        setEmployee(self.employee);
        setToday(self.record);
        setRecords(nextRecords);
        setCorrections(nextCorrections.data);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load attendance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.token]);

  const pendingCorrections = useMemo(() => corrections.filter((item) => item.status === "pending").length, [corrections]);
  const nextAction = actionFor(today);
  const NextActionIcon = nextAction?.icon;

  async function clock(action: ApiAttendanceAction) {
    if (!employee) return;
    setWorking(action);
    setError("");
    try {
      const updated = session.mode === "demo"
        ? demoRecord(action === "clock_out" ? "clocked_out" : action === "break_start" ? "on_break" : "clocked_in")
        : await workforceApi.clockAttendance(session, {
            action,
            timestamp: new Date().toISOString(),
            idempotencyKey: `web:${employee.id}:${Date.now()}:${action}`,
            source: "web",
          });
      setToday(updated);
      setRecords((current) => [updated, ...current.filter((item) => item.id !== updated.id)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update attendance");
    } finally {
      setWorking(null);
    }
  }

  async function submitCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!employee) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setWorking("correction");
    setError("");
    try {
      const requestedAction = data.get("requestedAction") as ApiAttendanceAction;
      const requestedAt = new Date(String(data.get("requestedAt"))).toISOString();
      const created = session.mode === "demo"
        ? {
            id: `demo-correction-${Date.now()}`,
            tenantId: "demo-tenant",
            employeeId: employee.id,
            requestedAction,
            requestedAt,
            reason: String(data.get("reason")),
            status: "pending" as const,
            reviewedByUserId: null,
            reviewNotes: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : await workforceApi.requestAttendanceCorrection(session, {
            requestedAction,
            requestedAt,
            reason: String(data.get("reason")),
          });
      setCorrections((current) => [created, ...current]);
      setShowCorrection(false);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request correction");
    } finally {
      setWorking(null);
    }
  }

  async function review(item: ApiAttendanceCorrection, approved: boolean) {
    setWorking(item.id);
    setError("");
    try {
      const updated = session.mode === "demo"
        ? { ...item, status: approved ? "approved" as const : "rejected" as const, updatedAt: new Date().toISOString() }
        : await workforceApi.reviewAttendanceCorrection(session, item.id, approved, "Reviewed in Company Console");
      setCorrections((current) => current.map((row) => row.id === item.id ? updated : row));
      if (approved && session.mode !== "demo") await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review correction");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Workforce core</span>
          <h1>Time & attendance</h1>
          <p>Record daily presence, breaks and offline-safe events, with a traceable correction workflow for exceptions.</p>
        </div>
        {employee && <button className="secondary" onClick={() => setShowCorrection((value) => !value)}><RotateCcw size={15} /> Request correction</button>}
      </div>

      <div className="lifecycle-metrics">
        <article><span><UserRoundCheck size={18} /></span><div><small>Employee</small><strong>{employee ? employee.employeeNumber : "—"}</strong><em>{employee ? `${employee.firstName} ${employee.lastName}` : "Not linked"}</em></div></article>
        <article><span><Clock3 size={18} /></span><div><small>Today</small><strong>{today ? today.status.replaceAll("_", " ") : "Not started"}</strong><em>{today?.clockInAt ? `in ${formatTime(today.clockInAt)}` : "no clock-in"}</em></div></article>
        <article><span><Coffee size={18} /></span><div><small>Break time</small><strong>{today?.totalBreakMinutes ?? 0}</strong><em>minutes today</em></div></article>
        <article><span><RotateCcw size={18} /></span><div><small>Corrections</small><strong>{pendingCorrections}</strong><em>awaiting review</em></div></article>
      </div>

      {employee && (
        <section className="panel lifecycle-form">
          <header><div><h2>Today’s attendance</h2><p>Self-service actions resolve the employee identity from your authenticated account.</p></div></header>
          <div className="row-actions" style={{ padding: "0 20px 20px", gap: 10 }}>
            {nextAction && NextActionIcon && <button className="primary" onClick={() => void clock(nextAction.action)} disabled={Boolean(working)}><NextActionIcon size={15} />{nextAction.label}</button>}
            {today && (today.status === "clocked_in" || today.status === "on_break") && <button className="secondary" onClick={() => void clock("clock_out")} disabled={Boolean(working)}><LogOut size={15} />Clock out</button>}
            {today?.status === "clocked_out" && <span className="status-pill approved">Shift completed</span>}
            {working && <Loader2 size={16} className="spin" />}
          </div>
        </section>
      )}

      {showCorrection && employee && (
        <form className="panel lifecycle-form" onSubmit={submitCorrection}>
          <header><div><h2>Attendance correction</h2><p>Corrections remain pending until an owner or staff reviewer approves them.</p></div></header>
          <div className="lifecycle-form-grid">
            <label>Requested action<select name="requestedAction" defaultValue="clock_in"><option value="clock_in">Clock in</option><option value="clock_out">Clock out</option><option value="break_start">Break start</option><option value="break_end">Break end</option></select></label>
            <label>Date and time<input name="requestedAt" type="datetime-local" required /></label>
            <label className="wide">Reason<textarea name="reason" required minLength={3} placeholder="Explain what should be corrected and why." /></label>
          </div>
          <footer><button type="button" className="secondary" onClick={() => setShowCorrection(false)}>Cancel</button><button className="primary" disabled={working === "correction"}>Submit correction</button></footer>
        </form>
      )}

      {error && <div className="form-error">{error}</div>}

      <section className="panel table-panel">
        <header style={{ padding: "18px 20px" }}><div><h2>Attendance history</h2><p>{canManage ? "Organisation records available to your role." : "Your recent attendance records."}</p></div></header>
        {loading ? <div className="empty-state"><Loader2 className="spin" />Loading attendance…</div> : (
          <table>
            <thead><tr><th>Date</th><th>Employee</th><th>Clock in</th><th>Clock out</th><th>Active</th><th>Status</th></tr></thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{formatDate(record.workDate)}</td>
                  <td>{employee && record.employeeId === employee.id ? employee.employeeNumber : record.employeeId.slice(0, 8)}</td>
                  <td>{formatTime(record.clockInAt)}</td>
                  <td>{formatTime(record.clockOutAt)}</td>
                  <td>{record.activeDurationMinutes} min</td>
                  <td><span className={`status-pill ${record.status === "clocked_out" ? "approved" : "pending"}`}>{record.status.replaceAll("_", " ")}</span></td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={6}><div className="empty-state">No attendance records yet.</div></td></tr>}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel table-panel">
        <header style={{ padding: "18px 20px" }}><div><h2>Correction requests</h2><p>Every approval or rejection is retained with reviewer metadata.</p></div></header>
        <table>
          <thead><tr><th>Requested event</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {corrections.map((item) => (
              <tr key={item.id}>
                <td><div className="stack"><strong>{item.requestedAction.replaceAll("_", " ")}</strong><small>{new Date(item.requestedAt).toLocaleString()}</small></div></td>
                <td>{item.reason}</td>
                <td><span className={`status-pill ${item.status}`}>{item.status}</span></td>
                <td><div className="row-actions">{canManage && item.status === "pending" && <><button onClick={() => void review(item, true)} disabled={working === item.id}><Check size={13} />Approve</button><button onClick={() => void review(item, false)} disabled={working === item.id}><X size={13} />Reject</button></>}</div></td>
              </tr>
            ))}
            {corrections.length === 0 && <tr><td colSpan={4}><div className="empty-state">No correction requests.</div></td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
