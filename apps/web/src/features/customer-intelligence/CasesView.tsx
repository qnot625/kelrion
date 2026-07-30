import { AlertTriangle, CheckCircle2, Clock3, Loader2, MessageSquareWarning, Plus, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { KlerionSession } from "../../lib/session";
import {
  customerIntelligenceApi,
  type CustomerCasePriority,
  type CustomerCaseRecord,
} from "./api";

const demoCases: CustomerCaseRecord[] = [
  {
    id: "demo-case",
    reference: "KLR-2026-DEMO001",
    customerEmail: "customer@example.com",
    subject: "Delayed document collection",
    description: "The customer has not received the completed document.",
    category: "Service delivery",
    priority: "high",
    status: "in_progress",
    ownerUserId: "demo-owner",
    slaDueAt: new Date(Date.now() + 3_600_000).toISOString(),
    slaState: "due_soon",
    remainingMinutes: 60,
    resolution: null,
    createdAt: new Date().toISOString(),
  },
];

export function CasesView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [cases, setCases] = useState<CustomerCaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    void (async () => {
      try { setCases(session.mode === "demo" ? demoCases : await customerIntelligenceApi.listCases(session)); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load cases"); }
      finally { setLoading(false); }
    })();
  }, [canManage, session]);

  const metrics = useMemo(() => ({
    active: cases.filter((item) => !["resolved", "closed"].includes(item.status)).length,
    urgent: cases.filter((item) => item.priority === "urgent").length,
    breached: cases.filter((item) => item.slaState === "breached").length,
    resolved: cases.filter((item) => item.status === "resolved").length,
  }), [cases]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorking("create"); setError("");
    try {
      const input = {
        customerEmail: String(data.get("customerEmail")),
        subject: String(data.get("subject")),
        description: String(data.get("description")),
        category: String(data.get("category")),
        priority: data.get("priority") as CustomerCasePriority,
      };
      const created = session.mode === "demo"
        ? { ...demoCases[0]!, ...input, id: `demo-${Date.now()}`, reference: `KLR-2026-${Date.now()}`, status: "open" as const }
        : await customerIntelligenceApi.createCase(session, input);
      setCases((current) => [created, ...current]);
      setShowForm(false); event.currentTarget.reset();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create case"); }
    finally { setWorking(null); }
  }

  async function action(item: CustomerCaseRecord, actionName: "assign" | "resolve") {
    setWorking(item.id); setError("");
    try {
      const updated = session.mode === "demo"
        ? { ...item, ownerUserId: session.userId, status: actionName === "resolve" ? "resolved" as const : "in_progress" as const, slaState: actionName === "resolve" ? "met" as const : item.slaState }
        : actionName === "assign"
          ? await customerIntelligenceApi.assignToMe(session, item.id)
          : await customerIntelligenceApi.changeStatus(session, item.id, "resolved", "Issue resolved and outcome confirmed.");
      setCases((current) => current.map((record) => record.id === updated.id ? updated : record));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update case"); }
    finally { setWorking(null); }
  }

  return <div className="view">
    <div className="view-heading"><div><span className="eyebrow">Customer resolution</span><h1>Cases, complaints and SLA</h1><p>Give every customer issue an owner, deadline, evidence trail and measurable outcome.</p></div><button className="primary" onClick={() => setShowForm((value) => !value)}><Plus size={16}/>New case</button></div>
    <div className="ci-metrics">
      <article><MessageSquareWarning/><div><small>Active cases</small><strong>{metrics.active}</strong></div></article>
      <article><AlertTriangle/><div><small>Urgent</small><strong>{metrics.urgent}</strong></div></article>
      <article><Clock3/><div><small>SLA breached</small><strong>{metrics.breached}</strong></div></article>
      <article><CheckCircle2/><div><small>Resolved</small><strong>{metrics.resolved}</strong></div></article>
    </div>
    {showForm && <form className="panel ci-form" onSubmit={create}><header><div><h2>Register a customer issue</h2><p>The SLA deadline is calculated from priority.</p></div></header><div className="ci-form-grid"><label>Customer email<input name="customerEmail" type="email" required/></label><label>Category<input name="category" required placeholder="Service delivery"/></label><label>Priority<select name="priority" defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="wide">Subject<input name="subject" required minLength={3}/></label><label className="wide">Description<textarea name="description" required minLength={5}/></label></div><footer><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={working === "create"}>{working === "create" && <Loader2 className="spin" size={14}/>}Create case</button></footer></form>}
    {error && <div className="form-error">{error}</div>}
    {!canManage ? <div className="panel empty-state">Your case has been accepted. Operational case queues are available to staff and owners.</div> : loading ? <div className="empty-state"><Loader2 className="spin"/>Loading customer cases…</div> : <section className="panel table-panel"><table><thead><tr><th>Case</th><th>Customer</th><th>Priority</th><th>SLA</th><th>Status</th><th>Actions</th></tr></thead><tbody>{cases.map((item) => <tr key={item.id}><td><div className="stack"><strong>{item.reference}</strong><small>{item.subject}</small></div></td><td>{item.customerEmail}</td><td><span className={`priority-pill ${item.priority}`}>{item.priority}</span></td><td><span className={`sla-pill ${item.slaState}`}>{item.slaState.replace("_", " ")}</span></td><td><span className={`status-pill ${item.status}`}>{item.status.replace("_", " ")}</span></td><td><div className="row-actions">{!item.ownerUserId && <button onClick={() => void action(item, "assign")} disabled={working === item.id}><UserCheck size={13}/>Assign to me</button>}{!["resolved", "closed"].includes(item.status) && <button onClick={() => void action(item, "resolve")} disabled={working === item.id}><CheckCircle2 size={13}/>Resolve</button>}</div></td></tr>)}{cases.length === 0 && <tr><td colSpan={6}><div className="empty-state">No customer cases yet.</div></td></tr>}</tbody></table></section>}
  </div>;
}
