import {
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
  const [error, setError] = useState("");

  const [modules, setModules] = useState<ApiModuleDefinition[]>([]);
  const [organisations, setOrganisations] = useState<PlatformOrganisationSummary[]>([]);
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformOrganisationSummary | null>(null);

  const loadData = useCallback(async (activeSession: PlatformSession) => {
    const [nextModules, nextOrganisations, nextInvoices] = await Promise.all([
      klerionApi.listPlatformModules(activeSession),
      klerionApi.listPlatformOrganisations(activeSession),
      klerionApi.listPlatformInvoices(activeSession),
    ]);
    setModules(nextModules);
    setOrganisations(nextOrganisations);
    setInvoices(nextInvoices);
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

  function signOut() {
    clearPlatformSession();
    setSession(null);
  }

  if (!session) {
    return <main className="platform-auth-page"><section><Brand /><span className="eyebrow"><ShieldCheck size={14} />Klerion platform control plane</span><h1>God administrator backend</h1><p>Provision organisations, control module entitlements, manage commercial status and reconcile invoices from one isolated platform workspace.</p></section><form onSubmit={authenticate}><div className="platform-auth-tabs"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Sign in</button><button type="button" className={authMode === "bootstrap" ? "active" : ""} onClick={() => setAuthMode("bootstrap")}>First-time bootstrap</button></div><span className="platform-auth-icon"><KeyRound /></span><h2>{authMode === "login" ? "Platform administrator access" : "Create the first God administrator"}</h2><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="root@klerion.com" /></label><label>Password<input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{authMode === "bootstrap" && <label>Bootstrap key<input value={bootstrapKey} onChange={(event) => setBootstrapKey(event.target.value)} placeholder="Required in production" /></label>}{error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Authenticating…" : authMode === "login" ? "Open control plane" : "Create God admin"}</button><small>Organisation users cannot access this backend with tenant tokens.</small></form></main>;
  }

  const activeSubscriptions = organisations.filter((item) => item.subscription?.status === "active" || item.subscription?.status === "trialing").length;
  const outstanding = invoices.filter((invoice) => invoice.status === "open" || invoice.status === "overdue").reduce((total, invoice) => total + invoice.amountDue - invoice.amountPaid, 0);
  const outstandingCurrency = invoices.find((invoice) => invoice.status === "open" || invoice.status === "overdue")?.currency ?? "NGN";

  return (
    <main className="platform-admin-page">
      <aside className="platform-sidebar"><Brand /><div className="platform-admin-badge"><ShieldCheck size={17} /><span><strong>God administrator</strong><small>{session.email}</small></span></div><nav><a href="#platform-overview">Overview</a><a href="#platform-organisations">Organisations</a><a href="#platform-invoices">Billing & invoices</a><a href="#platform-modules">Module catalogue</a></nav><button onClick={signOut}><LogOut size={16} />Sign out</button></aside>
      <section className="platform-workspace">
        <header><div><span className="eyebrow">Klerion platform operations</span><h1>Control plane</h1></div><div><button className="secondary" onClick={() => void loadData(session)}><RefreshCw size={15} />Refresh</button><button className="primary" onClick={() => setCreateOpen(true)}><Plus size={15} />Create organisation</button></div></header>
        {error && <div className="inline-alert">{error}</div>}
        <section id="platform-overview" className="platform-metrics"><article><Building2 /><span><small>Organisations</small><strong>{organisations.length}</strong></span></article><article><Check /><span><small>Active subscriptions</small><strong>{activeSubscriptions}</strong></span></article><article><Layers3 /><span><small>Commercial modules</small><strong>{modules.length}</strong></span></article><article><CreditCard /><span><small>Outstanding value</small><strong>{money(outstanding, outstandingCurrency)}</strong></span></article></section>

        <section id="platform-organisations" className="platform-section"><header><div><h2>Organisations</h2><p>Tenant status, owner provisioning and selected module entitlements.</p></div></header><div className="platform-table"><div className="platform-table-head"><span>Organisation</span><span>Status</span><span>Subscription</span><span>Modules</span><span>Actions</span></div>{organisations.map((organisation) => <div className="platform-table-row" key={organisation.id}><span><strong>{organisation.name}</strong><small>{organisation.slug}</small></span><em className={`tenant-status ${organisation.status}`}>{organisation.status}</em><span><strong>{organisation.subscription?.status ?? "none"}</strong><small>{organisation.subscription ? `${organisation.subscription.billingCycle} · ${organisation.subscription.currency}` : "No subscription"}</small></span><span className="module-count"><strong>{organisation.subscription?.enabledModules.length ?? 0}</strong><small>enabled</small></span><span className="row-actions"><button onClick={() => setEditing(organisation)}>Edit modules</button><button onClick={() => void klerionApi.updatePlatformOrganisationStatus(session, organisation.id, organisation.status === "suspended" ? "active" : "suspended").then(() => loadData(session))}>{organisation.status === "suspended" ? "Activate" : "Suspend"}</button></span></div>)}</div></section>

        <section id="platform-invoices" className="platform-section"><header><div><h2>Billing and invoices</h2><p>Commercial records remain separate from tenant operational data.</p></div></header><div className="platform-table invoices"><div className="platform-table-head"><span>Invoice</span><span>Organisation</span><span>Status</span><span>Due</span><span>Amount</span><span>Action</span></div>{invoices.map((invoice) => { const organisation = organisations.find((item) => item.id === invoice.tenantId); return <div className="platform-table-row" key={invoice.id}><span><strong>{invoice.number}</strong><small>{invoice.billingCycle}</small></span><span><strong>{organisation?.name ?? invoice.tenantId}</strong><small>{organisation?.slug}</small></span><em className={`invoice-status ${invoice.status}`}>{invoice.status}</em><span>{new Date(invoice.dueAt).toLocaleDateString()}</span><strong>{money(invoice.amountDue, invoice.currency)}</strong><span>{invoice.status !== "paid" ? <button onClick={() => { const reference = window.prompt("Enter the payment reference"); if (reference) void klerionApi.markPlatformInvoicePaid(session, invoice.id, reference).then(() => loadData(session)); }}>Mark paid</button> : invoice.paymentReference}</span></div>; })}</div></section>

        <section id="platform-modules" className="platform-section"><header><div><h2>Module catalogue</h2><p>Dependencies and explicit prices drive entitlement expansion and invoice lines.</p></div></header><div className="platform-module-grid">{modules.map((module) => <article key={module.key}><span><Layers3 size={18} /></span><div><strong>{module.name}</strong><p>{module.description}</p><small>{module.dependencies.length ? `Requires ${module.dependencies.join(", ")}` : "No dependencies"}</small></div><em>{module.availability}</em></article>)}</div></section>
      </section>

      {createOpen && <CreateOrganisationDialog session={session} modules={modules} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); void loadData(session); }} />}
      {editing && <EditSubscriptionDialog session={session} organisation={editing} modules={modules} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void loadData(session); }} />}
    </main>
  );
}

