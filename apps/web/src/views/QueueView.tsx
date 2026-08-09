import {
  ArrowRightLeft,
  BellRing,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Cog,
  ExternalLink,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Settings2,
  SkipForward,
  TicketCheck,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { queueApi, type QueueConfiguration, type QueueEntry, type QueuePriority } from "../features/queue/queueApi";
import "../features/queue/queue.css";
import { klerionApi, type ApiBranch, type ApiDepartment, type ApiService } from "../lib/api";
import type { KlerionSession } from "../lib/session";

type QueueTab = "mine" | "staff" | "setup" | "kiosk" | "display";
const ACTIVE_STATUSES = new Set(["WAITING", "CALLED", "SERVING"]);

function when(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

function statusClass(status: QueueEntry["status"]) {
  if (status === "COMPLETED") return "approved";
  if (status === "CANCELLED" || status === "NO_SHOW") return "rejected";
  return "pending";
}

export function QueueView({ session }: { readonly session: KlerionSession }) {
  const canOperate = session.roles.some((role) => role === "owner" || role === "staff");
  const canManage = canOperate;
  const [tab, setTab] = useState<QueueTab>("mine");
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);
  const [branchServices, setBranchServices] = useState<ApiService[]>([]);
  const [departments, setDepartments] = useState<ApiDepartment[]>([]);
  const [configurations, setConfigurations] = useState<QueueConfiguration[]>([]);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [stationId, setStationId] = useState("Desk 1");
  const [appointmentId, setAppointmentId] = useState("");
  const [kioskName, setKioskName] = useState("");
  const [kioskEmail, setKioskEmail] = useState("");
  const [kioskPhone, setKioskPhone] = useState("");
  const [prefix, setPrefix] = useState("Q");
  const [averageServiceMinutes, setAverageServiceMinutes] = useState(10);
  const [maxConcurrentServing, setMaxConcurrentServing] = useState(1);
  const [allowWalkIns, setAllowWalkIns] = useState(true);
  const [allowAppointmentCheckIn, setAllowAppointmentCheckIn] = useState(true);
  const [lastTicket, setLastTicket] = useState<QueueEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [eventSequence, setEventSequence] = useState(0);

  const branchName = useCallback((id: string) => branches.find((item) => item.id === id)?.name ?? id, [branches]);
  const serviceName = useCallback((id: string) => services.find((item) => item.id === id)?.name ?? branchServices.find((item) => item.id === id)?.name ?? id, [services, branchServices]);

  const loadBranches = useCallback(async () => {
    if (session.mode !== "live") return;
    const [nextBranches, nextServices] = await Promise.all([klerionApi.listBranches(session), klerionApi.listServices(session)]);
    setBranches(nextBranches.filter((item) => item.status === "active"));
    setServices(nextServices.filter((item) => item.status === "active"));
    setBranchId((current) => current || nextBranches.find((item) => item.status === "active")?.id || "");
  }, [session.token]);

  const loadBranchContext = useCallback(async (nextBranchId: string) => {
    if (session.mode !== "live" || !nextBranchId) return;
    const [offered, nextDepartments, configs, nextEntries] = await Promise.all([
      klerionApi.listBranchServices(session, nextBranchId),
      klerionApi.listDepartments(session, nextBranchId),
      queueApi.configurations(session, nextBranchId),
      queueApi.entries(session, nextBranchId),
    ]);
    setBranchServices(offered.filter((item) => item.status === "active"));
    setDepartments(nextDepartments);
    setConfigurations(configs);
    setEntries(nextEntries);
    setServiceId((current) => offered.some((item) => item.id === current) ? current : offered.find((item) => item.status === "active")?.id || "");
  }, [session.token]);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      await loadBranches();
      if (branchId) await loadBranchContext(branchId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load Queue workspace"); }
    finally { setLoading(false); }
  }, [branchId, loadBranches, loadBranchContext]);

  useEffect(() => { void loadBranches().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load branches")); }, [loadBranches]);
  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    setLoading(true);
    void loadBranchContext(branchId).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load queue")).finally(() => setLoading(false));
  }, [branchId, loadBranchContext]);

  useEffect(() => {
    if (session.mode !== "live" || !session.token || !branchId) return;
    const controller = new AbortController();
    void queueApi.stream(session, eventSequence, { branchId }, (event) => {
      setEventSequence((value) => Math.max(value, event.sequence));
      void loadBranchContext(branchId).catch(() => undefined);
    }, controller.signal).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Queue realtime stream disconnected");
    });
    return () => controller.abort();
  }, [session.token, branchId]);

  const myEntries = useMemo(() => entries.filter((item) => item.customer.userId === session.userId), [entries, session.userId]);
  const activeMine = useMemo(() => myEntries.filter((item) => ACTIVE_STATUSES.has(item.status)), [myEntries]);
  const selectedQueue = useMemo(() => entries.filter((item) => !serviceId || item.serviceId === serviceId), [entries, serviceId]);
  const waiting = selectedQueue.filter((item) => item.status === "WAITING");
  const called = selectedQueue.filter((item) => item.status === "CALLED");
  const serving = selectedQueue.filter((item) => item.status === "SERVING");
  const selectedConfig = configurations.find((item) => item.serviceId === serviceId && (departmentId ? item.departmentId === departmentId : true));

  async function run(key: string, action: () => Promise<unknown>) {
    setWorking(key); setError("");
    try { await action(); if (branchId) await loadBranchContext(branchId); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Queue operation failed"); }
    finally { setWorking(""); }
  }

  async function selfCheckIn() {
    if (!branchId || !serviceId) return;
    await run("self-checkin", async () => {
      const created = await queueApi.checkInWalkIn(session, { branchId, serviceId, departmentId: departmentId || null, source: "PUBLIC", idempotencyKey: crypto.randomUUID() });
      setLastTicket(created);
    });
  }

  async function appointmentCheckIn() {
    if (!appointmentId.trim()) return;
    await run("appointment-checkin", async () => {
      const created = await queueApi.checkInAppointment(session, appointmentId.trim(), "PUBLIC");
      setLastTicket(created);
    });
  }

  async function kioskCheckIn() {
    if (!branchId || !serviceId) return;
    await run("kiosk-checkin", async () => {
      const created = await queueApi.checkInWalkIn(session, {
        branchId,
        serviceId,
        departmentId: departmentId || null,
        source: "KIOSK",
        idempotencyKey: crypto.randomUUID(),
        customer: { name: kioskName || null, email: kioskEmail || null, phone: kioskPhone || null },
      });
      setLastTicket(created); setKioskName(""); setKioskEmail(""); setKioskPhone("");
    });
  }

  async function createConfiguration() {
    if (!branchId || !serviceId || !prefix.trim()) return;
    await run("create-config", async () => {
      await queueApi.createConfiguration(session, {
        branchId, serviceId, departmentId: departmentId || null, prefix: prefix.trim(), averageServiceMinutes,
        allowWalkIns, allowAppointmentCheckIn, maxConcurrentServing,
      });
    });
  }

  async function perform(entry: QueueEntry, action: "recall" | "start" | "complete" | "no-show" | "cancel") {
    await run(`${action}-${entry.id}`, async () => {
      if (action === "recall") await queueApi.recall(session, entry.id, stationId);
      else if (action === "start") await queueApi.start(session, entry.id, stationId);
      else if (action === "complete") await queueApi.complete(session, entry.id);
      else if (action === "no-show") await queueApi.noShow(session, entry.id);
      else await queueApi.cancel(session, entry.id, "Cancelled from Queue console");
    });
  }

  async function setPriority(entry: QueueEntry, priority: QueuePriority) {
    await run(`priority-${entry.id}`, () => queueApi.priority(session, entry.id, priority));
  }

  async function transfer(entry: QueueEntry) {
    if (!branchId || !serviceId) return;
    await run(`transfer-${entry.id}`, () => queueApi.transfer(session, entry.id, { branchId, serviceId, departmentId: departmentId || null }));
  }

  if (session.mode === "demo") return <div className="view"><div className="view-heading"><div><span className="eyebrow live"><i />Live operations</span><h1>Virtual queue</h1><p>The Queue workspace uses authenticated live state, durable events and role-specific operations. Sign into a provisioned organisation to operate it.</p></div></div><section className="panel"><div className="empty-state"><TicketCheck size={24} /> Live queue operations are unavailable in preview mode.</div></section></div>;

  return <div className="view">
    <div className="view-heading">
      <div><span className="eyebrow live"><i />Realtime queue</span><h1>Virtual queue</h1><p>Check in customers, run service stations, manage queue capacity, operate a kiosk, and drive privacy-safe public displays from one durable queue.</p></div>
      <div className="view-heading-actions"><button className="secondary" onClick={() => void refresh()}><RefreshCw size={16} /> Refresh</button>{branchId && <a className="secondary" href={`#queue-display/${encodeURIComponent(session.tenantSlug)}/${encodeURIComponent(branchId)}${serviceId ? `/${encodeURIComponent(serviceId)}` : ""}`}><ExternalLink size={16} /> Public display</a>}</div>
    </div>

    <div className="lifecycle-metrics">
      <article><span><UsersRound size={18} /></span><div><small>Waiting</small><strong>{waiting.length}</strong><em>selected queue</em></div></article>
      <article><span><BellRing size={18} /></span><div><small>Called</small><strong>{called.length}</strong><em>awaiting arrival</em></div></article>
      <article><span><Play size={18} /></span><div><small>Serving</small><strong>{serving.length}</strong><em>in service</em></div></article>
      <article><span><Cog size={18} /></span><div><small>Configurations</small><strong>{configurations.length}</strong><em>{branchId ? branchName(branchId) : "select branch"}</em></div></article>
    </div>

    {error && <div className="form-error">{error}</div>}
    <div className="queue-tabs"><button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}><UserRound size={15} /> My ticket</button>{canOperate && <button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}><ClipboardList size={15} /> Staff console</button>}{canManage && <button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}><Settings2 size={15} /> Queue setup</button>}{canManage && <button className={tab === "kiosk" ? "active" : ""} onClick={() => setTab("kiosk")}><ScanLine size={15} /> Kiosk</button>}<button className={tab === "display" ? "active" : ""} onClick={() => setTab("display")}><Monitor size={15} /> Display</button></div>

    <section className="panel"><div className="queue-filter-row"><label>Branch <select value={branchId} onChange={(event) => { setBranchId(event.target.value); setDepartmentId(""); }}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Service <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">All services</option>{branchServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>{departments.length > 0 && <label>Department <select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">General queue</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}{canOperate && <label>Station <input value={stationId} onChange={(event) => setStationId(event.target.value)} placeholder="Desk 1" /></label>}</div></section>

    {loading ? <section className="panel"><div className="empty-state">Loading Queue workspace…</div></section> : tab === "mine" ? <div className="queue-grid">
      <section className="panel queue-column"><header><h2>Check in</h2><TicketCheck size={18} /></header><p className="queue-muted">Join an available walk-in queue or check in an existing appointment by its reference.</p><div className="queue-kiosk-actions"><button className="primary" disabled={!branchId || !serviceId || working === "self-checkin" || selectedConfig?.allowWalkIns === false} onClick={() => void selfCheckIn()}><Plus size={16} /> Join walk-in queue</button></div><hr /><label>Appointment reference<input value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} placeholder="Appointment ID" /></label><button className="secondary" disabled={!appointmentId.trim() || working === "appointment-checkin"} onClick={() => void appointmentCheckIn()}><TicketCheck size={16} /> Check in appointment</button></section>
      <section className="panel queue-column"><header><h2>Active tickets</h2><Clock3 size={18} /></header>{activeMine.map((entry) => <article className={`queue-card ${entry.status.toLowerCase()}`} key={entry.id}><div className="queue-card-head"><span className="queue-ticket">{entry.ticketNumber}</span><span className={`status-pill ${statusClass(entry.status)}`}>{entry.status}</span></div><p>{serviceName(entry.serviceId)}</p><small>{entry.stationId ? `Proceed to ${entry.stationId}` : `Checked in ${when(entry.checkedInAt)}`}</small><div className="queue-card-actions"><button className="secondary" disabled={working === `cancel-${entry.id}`} onClick={() => void perform(entry, "cancel")}><XCircle size={14} /> Cancel</button></div><div className="queue-copy-link">Tracking token: {entry.publicToken}</div></article>)}{activeMine.length === 0 && <div className="queue-empty">No active queue ticket for this branch.</div>}</section>
      <section className="panel queue-column"><header><h2>Recent history</h2><CheckCircle2 size={18} /></header>{myEntries.filter((entry) => !ACTIVE_STATUSES.has(entry.status)).slice(0, 8).map((entry) => <article className="queue-card" key={entry.id}><div className="queue-card-head"><strong>{entry.ticketNumber}</strong><span className={`status-pill ${statusClass(entry.status)}`}>{entry.status}</span></div><small>{serviceName(entry.serviceId)} · {when(entry.updatedAt)}</small></article>)}{myEntries.filter((entry) => !ACTIVE_STATUSES.has(entry.status)).length === 0 && <div className="queue-empty">No completed tickets yet.</div>}</section>
    </div> : tab === "staff" && canOperate ? <>
      <section className="panel"><header><div><h2>Service station</h2><p>Call the highest-ranked waiting customer for the selected service.</p></div><button className="primary" disabled={!branchId || !serviceId || !stationId.trim() || working === "call-next"} onClick={() => void run("call-next", () => queueApi.callNext(session, { branchId, serviceId, stationId }))}><SkipForward size={16} /> Call next</button></header></section>
      <div className="queue-grid"><QueueColumn title="Waiting" icon={<UsersRound size={17} />} entries={waiting} serviceName={serviceName} working={working} actions={(entry) => <><button onClick={() => void setPriority(entry, entry.priority === "URGENT" ? "STANDARD" : "URGENT")}>Priority</button><button onClick={() => void transfer(entry)}><ArrowRightLeft size={13} /> Transfer</button></>} /><QueueColumn title="Called" icon={<BellRing size={17} />} entries={called} serviceName={serviceName} working={working} actions={(entry) => <><button onClick={() => void perform(entry, "recall")}><RotateCcw size={13} /> Recall</button><button className="primary" onClick={() => void perform(entry, "start")}><Play size={13} /> Start</button><button onClick={() => void perform(entry, "no-show")}>No-show</button></>} /><QueueColumn title="Serving" icon={<Play size={17} />} entries={serving} serviceName={serviceName} working={working} actions={(entry) => <button className="primary" onClick={() => void perform(entry, "complete")}><CheckCircle2 size={13} /> Complete</button>} /></div>
    </> : tab === "setup" && canManage ? <section className="panel"><header><div><h2>Queue configuration</h2><p>Create one queue per branch, service and optional department.</p></div></header><div className="queue-setup-form"><label>Ticket prefix<input maxLength={5} value={prefix} onChange={(event) => setPrefix(event.target.value.toUpperCase())} /></label><label>Average service minutes<input type="number" min={1} value={averageServiceMinutes} onChange={(event) => setAverageServiceMinutes(Number(event.target.value))} /></label><label>Concurrent serving<input type="number" min={1} value={maxConcurrentServing} onChange={(event) => setMaxConcurrentServing(Number(event.target.value))} /></label><label><span><input type="checkbox" checked={allowWalkIns} onChange={(event) => setAllowWalkIns(event.target.checked)} /> Allow walk-ins</span></label><label><span><input type="checkbox" checked={allowAppointmentCheckIn} onChange={(event) => setAllowAppointmentCheckIn(event.target.checked)} /> Appointment check-in</span></label><div><button className="primary" disabled={!branchId || !serviceId || !prefix || working === "create-config"} onClick={() => void createConfiguration()}><Plus size={16} /> Create queue</button></div></div><div className="queue-config-list">{configurations.map((config) => <div className="queue-config-row" key={config.id}><strong>{serviceName(config.serviceId)}</strong><span>{config.departmentId ? departments.find((department) => department.id === config.departmentId)?.name ?? config.departmentId : "General"}</span><span>{config.prefix}</span><span>{config.averageServiceMinutes} min</span><span>{config.maxConcurrentServing} serving</span></div>)}{configurations.length === 0 && <div className="queue-empty">No queue configuration at this branch yet.</div>}</div></section>
    : tab === "kiosk" && canManage ? <div className="queue-kiosk"><section className="panel"><header><div><h2>Check-in kiosk</h2><p>Authenticated shared-terminal mode. Customers do not receive administrative access.</p></div><ScanLine size={24} /></header>{lastTicket && <div className="queue-ticket-hero"><span>Ticket issued</span><strong>{lastTicket.ticketNumber}</strong><div className="queue-status">{lastTicket.status}</div><small>{serviceName(lastTicket.serviceId)}</small></div>}<div className="queue-form-grid"><label>Name<input value={kioskName} onChange={(event) => setKioskName(event.target.value)} placeholder="Optional" /></label><label>Email<input value={kioskEmail} onChange={(event) => setKioskEmail(event.target.value)} placeholder="Optional" /></label><label>Phone<input value={kioskPhone} onChange={(event) => setKioskPhone(event.target.value)} placeholder="Optional" /></label><div className="queue-kiosk-actions"><button className="primary" disabled={!branchId || !serviceId || working === "kiosk-checkin"} onClick={() => void kioskCheckIn()}><TicketCheck size={17} /> Issue ticket</button></div></div></section></div>
    : <div className="queue-display"><header><div><h2>{branchId ? branchName(branchId) : "Queue display"}</h2><span className="queue-display-waiting"><span className="queue-live-dot" />{waiting.length} waiting</span></div><Monitor size={30} /></header><div className="queue-display-grid">{[...called, ...serving].map((entry) => <article className="queue-display-card" key={entry.id}><strong>{entry.ticketNumber}</strong><span>{entry.status === "CALLED" ? "Please proceed" : "Now serving"}</span><span className="queue-station">{entry.stationId ?? "Service point"}</span></article>)}{called.length + serving.length === 0 && <div className="queue-empty">No tickets are currently being called or served.</div>}</div></div>}
  </div>;
}

function QueueColumn({ title, icon, entries, serviceName, working, actions }: {
  readonly title: string;
  readonly icon: ReactNode;
  readonly entries: readonly QueueEntry[];
  readonly serviceName: (id: string) => string;
  readonly working: string;
  readonly actions: (entry: QueueEntry) => ReactNode;
}) {
  return <section className="panel queue-column"><header><h2>{title}</h2>{icon}</header>{entries.map((entry) => <article className={`queue-card ${entry.status.toLowerCase()}`} key={entry.id}><div className="queue-card-head"><span className="queue-ticket">{entry.ticketNumber}</span><span className={`status-pill ${statusClass(entry.status)}`}>{entry.status}</span></div><p>{serviceName(entry.serviceId)}</p><small>{entry.customer.name || entry.customer.email || "Customer"}{entry.stationId ? ` · ${entry.stationId}` : ""}</small><div className="queue-card-actions" aria-busy={working.endsWith(entry.id)}>{actions(entry)}</div></article>)}{entries.length === 0 && <div className="queue-empty">No {title.toLowerCase()} tickets.</div>}</section>;
}
