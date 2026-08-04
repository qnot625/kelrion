import {
  BarChart3, Bell, BriefcaseBusiness, CalendarDays, ChevronDown, Command,
  LayoutDashboard, Menu, Plus, Search, ShieldCheck, TicketCheck, UserCog, X, MapPin, Layers,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { KlerionSession } from "../lib/session";
import { displayNameFromEmail } from "../lib/session";
import { Brand } from "./Brand";

export type RouteKey = "dashboard" | "appointments" | "queue" | "services" | "branches" | "users" | "recruitment" | "audit" | "reports";

const nav: Array<{ key: RouteKey; label: string; icon: LucideIcon; badge?: string }> = [
  { key: "dashboard", label: "Overview", icon: LayoutDashboard },
  { key: "appointments", label: "Appointments", icon: CalendarDays, badge: "10" },
  { key: "queue", label: "Live queue", icon: TicketCheck, badge: "Live" },
  { key: "services", label: "Service Catalog", icon: Layers },
  { key: "branches", label: "Branches", icon: MapPin },
  { key: "users", label: "Users & roles", icon: UserCog },
  { key: "recruitment", label: "Recruitment", icon: BriefcaseBusiness, badge: "12" },
  { key: "audit", label: "Audit trail", icon: ShieldCheck },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

export function Shell({
  session, route, onRoute, onSignOut, children, apiReachable,
}: {
  readonly session: KlerionSession;
  readonly route: RouteKey;
  readonly onRoute: (route: RouteKey) => void;
  readonly onSignOut: () => void;
  readonly children: ReactNode;
  readonly apiReachable: boolean | null;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const name = displayNameFromEmail(session.email);
  const initials = name.split(" ").map((item) => item[0]).slice(0, 2).join("");
  const results = useMemo(() => nav.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query]);

  const navigate = (next: RouteKey) => {
    onRoute(next);
    setMobileOpen(false);
    setCommandOpen(false);
    setQuery("");
  };

  return (
    <div className="app-shell">
      <button className={`nav-scrim ${mobileOpen ? "open" : ""}`} aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="sidebar-head"><Brand /><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
        <button className="workspace-switcher"><span>{session.tenantName.slice(0, 2).toUpperCase()}</span><div><strong>{session.tenantName}</strong><small>{session.tenantSlug}</small></div><ChevronDown size={14} /></button>
        <nav aria-label="Primary navigation">
          <small className="nav-label">Workspace</small>
          {nav.map(({ key, label, icon: Icon, badge }) => (
            <button key={key} className={route === key ? "active" : ""} onClick={() => navigate(key)}>
              <Icon size={18} /><span>{label}</span>{badge && <em>{badge}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot"><div className="avatar">{initials}</div><div><strong>{name}</strong><small>{session.roles.includes("owner") ? "Organisation owner" : "Member"}</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <button className="global-search" onClick={() => setCommandOpen(true)}><Search size={16} /><span>Search Klerion or run a command</span><kbd>⌘ K</kbd></button>
          <div className="topbar-actions">
            <span className={`connection ${session.mode === "demo" ? "demo" : apiReachable ? "online" : "offline"}`}><i />{session.mode === "demo" ? "Preview" : apiReachable === null ? "Checking API" : apiReachable ? "Connected" : "Offline"}</span>
            <button className="primary compact"><Plus size={15} />Create</button>
            <button className="icon-button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="profile-anchor"><button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}>{initials}</button>{profileOpen && <div className="profile-menu"><strong>{name}</strong><small>{session.email}</small><button onClick={onSignOut}>Sign out</button></div>}</div>
          </div>
        </header>
        <main id="main-content" className="content">
          <div className={`data-banner ${session.mode}`}>
            <ShieldCheck size={16} />
            {session.mode === "demo" ? "Interactive preview: representative records are shown." : "Live authentication is connected. Unfinished module records are clearly marked as preview data."}
          </div>
          {children}
        </main>
      </section>

      {commandOpen && <div className="command-overlay" onMouseDown={() => setCommandOpen(false)}><section className="command-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search modules…" /><button onClick={() => setCommandOpen(false)}>Esc</button></div><div className="command-results">{results.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => navigate(key)}><Icon size={17} /><span>{label}</span><Command size={14} /></button>)}</div></section></div>}
    </div>
  );
}
