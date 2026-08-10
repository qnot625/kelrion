import { AlertTriangle, Clock3, Headphones, Loader2, MessageSquare, Plus, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { ServiceDeskCatalogPanel } from "./ServiceDeskCatalogPanel";
import { serviceDeskApi, type ApiServiceDeskPriority, type ApiServiceDeskSlaPolicy, type ApiServiceDeskStatus, type ApiServiceDeskTicket, type ApiServiceDeskTicketType } from "./serviceDeskApi";

const STATUSES: readonly ApiServiceDeskStatus[] = ["OPEN", "IN_PROGRESS", "PENDING_REQUESTER", "PENDING_THIRD_PARTY", "RESOLVED", "CLOSED", "CANCELLED"];
const TYPES: readonly ApiServiceDeskTicketType[] = ["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE_REQUEST"];
const PRIORITIES: readonly ApiServiceDeskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

function statusClass(status: ApiServiceDeskStatus) {
  if (status === "RESOLVED" || status === "CLOSED") return "approved";
  if (status === "CANCELLED") return "rejected";
  return "pending";
}

function priorityClass(priority: ApiServiceDeskPriority) {
  return priority === "URGENT" || priority === "HIGH" ? "rejected" : priority === "MEDIUM" ? "pending" : "approved";
}

export function ServiceDeskView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [tickets, setTickets] = useState<ApiServiceDeskTicket[]>([]);
  const [slas, setSlas] = useState<ApiServiceDeskSlaPolicy[]>([]);
  const [tab, setTab] = useState<"tickets" | "catalog" | "sla">("tickets");
  const [scope, setScope] = useState<"mine" | "assigned" | "all">(canManage ? "all" : "mine");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ApiServiceDeskStatus>("ALL");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ApiServiceDeskTicket | null>(null);
  const [newTicket, setNewTicket] = useState(false);
  const [ticketType, setTicketType] = useState<ApiServiceDeskTicketType>("SERVICE_REQUEST");
  const [priority, setPriority] = useState<ApiServiceDeskPriority>("MEDIUM");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [comment, setComment] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<"REQUESTER" | "INTERNAL">("REQUESTER");
  const [newSla, setNewSla] = useState(false);
  const [slaName, setSlaName] = useState("");
  const [slaFirst, setSlaFirst] = useState(60);
  const [slaResolution, setSlaResolution] = useState(480);

  async function load() {
    setLoading(true); setError("");
    try {
      if (session.mode === "demo") { setTickets([]); setSlas([]); }
      else {
        const [ticketList, slaList] = await Promise.all([
          serviceDeskApi.listTickets(session, canManage ? scope : "mine", statusFilter === "ALL" ? undefined : statusFilter),
          canManage ? serviceDeskApi.listSlaPolicies(session) : Promise.resolve([]),
        ]);
        setTickets(ticketList); setSlas(slaList);
        if (selected) setSelected(ticketList.find((ticket) => ticket.id === selected.id) ?? selected);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load the service desk"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [session.token, canManage, scope, statusFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? tickets.filter((ticket) => `${ticket.reference} ${ticket.subject} ${ticket.description} ${ticket.categoryKey ?? ""}`.toLowerCase().includes(q)) : tickets;
  }, [tickets, query]);

  const open = tickets.filter((ticket) => !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status)).length;
  const urgent = tickets.filter((ticket) => ticket.priority === "URGENT" && !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status)).length;
  const breached = tickets.filter((ticket) => ticket.escalationLevel >= 2 && !["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.status)).length;
  const awaiting = tickets.filter((ticket) => ticket.status === "PENDING_REQUESTER").length;

  async function createTicket() {
    setWorking("new-ticket"); setError("");
    try {
      const created = await serviceDeskApi.createTicket(session, { type: ticketType, priority, subject, description, categoryKey: category.trim() || null });
      setNewTicket(false); setSubject(""); setDescription(""); setCategory(""); setSelected(created); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create ticket"); }
    finally { setWorking(""); }
  }

  async function addComment() {
    if (!selected || !comment.trim()) return;
    setWorking(selected.id); setError("");
    try { const updated = await serviceDeskApi.addComment(session, selected.id, comment, commentVisibility); setSelected(updated); setComment(""); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add comment"); }
    finally { setWorking(""); }
  }

  async function transition(status: ApiServiceDeskStatus) {
    if (!selected) return;
    setWorking(selected.id); setError("");
    try { const updated = await serviceDeskApi.transitionTicket(session, selected.id, status); setSelected(updated); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not change ticket status"); }
    finally { setWorking(""); }
  }

  async function assignToMe() {
    if (!selected || !session.userId) return;
    setWorking(selected.id); setError("");
    try { const updated = await serviceDeskApi.assignTicket(session, selected.id, { assigneeUserId: session.userId }); setSelected(updated); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not assign ticket"); }
    finally { setWorking(""); }
  }

  async function createSla() {
    setWorking("new-sla"); setError("");
    try {
      await serviceDeskApi.createSlaPolicy(session, { name: slaName, firstResponseMinutes: slaFirst, resolutionMinutes: slaResolution, pauseStatuses: ["PENDING_REQUESTER", "PENDING_THIRD_PARTY"], escalationThresholds: [80, 100, 125] });
      setNewSla(false); setSlaName(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create SLA policy"); }
    finally { setWorking(""); }
  }

  return (
    <div className="view service-desk-view">
      <div className="view-heading">
        <div><span className="eyebrow">Internal operations</span><h1>Service desk</h1><p>Manage incidents, internal requests, problems and governed change work with assignment, requester conversations, SLA clocks and escalation.</p></div>
        <button className="primary" onClick={() => setNewTicket(true)}><Plus size={16} /> New ticket</button>
      </div>

      <div className="lifecycle-metrics">
        <article><span><Headphones size={18} /></span><div><small>Open work</small><strong>{open}</strong><em>active tickets</em></div></article>
        <article><span><AlertTriangle size={18} /></span><div><small>Urgent</small><strong>{urgent}</strong><em>needs priority</em></div></article>
        <article><span><Clock3 size={18} /></span><div><small>SLA risk</small><strong>{breached}</strong><em>at / beyond breach</em></div></article>
        <article><span><UserRound size={18} /></span><div><small>Waiting on requester</small><strong>{awaiting}</strong><em>SLA clock paused</em></div></article>
      </div>
      {error && <div className="form-error">{error}</div>}

      <div className="toolbar lifecycle-toolbar service-desk-toolbar">
        <div className="segmented-control"><button className={tab === "tickets" ? "active" : ""} onClick={() => setTab("tickets")}>Tickets</button><button className={tab === "catalog" ? "active" : ""} onClick={() => setTab("catalog")}>Request catalogue</button>{canManage && <button className={tab === "sla" ? "active" : ""} onClick={() => setTab("sla")}>SLA policies</button>}</div>
        {tab === "tickets" && <><label className="global-search" style={{ maxWidth: 340 }}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets" /></label>{canManage && <select value={scope} onChange={(event) => setScope(event.target.value as "mine" | "assigned" | "all")}><option value="all">All tickets</option><option value="assigned">Assigned to me</option><option value="mine">Requested by me</option></select>}<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "ALL" | ApiServiceDeskStatus)}><option value="ALL">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></>}
        {tab === "sla" && <button className="primary compact" onClick={() => setNewSla(true)}><Plus size={14} /> New SLA</button>}
      </div>

      {loading ? <section className="panel"><div className="empty-state"><Loader2 className="spin" /> Loading service desk…</div></section> : tab === "tickets" ? (
        <section className="panel table-panel"><table><thead><tr><th>Ticket</th><th>Type</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Resolution due</th><th>Updated</th></tr></thead><tbody>{filtered.map((ticket) => <tr key={ticket.id} className="service-desk-ticket-row" onClick={() => setSelected(ticket)}><td><div className="stack"><strong>{ticket.reference} · {ticket.subject}</strong><small>{ticket.categoryKey || "Uncategorised"}</small></div></td><td>{ticket.type.replaceAll("_", " ")}</td><td><span className={`status-pill ${priorityClass(ticket.priority)}`}>{ticket.priority}</span></td><td><span className={`status-pill ${statusClass(ticket.status)}`}>{ticket.status.replaceAll("_", " ")}</span></td><td>{ticket.assigneeUserId === session.userId ? "Me" : ticket.assigneeUserId?.slice(0, 8) ?? "Unassigned"}</td><td><div className="stack"><span>{date(ticket.resolutionDueAt)}</span>{ticket.escalationLevel > 0 && <small className="danger-text">Escalation L{ticket.escalationLevel}</small>}</div></td><td>{date(ticket.updatedAt)}</td></tr>)}{filtered.length === 0 && <tr><td colSpan={7}><div className="empty-state">No service desk tickets match this view.</div></td></tr>}</tbody></table></section>
      ) : tab === "catalog" ? (
        <ServiceDeskCatalogPanel session={session} canManage={canManage} onTicketCreated={(ticket) => { setSelected(ticket); setTab("tickets"); void load(); }} />
      ) : (
        <section className="forms-card-grid">{slas.map((sla) => <article className="panel forms-card" key={sla.id}><header><div className="stack"><strong>{sla.name}</strong><small>{sla.description || "General SLA policy"}</small></div><span className={`status-pill ${sla.enabled ? "approved" : "rejected"}`}>{sla.enabled ? "ACTIVE" : "DISABLED"}</span></header><div className="forms-card-meta"><span>First response<b>{sla.firstResponseMinutes}m</b></span><span>Resolution<b>{sla.resolutionMinutes}m</b></span><span>Escalations<b>{sla.escalationThresholds.length}</b></span></div><small>{sla.ticketTypes.length ? sla.ticketTypes.join(", ") : "All ticket types"} · {sla.priorities.length ? sla.priorities.join(", ") : "All priorities"}</small></article>)}{slas.length === 0 && <section className="panel"><div className="empty-state">No SLA policies have been configured.</div></section>}</section>
      )}

      {selected && <div className="service-desk-drawer-backdrop" onClick={() => setSelected(null)}><aside className="service-desk-drawer" onClick={(event) => event.stopPropagation()}><header><div><span className="eyebrow">{selected.reference}</span><h2>{selected.subject}</h2><div className="ticket-badges"><span className={`status-pill ${priorityClass(selected.priority)}`}>{selected.priority}</span><span className={`status-pill ${statusClass(selected.status)}`}>{selected.status.replaceAll("_", " ")}</span></div></div><button className="text-button" onClick={() => setSelected(null)}>Close</button></header><p className="service-desk-description">{selected.description || "No description supplied."}</p><div className="ticket-detail-grid"><div><small>Type</small><strong>{selected.type.replaceAll("_", " ")}</strong></div><div><small>Assignee</small><strong>{selected.assigneeUserId === session.userId ? "Me" : selected.assigneeUserId?.slice(0, 8) ?? "Unassigned"}</strong></div><div><small>First response</small><strong>{selected.firstRespondedAt ? date(selected.firstRespondedAt) : `Due ${date(selected.firstResponseDueAt)}`}</strong></div><div><small>Resolution</small><strong>{selected.resolvedAt ? date(selected.resolvedAt) : `Due ${date(selected.resolutionDueAt)}`}</strong></div></div>{canManage && <div className="ticket-operator-actions"><button className="secondary compact" onClick={() => void assignToMe()}>Assign to me</button><select value={selected.status} onChange={(event) => void transition(event.target.value as ApiServiceDeskStatus)}>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>}<section className="ticket-conversation"><h3><MessageSquare size={16} /> Conversation</h3><div className="ticket-comments">{selected.comments.map((item) => <article className={`ticket-comment ${item.visibility.toLowerCase()}`} key={item.id}><header><strong>{item.authorUserId === session.userId ? "You" : item.authorUserId.slice(0, 8)}</strong><span>{item.visibility === "INTERNAL" ? "Internal note" : "Requester-visible"} · {date(item.createdAt)}</span></header><p>{item.body}</p></article>)}{selected.comments.length === 0 && <div className="empty-state small">No conversation yet.</div>}</div><div className="ticket-comment-composer">{canManage && <select value={commentVisibility} onChange={(event) => setCommentVisibility(event.target.value as "REQUESTER" | "INTERNAL")}><option value="REQUESTER">Reply to requester</option><option value="INTERNAL">Internal note</option></select>}<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a reply or note" /><button className="primary" disabled={!comment.trim() || working === selected.id} onClick={() => void addComment()}>Send</button></div></section></aside></div>}

      {newTicket && <div className="modal-backdrop"><section className="modal-card service-desk-modal"><header><div><span className="eyebrow">New internal request</span><h2>Create ticket</h2></div><button className="text-button" onClick={() => setNewTicket(false)}>Close</button></header><div className="service-desk-form-grid"><label>Type<select value={ticketType} onChange={(event) => setTicketType(event.target.value as ApiServiceDeskTicketType)}>{TYPES.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as ApiServiceDeskPriority)}>{PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label className="wide">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="wide">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="wide">Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. IT, HR, Facilities" /></label></div><footer><button className="secondary" onClick={() => setNewTicket(false)}>Cancel</button><button className="primary" disabled={!subject.trim() || working === "new-ticket"} onClick={() => void createTicket()}>Create ticket</button></footer></section></div>}

      {newSla && <div className="modal-backdrop"><section className="modal-card service-desk-modal"><header><div><span className="eyebrow">Service target</span><h2>New SLA policy</h2></div><button className="text-button" onClick={() => setNewSla(false)}>Close</button></header><div className="service-desk-form-grid"><label className="wide">Name<input value={slaName} onChange={(event) => setSlaName(event.target.value)} /></label><label>First response (minutes)<input type="number" min={1} value={slaFirst} onChange={(event) => setSlaFirst(Number(event.target.value))} /></label><label>Resolution (minutes)<input type="number" min={1} value={slaResolution} onChange={(event) => setSlaResolution(Number(event.target.value))} /></label></div><footer><button className="secondary" onClick={() => setNewSla(false)}>Cancel</button><button className="primary" disabled={!slaName.trim() || slaFirst < 1 || slaResolution < slaFirst || working === "new-sla"} onClick={() => void createSla()}>Create SLA</button></footer></section></div>}
    </div>
  );
}
