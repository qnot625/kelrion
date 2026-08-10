import {
  Bell,
  Blocks,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Command,
  FileInput,
  Gauge,
  LayoutDashboard,
  Menu,
  MessageSquareWarning,
  Plus,
  ReceiptText,
  Search,
  ShieldCheck,
  TicketCheck,
  UserCog,
  UserRoundCheck,
  UsersRound,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { notificationApi } from "../features/notifications/notificationApi";
import type { KlerionSession, ModuleKey } from "../lib/session";
import { displayNameFromEmail } from "../lib/session";
import { Brand } from "./Brand";

export type RouteKey =
  | "dashboard"
  | "branches"
  | "appointments"
  | "queue"
  | "notifications"
  | "employees"
  | "attendance"
  | "leave"
  | "lifecycle"
  | "forms"
  | "workflow"
  | "approvals"
  | "serviceDesk"
  | "cases"
  | "executive"
  | "recruitment"
  | "users"
  | "audit"
  | "billing";

interface NavigationItem {
  readonly key: RouteKey;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly module?: ModuleKey;
  readonly ownerOnly?: boolean;
  readonly previewOnly?: boolean;
}

const nav: readonly NavigationItem[] = [
  { key: "dashboard", label: "Overview", icon: LayoutDashboard },
  { key: "branches", label: "Branches & services", icon: Building2, module: "branches" },
  { key: "appointments", label: "Appointments", icon: CalendarDays, module: "appointments" },
  { key: "queue", label: "Virtual queue", icon: TicketCheck, module: "queue" },
  { key: "notifications", label: "Notifications", icon: Bell, module: "notifications" },
  { key: "employees", label: "Employee directory", icon: UsersRound, module: "employees" },
  { key: "attendance", label: "Time & attendance", icon: CalendarClock, module: "attendance" },
  { key: "leave", label: "Leave & availability", icon: CalendarClock, module: "leave" },
  { key: "lifecycle", label: "On/Offboarding", icon: UserRoundCheck, module: "lifecycle" },
  { key: "recruitment", label: "Recruitment preview", icon: UsersRound, module: "recruitment", previewOnly: true },
  { key: "forms", label: "Dynamic forms", icon: FileInput, module: "forms" },
  { key: "workflow", label: "Workflow automation", icon: Workflow, module: "workflow" },
  { key: "approvals", label: "Approvals", icon: ClipboardCheck, module: "approvals" },
  { key: "serviceDesk", label: "Internal service desk", icon: Blocks, module: "service-desk" },
  { key: "cases", label: "Cases & complaints", icon: MessageSquareWarning, module: "cases" },
  { key: "executive", label: "Executive intelligence", icon: Gauge, module: "analytics" },
  { key: "users", label: "Users & roles", icon: UserCog, ownerOnly: true },
  { key: "audit", label: "Audit trail", icon: ShieldCheck, ownerOnly: true },
  { key: "billing", label: "Subscription & billing", icon: ReceiptText, ownerOnly: true },
];

function visible(item: NavigationItem, session: KlerionSession): boolean {
  const isOwner = session.roles.includes("owner");
  if (item.module && !session.enabledModules.includes(item.module)) return false;
  if (item.ownerOnly && !isOwner) return false;
  if (item.previewOnly && session.mode !== "demo") return false;
  return true;
}

export function availableRoutes(session: KlerionSession): RouteKey[] {
  return nav.filter((item) => visible(item, session)).map((item) => item.key);
}

export function Shell({ session, route, onRoute, onSignOut, children, apiReachable }: {
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
  const [unread, setUnread] = useState(0);
  const name = displayNameFromEmail(session.email);
  const initials = name.split(" ").map((item) => item[0]).slice(0, 2).join("");
  const isOwner = session.roles.includes("owner");
  const isStaff = session.roles.includes("staff");
  const roleLabel = isOwner ? "Organisation owner" : isStaff ? "Staff operator" : "Member";
  const notificationsEnabled = session.enabledModules.includes("notifications");
  const visibleNavigation = useMemo(() => nav.filter((item) => visible(item, session)), [session.enabledModules, session.roles, session.mode]);
  const results = useMemo(() => visibleNavigation.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())), [query, visibleNavigation]);
  const createTarget = session.enabledModules.includes("service-desk") ? { route: "serviceDesk" as RouteKey, label: "New request" }
    : session.enabledModules.includes("appointments") ? { route: "appointments" as RouteKey, label: "New booking" }
      : session.enabledModules.includes("queue") ? { route: "queue" as RouteKey, label: "Check in" }
        : session.enabledModules.includes("forms") ? { route: "forms" as RouteKey, label: "New form" }
          : null;

  useEffect(() => {
    if (session.mode !== "live" || !notificationsEnabled) { setUnread(0); return; }
    let active = true;
    const refreshUnread = () => void notificationApi.unreadCount(session).then((value) => { if (active) setUnread(value.unread); }).catch(() => undefined);
    refreshUnread();
    const interval = window.setInterval(refreshUnread, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [session.token, notificationsEnabled, route]);

  const navigate = (next: RouteKey) => {
    onRoute(next); setMobileOpen(false); setCommandOpen(false); setQuery(""); setProfileOpen(false);
  };

  return <div className="app-shell">
    <button className={`nav-scrim ${mobileOpen ? "open" : ""}`} aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <div className="sidebar-head"><Brand /><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <button className="workspace-switcher"><span>{session.tenantName.slice(0, 2).toUpperCase()}</span><div><strong>{session.tenantName}</strong><small>{session.tenantSlug}</small></div><ChevronDown size={14} /></button>
      <nav aria-label="Primary navigation"><small className="nav-label">Enabled workspace</small>{visibleNavigation.map(({ key, label, icon: Icon, module }) => <button key={key} className={route === key ? "active" : ""} onClick={() => navigate(key)}><Icon size={18} /><span>{label}</span>{module && <em>On</em>}</button>)}</nav>
      <div className="sidebar-foot"><div className="avatar">{initials}</div><div><strong>{name}</strong><small>{roleLabel}</small></div></div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <button className="menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <button className="global-search" onClick={() => setCommandOpen(true)}><Search size={16} /><span>Search enabled modules or run a command</span><kbd>⌘ K</kbd></button>
        <div className="topbar-actions">
          <span className={`connection ${session.mode === "demo" ? "demo" : apiReachable ? "online" : "offline"}`}><i />{session.mode === "demo" ? "Preview" : apiReachable === null ? "Checking API" : apiReachable ? "Connected" : "Offline"}</span>
          {createTarget && <button className="primary compact" onClick={() => navigate(createTarget.route)}><Plus size={15} />{createTarget.label}</button>}
          {notificationsEnabled && <button className="icon-button notification-button" aria-label={unread ? `${unread} unread notifications` : "Notifications"} onClick={() => navigate("notifications")}><Bell size={18} />{unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}</button>}
          <div className="profile-anchor"><button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}>{initials}</button>{profileOpen && <div className="profile-menu"><strong>{name}</strong><small>{session.email} · {roleLabel}</small>{isOwner && <button onClick={() => navigate("billing")}>Manage subscription</button>}<button onClick={onSignOut}>Sign out</button></div>}</div>
        </div>
      </header>
      <main id="main-content" className="content"><div className={`data-banner ${session.mode}`}><ShieldCheck size={16} />{session.mode === "demo" ? "Modular preview: navigation is generated from enabled package entitlements." : `${session.enabledModules.filter((module) => module !== "recruitment").length} production modules enabled. Disabled and preview-only modules are hidden and blocked by the API.`}</div>{children}</main>
    </section>

    {commandOpen && <div className="command-overlay" onMouseDown={() => setCommandOpen(false)}><section className="command-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search enabled modules…" /><button onClick={() => setCommandOpen(false)}>Esc</button></div><div className="command-results">{results.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => navigate(key)}><Icon size={17} /><span>{label}</span><Command size={14} /></button>)}</div></section></div>}
  </div>;
}
