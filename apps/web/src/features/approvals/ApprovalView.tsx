import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, Loader2, Plus, Search, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { ApprovalPolicyBuilder } from "./ApprovalPolicyBuilder";
import { approvalsApi, type ApiApprovalPolicy, type ApiApprovalRequest } from "./approvalsApi";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

export function ApprovalView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [policies, setPolicies] = useState<ApiApprovalPolicy[]>([]);
  const [requests, setRequests] = useState<ApiApprovalRequest[]>([]);
  const [actionable, setActionable] = useState<ApiApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"inbox" | "requests" | "policies">("inbox");
  const [builder, setBuilder] = useState<ApiApprovalPolicy | "new" | null>(null);
  const [requestModal, setRequestModal] = useState(false);
  const [requestPolicyId, setRequestPolicyId] = useState("");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestContext, setRequestContext] = useState("{}");

  async function load() {
    setLoading(true); setError("");
    try {
      if (session.mode === "demo") {
        setPolicies([]); setRequests([]); setActionable([]);
      } else {
        const [policyList, requestList, actionableList] = await Promise.all([
          approvalsApi.listPolicies(session),
          approvalsApi.listRequests(session, canManage ? "all" : undefined),
          approvalsApi.listRequests(session, "actionable"),
        ]);
        setPolicies(policyList); setRequests(requestList); setActionable(actionableList);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load approvals"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [session.token, canManage]);

  const publishedPolicies = policies.filter((item) => item.status === "PUBLISHED");
  const pending = requests.filter((item) => item.status === "PENDING").length;
  const approved = requests.filter((item) => item.status === "APPROVED").length;
  const rejected = requests.filter((item) => item.status === "REJECTED").length;
  const overdue = requests.filter((item) => item.isOverdue).length;
  const filteredPolicies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? policies.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(q)) : policies;
  }, [policies, query]);

  async function decide(request: ApiApprovalRequest, decision: "APPROVE" | "REJECT") {
    const comment = window.prompt(decision === "APPROVE" ? "Optional approval comment" : "Reason for rejection") ?? undefined;
    if (decision === "REJECT" && comment === undefined) return;
    setWorking(request.id); setError("");
    try {
      if (decision === "APPROVE") await approvalsApi.approve(session, request.id, comment);
      else await approvalsApi.reject(session, request.id, comment);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not record approval decision"); }
    finally { setWorking(""); }
  }

  async function archive(policy: ApiApprovalPolicy) {
    setWorking(policy.id); setError("");
    try { const updated = await approvalsApi.archivePolicy(session, policy.id); setPolicies((current) => current.map((item) => item.id === updated.id ? updated : item)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not archive approval policy"); }
    finally { setWorking(""); }
  }

  async function createRequest() {
    setWorking("new-request"); setError("");
    try {
      const context = JSON.parse(requestContext) as Record<string, unknown>;
      await approvalsApi.createRequest(session, { policyId: requestPolicyId, title: requestTitle, description: requestDescription, context });
      setRequestModal(false); setRequestTitle(""); setRequestDescription(""); setRequestContext("{}"); await load(); setTab("requests");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Request context must be valid JSON and the selected policy must be published"); }
    finally { setWorking(""); }
  }

  if (builder && canManage) {
    return <div className="view"><ApprovalPolicyBuilder session={session} initial={builder === "new" ? undefined : builder} onSaved={(saved) => setPolicies((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current])} onClose={() => setBuilder(null)} /></div>;
  }

  return (
    <div className="view">
      <div className="view-heading">
        <div><span className="eyebrow">Governed decisions</span><h1>Approvals</h1><p>Route requests through immutable approval policies, enforce self-approval and quorum rules, and return final decisions to waiting workflows.</p></div>
        <div className="view-heading-actions"><button className="secondary" disabled={publishedPolicies.length === 0} onClick={() => { setRequestPolicyId(publishedPolicies[0]?.id ?? ""); setRequestModal(true); }}><Plus size={16} /> New request</button>{canManage && <button className="primary" onClick={() => setBuilder("new")}><Plus size={16} /> New policy</button>}</div>
      </div>

      <div className="lifecycle-metrics">
        <article><span><Clock3 size={18} /></span><div><small>Pending</small><strong>{pending}</strong><em>{actionable.length} actionable</em></div></article>
        <article><span><CheckCircle2 size={18} /></span><div><small>Approved</small><strong>{approved}</strong><em>completed decisions</em></div></article>
        <article><span><AlertTriangle size={18} /></span><div><small>Overdue</small><strong>{overdue}</strong><em>past stage deadline</em></div></article>
        <article><span><ShieldCheck size={18} /></span><div><small>Policies</small><strong>{policies.length}</strong><em>{publishedPolicies.length} published · {rejected} rejected</em></div></article>
      </div>
      {error && <div className="form-error">{error}</div>}

      <div className="toolbar lifecycle-toolbar approval-toolbar">
        <div className="segmented-control"><button className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>My inbox</button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}>Requests</button><button className={tab === "policies" ? "active" : ""} onClick={() => setTab("policies")}>Policies</button></div>
        {tab === "policies" && <label className="global-search" style={{ maxWidth: 360 }}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search approval policies" /></label>}
      </div>

      {loading ? <section className="panel"><div className="empty-state"><Loader2 className="spin" /> Loading approvals…</div></section> : tab === "policies" ? (
        <section className="forms-card-grid">{filteredPolicies.map((policy) => <article className="panel forms-card approval-policy-card" key={policy.id}><header><div className="stack"><strong>{policy.name}</strong><small>{policy.description || "No description"}</small></div><span className={`status-pill ${policy.status === "PUBLISHED" ? "approved" : policy.status === "ARCHIVED" ? "rejected" : "pending"}`}>{policy.status}</span></header><div className="forms-card-meta"><span>Version<b>{policy.version}</b></span><span>Stages<b>{policy.stages.length}</b></span><span>Published<b>{policy.publishedAt ? "Yes" : "No"}</b></span></div><small>Updated {date(policy.updatedAt)}</small><footer>{canManage && policy.status !== "ARCHIVED" && <button className="secondary" onClick={() => setBuilder(policy)}>Edit</button>}{canManage && policy.status !== "ARCHIVED" && <button className="text-button danger" disabled={working === policy.id} onClick={() => void archive(policy)}>Archive</button>}</footer></article>)}{filteredPolicies.length === 0 && <section className="panel"><div className="empty-state">No approval policies match this view.</div></section>}</section>
      ) : (
        <section className="panel table-panel"><table><thead><tr><th>Request</th><th>Policy</th><th>Source</th><th>Stage</th><th>Due</th><th>Status</th>{tab === "inbox" && <th>Decision</th>}</tr></thead><tbody>{(tab === "inbox" ? actionable : requests).map((request) => { const policy = policies.find((item) => item.id === request.policyId); const stage = policy?.stages[request.currentStageIndex]; return <tr key={request.id}><td><div className="stack"><strong>{request.title}</strong><small>{request.description || request.id.slice(0, 8)}</small></div></td><td>{policy?.name ?? request.policyId.slice(0, 8)} · v{request.policyVersion}</td><td>{request.sourceType.replaceAll("_", " ")}</td><td>{stage?.name ?? (request.status === "PENDING" ? `Stage ${request.currentStageIndex + 1}` : "Complete")}</td><td><span className={request.isOverdue ? "danger-text" : ""}>{date(request.currentStageDueAt)}</span></td><td><span className={`status-pill ${request.status === "APPROVED" ? "approved" : request.status === "REJECTED" || request.status === "CANCELLED" ? "rejected" : "pending"}`}>{request.status}</span></td>{tab === "inbox" && <td><div className="approval-decision-actions"><button className="primary compact" disabled={working === request.id} onClick={() => void decide(request, "APPROVE")}><CheckCircle2 size={13} /> Approve</button><button className="secondary compact danger" disabled={working === request.id} onClick={() => void decide(request, "REJECT")}><XCircle size={13} /> Reject</button></div></td>}</tr>; })}{(tab === "inbox" ? actionable : requests).length === 0 && <tr><td colSpan={tab === "inbox" ? 7 : 6}><div className="empty-state"><FileCheck2 size={22} /> No approval requests in this view.</div></td></tr>}</tbody></table></section>
      )}

      {requestModal && <div className="modal-backdrop"><section className="modal-card approval-request-modal"><header><div><span className="eyebrow">Manual approval</span><h2>Create approval request</h2></div><button className="text-button" onClick={() => setRequestModal(false)}>Close</button></header><div className="approval-request-fields"><label>Policy<select value={requestPolicyId} onChange={(event) => setRequestPolicyId(event.target.value)}>{publishedPolicies.map((policy) => <option value={policy.id} key={policy.id}>{policy.name} · v{policy.version}</option>)}</select></label><label>Title<input value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} /></label><label>Description<textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} /></label><label>Context JSON<textarea className="approval-json" value={requestContext} onChange={(event) => setRequestContext(event.target.value)} spellCheck={false} /></label></div><footer><button className="secondary" onClick={() => setRequestModal(false)}>Cancel</button><button className="primary" disabled={working === "new-request" || !requestPolicyId || !requestTitle.trim()} onClick={() => void createRequest()}>Create request</button></footer></section></div>}
    </div>
  );
}