function ModuleCheckboxes({ modules, selected, onToggle }: { readonly modules: readonly ApiModuleDefinition[]; readonly selected: readonly ModuleKey[]; readonly onToggle: (key: ModuleKey) => void }) {
  const groups = useMemo(() => [...new Set(modules.map((module) => module.category))], [modules]);
  return <div className="platform-module-selector">{groups.map((group) => <fieldset key={group}><legend>{group.replace(/-/g, " ")}</legend>{modules.filter((module) => module.category === group).map((module) => <label key={module.key}><input type="checkbox" checked={selected.includes(module.key)} onChange={() => onToggle(module.key)} /><span><strong>{module.name}</strong><small>{module.description}</small></span></label>)}</fieldset>)}</div>;
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
  const [selected, setSelected] = useState<ModuleKey[]>([...(organisation.subscription?.enabledModules ?? [])]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try { await klerionApi.updatePlatformSubscription(session, organisation.id, { enabledModules: selected }); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update subscription."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="platform-dialog"><header><div><h2>Edit {organisation.name}</h2><p>Dependencies will be added automatically when the subscription is saved.</p></div><button onClick={onClose}>Close</button></header><ModuleCheckboxes modules={modules} selected={selected} onToggle={(key) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} />{error && <div className="form-error">{error}</div>}<footer><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={() => void save()}><Save size={15} />{busy ? "Saving…" : "Save entitlements"}</button></footer></section></div>;
}
