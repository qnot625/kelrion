import {
  AlertTriangle,
  Building2,
  Check,
  CreditCard,
  KeyRound,
  Layers3,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  klerionApi,
  type ApiInvoice,
  type ApiModuleDefinition,
  type PlatformOrganisationSummary,
} from "../lib/api";
import {
  getPlatformOperationalReport,
  reconcilePlatformBilling,
  type ApiPlatformOperationalReport,
} from "../lib/billing-ops-api";
import type { ModuleKey } from "../lib/session";
import {
  clearPlatformSession,
  loadPlatformSession,
  savePlatformSession,
  type PlatformSession,
} from "../lib/platform-session";
import { Brand } from "../components/Brand";

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount / 100);
}

export function PlatformAdminView() {
  const [session, setSession] = useState<PlatformSession | null>(() => loadPlatformSession());
  const [authMode, setAuthMode] = useState<"login" | "bootstrap">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bootstrapKey, setBootstrapKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileNote, setReconcileNote] = useState("");
  const [error, setError] = useState("");

  const [modules, setModules] = useState<ApiModuleDefinition[]>([]);
  const [organisations, setOrganisations] = useState<PlatformOrganisationSummary[]>([]);
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [report, setReport] = useState<ApiPlatformOperationalReport | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformOrganisationSummary | null>(null);

  const loadData = useCallback(async (activeSession: PlatformSession) => {
    const [nextModules, nextOrganisations, nextInvoices, nextReport] = await Promise.all([
      klerionApi.listPlatformModules(activeSession),
      klerionApi.listPlatformOrganisations(activeSession),
      klerionApi.listPlatformInvoices(activeSession),
      getPlatformOperationalReport(activeSession),
    ]);
    setModules(nextModules);
    setOrganisations(nextOrganisations);
    setInvoices(nextInvoices);
    setReport(nextReport);
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadData(session).catch((cause) => {
      if (cause instanceof Error && cause.message.includes("Invalid or expired")) {
        clearPlatformSession();
        setSession(null);
      } else setError(cause instanceof Error ? cause.message : "Unable to load platform control plane.");
    });
  }, [session, loadData]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = authMode === "bootstrap"
        ? await klerionApi.platformBootstrap(email, password, bootstrapKey || undefined)
        : await klerionApi.platformLogin(email, password);
      savePlatformSession(next);
      setSession(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to authenticate platform administrator.");
    } finally {
      setBusy(false);
    }
  }

  async function reconcileBilling() {
    setReconciling(true);
    setError("");
    setReconcileNote("");
    try {
      const result = await reconcilePlatformBilling(session!);
      setReconcileNote(`Reconciled: ${result.trialsActivated} trials activated, ${result.renewalsCreated} renewals created, ${result.invoicesOverdue} invoices moved overdue, ${result.subscriptionsPastDue} subscriptions moved past due.`);
      await loadData(session!);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reconcile billing.");
    } finally {
      setReconciling(false);
    }
  }

  function signOut() {
    clearPlatformSession();
    setSession(null);
  }

  if (!session) {
    return <main className="platform-auth-page"><section><Brand /><span className="eyebrow"><ShieldCheck size={14} />Klerion platform control plane</span><h1>God administrator backend</h1><p>Provision organisations, control module entitlements, manage commercial status and reconcile invoices from one isolated platform workspace.</p></section><form onSubmit={authenticate}><div className="platform-auth-tabs"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Sign in</button><button type="button" className={authMode === "bootstrap" ? "active" : ""} onClick={() => setAuthMode("bootstrap")}>First-time bootstrap</button></div><span className="platform-auth-icon"><KeyRound /></span><h2>{authMode === "login" ? "Platform administrator access" : "Create the first God administrator"}</h2><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="root@klerion.com" /></label><label>Password<input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{authMode === "bootstrap" && <label>Bootstrap key<input value={bootstrapKey} onChange={(event) => setBootstrapKey(event.target.value)} placeholder="Required in production" /></label>}{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Authenticating…" : authMode === "login" ? "Open control plane" : "Create God admin"}</button><small>Organisation users cannot access this backend with tenant tokens.</small></form></main>;
  }

  const activeSubscriptions = (report?.subscriptions.byStatus.active ?? 0) + (report?.subscriptions.byStatus.trialing ?? 0);
  const liveModules = modules.filter((module) => module.availability === "live").length;

  return (
    <main className="platform-admin-page">
      <aside className="platform-sidebar"><Brand /><div className="platform-admin-badge"><ShieldCheck size={17} /><span><strong>God administrator</strong><small>{session.email}</small></span></div><nav><a href="#platform-overview">Overview</a><a href="#platform-organisations">Organisations</a><a href="#platform-invoices">Billing & invoices</a><a href="#platform-modules">Module catalogue</a></nav><button onClick={signOut}><LogOut size={16} />Sign out</button></aside>
      <section className="platform-workspace">
        <header><div><span className="eyebrow">Klerion platform operations</span><h1>Control plane</h1></div><div><button className="secondary" onClick={() => void loadData(session)}><RefreshCw size={15} />Refresh</button><button className="primary" onClick={() => setCreateOpen(true)}><Plus size={15} />Create organisation</button></div></header>
        {error && <div className="inline-alert">{error}</div>}
        {reconcileNote && <div className="inline-alert">{reconcileNote}</div>}
        <section id="platform-overview" className="platform-metrics"><article><Building2 /><span><small>Organisations</small><strong>{report?.organisations.total ?? organisations.length}</strong></span></article><article><Check /><span><small>Active / trialing</small><strong>{activeSubscriptions}</strong></span></article><article><Layers3 /><span><small>Live modules</small><strong>{liveModules}</strong></span></article><article><AlertTriangle /><span><small>Overdue invoices</small><strong>{report?.invoices.overdue ?? 0}</strong></span></article></section>

        {report && <section className="platform-section"><header><div><h2>Operational health</h2><p>Generated {new Date(report.generatedAt).toLocaleString()}. Revenue is never combined across currencies.</p></div></header><div className="platform-metrics"><article><CreditCard /><span><small>Past-due subscriptions</small><strong>{report.subscriptions.byStatus.past_due}</strong></span></article><article><Check /><span><small>Renewals in 30 days</small><strong>{report.subscriptions.renewalsWithin30Days}</strong></span></article><article><Check /><span><small>Trials ending in 30 days</small><strong>{report.subscriptions.trialsEndingWithin30Days}</strong></span></article><article><CreditCard /><span><small>Paid invoices</small><strong>{report.invoices.paid}</strong></span></article></div><div className="platform-module-grid">{report.currencies.map((metric) => <article key={metric.currency}><span><CreditCard size={18} /></span><div><strong>{metric.currency}</strong><p>MRR {money(metric.activeRecurringMonthlyEquivalent, metric.currency)} · ARR {money(metric.activeRecurringAnnualEquivalent, metric.currency)}</p><small>Invoiced {money(metric.invoiced, metric.currency)} · Paid {money(metric.paid, metric.currency)} · Outstanding {money(metric.outstanding, metric.currency)} · Overdue {money(metric.overdue, metric.currency)} ({metric.overdueInvoices})</small></div></article>)}</div></section>}

        <section id="platform-organisations" className="platform-section"><header><div><h2>Organisations</h2><p>Tenant status, owner provisioning and selected module entitlements.</p></div></header><div className="platform-table"><div className="platform-table-head"><span>Organisation</span><span>Status</span><span>Subscription</span><span>Modules</span><span>Actions</span></div>{organisations.map((organisation) => <div className="platform-table-row" key={organisation.id}><span><strong>{organisation.name}</strong><small>{organisation.slug}</small></span><em className={`tenant-status ${organisation.status}`}>{organisation.status}</em><span><strong>{organisation.subscription?.status ?? "none"}</strong><small>{organisation.subscription ? `${organisation.subscription.billingCycle} · ${organisation.subscription.currency}` : "No subscription"}</small></span><span className="module-count"><strong>{organisation.subscription?.enabledModules.length ?? 0}</strong><small>enabled</small></span><span className="row-actions"><button onClick={() => setEditing(organisation)}>Edit modules</button><button onClick={() => void klerionApi.updatePlatformOrganisationStatus(session, organisation.id, organisation.status === "suspended" ? "active" : "suspended").then(() => loadData(session))}>{organisation.status === "suspended" ? "Activate" : "Suspend"}</button></span></div>)}</div></section>

        <section id="platform-invoices" className="platform-section"><header><div><h2>Billing and invoices</h2><p>Automated lifecycle reconciliation runs on the API worker; this action is the immediate operational fallback.</p></div><button className="secondary" disabled={reconciling} onClick={() => void reconcileBilling()}><RefreshCw size={15} />{reconciling ? "Reconciling…" : "Reconcile billing now"}</button></header><div className="platform-table invoices"><div className="platform-table-head"><span>Invoice</span><span>Organisation</span><span>Status</span><span>Due</span><span>Amount</span><span>Action</span></div>{invoices.map((invoice) => { const organisation = organisations.find((item) => item.id === invoice.tenantId); return <div className="platform-table-row" key={invoice.id}><span><strong>{invoice.number}</strong><small>{invoice.billingCycle}</small></span><span><strong>{organisation?.name ?? invoice.tenantId}</strong><small>{organisation?.slug}</small></span><em className={`invoice-status ${invoice.status}`}>{invoice.status}</em><span>{new Date(invoice.dueAt).toLocaleDateString()}</span><strong>{money(invoice.amountDue, invoice.currency)}</strong><span>{invoice.status !== "paid" && invoice.status !== "void" ? <button onClick={() => { const reference = window.prompt("Enter the verified external payment reference"); if (reference) void klerionApi.markPlatformInvoicePaid(session, invoice.id, reference).then(() => loadData(session)); }}>Mark paid</button> : invoice.paymentReference}</span></div>; })}</div></section>

        <section id="platform-modules" className="platform-section"><header><div><h2>Module catalogue</h2><p>Only live modules can be enabled or billed. Preview modules remain visible for roadmap/demo awareness but are not commercially selectable.</p></div></header><div className="platform-module-grid">{modules.map((module) => { const adoption = report?.moduleAdoption.find((item) => item.key === module.key)?.enabledOrganisations ?? 0; return <article key={module.key}><span><Layers3 size={18} /></span><div><strong>{module.name}</strong><p>{module.description}</p><small>{module.dependencies.length ? `Requires ${module.dependencies.join(", ")} · ${adoption} organisations` : `No dependencies · ${adoption} organisations`}</small></div><em>{module.availability}</em></article>; })}</div></section>
      </section>

      {createOpen && <CreateOrganisationDialog session={session} modules={modules} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void loadData(session); }} />}
      {editing && <EditSubscriptionDialog session={session} organisation={editing} modules={modules} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void loadData(session); }} />}
    </main>
  );
}

