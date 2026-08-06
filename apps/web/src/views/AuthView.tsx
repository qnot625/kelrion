import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Workflow,
  UsersRound,
  Tickets,
  ChartNoAxesCombined,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AuthenticationRequest } from "../lib/api";
import type { ModuleKey } from "../lib/session";
import { Brand } from "../components/Brand";

const packages: Array<{
  key: string;
  name: string;
  description: string;
  modules: readonly ModuleKey[];
  icon: LucideIcon;
}> = [
  {
    key: "flow",
    name: "Klerion Flow",
    description: "Branches, appointments, queues and customer notifications.",
    modules: ["branches", "appointments", "queue", "notifications"],
    icon: Tickets,
  },
  {
    key: "workforce",
    name: "Klerion Workforce",
    description: "Employee records, attendance, leave and lifecycle operations.",
    modules: ["employees", "attendance", "leave", "lifecycle", "recruitment"],
    icon: UsersRound,
  },
  {
    key: "serviceops",
    name: "Klerion ServiceOps",
    description: "Forms, workflows, approvals and the internal service desk.",
    modules: ["forms", "workflow", "approvals", "service-desk"],
    icon: Workflow,
  },
  {
    key: "resolve",
    name: "Resolve & Insight",
    description: "Customer cases, SLA management and executive intelligence.",
    modules: ["cases", "analytics"],
    icon: ChartNoAxesCombined,
  },
];

export function AuthView({
  onAuth,
  onDemo,
}: {
  readonly onAuth: (request: AuthenticationRequest) => Promise<void>;
  readonly onDemo: () => void;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPackages, setSelectedPackages] = useState<string[]>(["flow"]);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [currency, setCurrency] = useState<"NGN" | "USD" | "GBP" | "EUR">("NGN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function togglePackage(key: string) {
    setSelectedPackages((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (mode === "signup" && selectedPackages.length === 0) {
      setError("Select at least one Klerion package before creating the organisation.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        await onAuth({ mode, tenantSlug, email, password });
      } else {
        const enabledModules = [...new Set(
          packages.filter((item) => selectedPackages.includes(item.key)).flatMap((item) => item.modules),
        )];
        await onAuth({
          mode,
          tenantName,
          tenantSlug,
          fullName,
          email,
          password,
          enabledModules,
          billingCycle,
          currency,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect to Klerion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-story-inner">
          <Brand />
          <span className="eyebrow"><Sparkles size={14} />Administrative operations, organised</span>
          <h1>Build the operating system your organisation actually needs.</h1>
          <p>Select only the operational modules your organisation will use. Klerion keeps every workspace focused, entitled and commercially accountable.</p>
          <div className="auth-proof">
            <div><Check />God-admin controlled organisations and subscriptions</div>
            <div><Check />Module-aware security, navigation and billing</div>
            <div><Check />Built for Africa, ready for global operations</div>
          </div>
          <div className="auth-metric"><strong>One platform. Your selected operations.</strong><span>No crowded dashboard and no paying for functionality your organisation has not enabled.</span></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className={`auth-card ${mode === "signup" ? "signup-card" : ""}`}>
          <div className="mobile-brand"><Brand /></div>
          <div className="auth-tabs">
            <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create organisation</button>
          </div>
          <header>
            <span className="secure-label"><ShieldCheck size={14} />Secure workspace access</span>
            <h2>{mode === "signin" ? "Welcome back" : "Configure your Klerion workspace"}</h2>
            <p>{mode === "signin" ? "Enter your organisation slug and account details." : "Create the owner account and choose the modules that should appear."}</p>
          </header>
          <form onSubmit={submit}>
            {mode === "signup" && <>
              <div className="auth-two-column">
                <label>Organisation name<input value={tenantName} onChange={(event) => setTenantName(event.target.value)} required placeholder="Acme Financial Services" /></label>
                <label>Your name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required placeholder="Amina Bello" /></label>
              </div>
            </>}
            <label>Organisation slug<div className="slug-field"><span>klerion.app/</span><input value={tenantSlug} onChange={(event) => setTenantSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} required placeholder="acme" /></div></label>
            <div className={mode === "signup" ? "auth-two-column" : undefined}>
              <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="admin@company.com" /></label>
              <label>Password<div className="password-field"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            </div>
            {mode === "signup" && <>
              <fieldset className="package-selector">
                <legend>Select the operational packages you need</legend>
                <p>Dependencies are included automatically. Modules can be changed later by your organisation owner or Klerion God admin.</p>
                <div className="package-grid">
                  {packages.map(({ key, name, description, modules, icon: Icon }) => {
                    const selected = selectedPackages.includes(key);
                    return <button type="button" key={key} className={selected ? "selected" : ""} onClick={() => togglePackage(key)} aria-pressed={selected}>
                      <span className="package-icon"><Icon size={19} /></span>
                      <span><strong>{name}</strong><small>{description}</small><em>{modules.length} modules</em></span>
                      <i>{selected && <Check size={14} />}</i>
                    </button>;
                  })}
                </div>
              </fieldset>
              <div className="auth-two-column">
                <label>Billing cycle<select value={billingCycle} onChange={(event) => setBillingCycle(event.target.value as "monthly" | "annual")}><option value="monthly">Monthly</option><option value="annual">Annual — two months included</option></select></label>
                <label>Billing currency<select value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)}><option value="NGN">NGN — Nigerian naira</option><option value="USD">USD — US dollar</option><option value="GBP">GBP — Pound sterling</option><option value="EUR">EUR — Euro</option></select></label>
              </div>
            </>}
            {error && <div className="form-error">{error}</div>}
            <button className="primary auth-submit" disabled={busy}>{busy ? "Connecting…" : mode === "signin" ? "Sign in securely" : "Create selected workspace"}<ArrowRight size={16} /></button>
          </form>
          <div className="auth-divider"><span>or explore first</span></div>
          <button className="secondary demo-button" onClick={onDemo}>Open modular platform preview</button>
          <small className="auth-note">Platform administrators can sign in at <strong>#platform</strong>.</small>
        </div>
      </section>
    </main>
  );
}
