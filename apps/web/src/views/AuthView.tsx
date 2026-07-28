import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { AuthenticationRequest } from "../lib/api";
import { Brand } from "../components/Brand";

export function AuthView({ onAuth, onDemo }: { readonly onAuth: (request: AuthenticationRequest) => Promise<void>; readonly onDemo: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await onAuth(mode === "signin" ? { mode, tenantSlug, email, password } : { mode, tenantName, tenantSlug, fullName, email, password });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect to Klerion.");
    } finally { setBusy(false); }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-story-inner"><Brand /><span className="eyebrow"><Sparkles size={14} />Administrative operations, organised</span><h1>Run every company operation from one trusted workspace.</h1><p>Klerion coordinates appointments, queues, employees, recruitment, approvals, audit trails, and operational intelligence.</p><div className="auth-proof"><div><Check />Nigeria-first, globally ready</div><div><Check />Tenant-isolated and audit-ready</div><div><Check />Built for low-friction administration</div></div><div className="auth-metric"><strong>One operational source of truth</strong><span>Replace fragmented admin tools with connected workflows and accountable decisions.</span></div></div>
      </section>
      <section className="auth-panel">
        <div className="auth-card"><div className="mobile-brand"><Brand /></div><div className="auth-tabs"><button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create organisation</button></div><header><span className="secure-label"><ShieldCheck size={14} />Secure workspace access</span><h2>{mode === "signin" ? "Welcome back" : "Start your Klerion workspace"}</h2><p>{mode === "signin" ? "Enter your organisation slug and account details." : "Create the tenant and first owner account."}</p></header><form onSubmit={submit}>{mode === "signup" && <><label>Organisation name<input value={tenantName} onChange={(e) => setTenantName(e.target.value)} required placeholder="Acme Financial Services" /></label><label>Your name<input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Amina Bello" /></label></>}<label>Organisation slug<div className="slug-field"><span>klerion.app/</span><input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} required placeholder="acme" /></div></label><label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@company.com" /></label><label>Password<div className="password-field"><LockKeyhole size={16} /><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required placeholder="At least 8 characters" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>{error && <div className="form-error">{error}</div>}<button className="primary auth-submit" disabled={busy}>{busy ? "Connecting…" : mode === "signin" ? "Sign in securely" : "Create organisation"}<ArrowRight size={16} /></button></form><div className="auth-divider"><span>or explore first</span></div><button className="secondary demo-button" onClick={onDemo}>Open interactive preview</button><small className="auth-note">Preview mode does not create or modify production data.</small></div>
      </section>
    </main>
  );
}