function ModuleCheckboxes({ modules, selected, onToggle }: { readonly modules: readonly ApiModuleDefinition[]; readonly selected: readonly ModuleKey[]; readonly onToggle: (key: ModuleKey) => void }) {
  const groups = useMemo(() => [...new Set(modules.map((module) => module.category))], [modules]);
  return <div className="platform-module-selector">{groups.map((group) => <fieldset key={group}><legend>{group.replace(/-/g, " ")}</legend>{modules.filter((module) => module.category === group).map((module) => { const selectable = module.availability === "live"; return <label key={module.key}><input type="checkbox" disabled={!selectable} checked={selectable && selected.includes(module.key)} onChange={() => selectable && onToggle(module.key)} /><span><strong>{module.name}{!selectable ? " · preview" : ""}</strong><small>{module.description}</small></span></label>; })}</fieldset>)}</div>;
}

function CreateOrganisationDialog({ session, modules, onClose, onCreated }: { readonly session: PlatformSession; readonly modules: readonly ApiModuleDefinition[]; readonly onClose: () => void; readonly onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [selected, setSelected] = useState<ModuleKey[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await klerionApi.createPlatformOrganisation(session, { name, slug, ownerEmail, ownerPassword, enabledModules: selected, billingCycle: "monthly", currency: "NGN", trialDays: 14 });
      onCreated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create organisation."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><form className="platform-dialog" onSubmit={submit}><header><div><h2>Create organisation</h2><p>Provision the tenant, first owner, subscription and initial invoice together.</p></div><button type="button" onClick={onClose}>Close</button></header><div className="dialog-form-grid"><label>Organisation name<input required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Slug<input required value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} /></label><label>Owner email<input type="email" required value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} /></label><label>Temporary owner password<input type="password" minLength={8} required value={ownerPassword} onChange={(event) => setOwnerPassword(event.target.value)} /></label></div><ModuleCheckboxes modules={modules} selected={selected} onToggle={(key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} />{error && <div className="form-error">{error}</div>}<footer><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy || selected.length === 0}><Plus size={15} />{busy ? "Creating…" : "Create organisation"}</button></footer></form></div>;
}

function EditSubscriptionDialog({ session, organisation, modules, onClose, onSaved }: { readonly session: PlatformSession; readonly organisation: PlatformOrganisationSummary; readonly modules: readonly ApiModuleDefinition[]; readonly onClose: () => void; readonly onSaved: () => void }) {
  const liveModuleKeys = useMemo(() => new Set(modules.filter((module) => module.availability === "live").map((module) => module.key)), [modules]);
  const [selected, setSelected] = useState<ModuleKey[]>(() => [...(organisation.subscription?.enabledModules ?? [])].filter((key) => liveModuleKeys.has(key)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { await klerionApi.updatePlatformSubscription(session, organisation.id, { enabledModules: selected }); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update subscription."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="platform-dialog"><header><div><h2>Edit {organisation.name}</h2><p>Dependencies will be added automatically. Preview modules cannot be enabled on live subscriptions.</p></div><button onClick={onClose}>Close</button></header><ModuleCheckboxes modules={modules} selected={selected} onToggle={(key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} />{error && <div className="form-error">{error}</div>}<footer><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={() => void save()}><Save size={15} />{busy ? "Saving…" : "Save entitlements"}</button></footer></section></div>;
}
