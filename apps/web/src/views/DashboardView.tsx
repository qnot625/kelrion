import {
  ArrowRight,
  Blocks,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileInput,
  Gauge,
  MessageSquareWarning,
  Network,
  TicketCheck,
  UsersRound,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { RouteKey } from "../components/Shell";
import type { KlerionSession, ModuleKey } from "../lib/session";

const modulePresentation: Record<ModuleKey, { name: string; description: string; icon: LucideIcon; route?: RouteKey; preview?: boolean }> = {
  branches: { name: "Branches & Services", description: "Locations, departments, operating calendars and service discovery.", icon: Building2, route: "branches" },
  appointments: { name: "Appointments", description: "Booking, scheduling, rescheduling and appointment operations.", icon: CalendarDays, route: "appointments" },
  queue: { name: "Virtual Queue", description: "Remote check-in, tickets, counters, kiosks and display boards.", icon: TicketCheck, route: "queue" },
  notifications: { name: "Notifications", description: "Templates, delivery logs, retries and reminders.", icon: Network, route: "notifications" },
  employees: { name: "Employee Records", description: "Master records, organisation directory and reporting hierarchy.", icon: UsersRound, route: "employees" },
  attendance: { name: "Time & Attendance", description: "Clock events, timesheets, offline sync and corrections.", icon: CalendarClock, route: "attendance" },
  leave: { name: "Leave & Availability", description: "Balances, requests, approvals and workforce availability.", icon: CalendarClock, route: "leave" },
  lifecycle: { name: "Onboarding & Offboarding", description: "Reusable employee lifecycle plans and accountable checklists.", icon: UsersRound, route: "lifecycle" },
  forms: { name: "Dynamic Forms", description: "Versioned definitions, validation and form submissions.", icon: FileInput, route: "forms" },
  workflow: { name: "Workflow Automation", description: "State machines, human tasks, delegation and execution history.", icon: Workflow, route: "workflow" },
  approvals: { name: "Approvals", description: "Approval inbox, decisions, reassignment and information requests.", icon: ClipboardCheck, route: "approvals" },
  "service-desk": { name: "Internal Service Desk", description: "Employee service requests, triage, comments and SLAs.", icon: Blocks, route: "serviceDesk" },
  cases: { name: "Cases & Complaints", description: "Customer cases, ownership, priority and SLA resolution.", icon: MessageSquareWarning, route: "cases" },
  analytics: { name: "Executive Intelligence", description: "Operational scorecards, trends and command-centre reporting.", icon: Gauge, route: "executive" },
  recruitment: { name: "Recruitment", description: "Candidate pipeline and interview operations.", icon: UsersRound, route: "recruitment", preview: true },
};

export function DashboardView({ session, onOpen }: { readonly session: KlerionSession; readonly onOpen: (route: RouteKey) => void }) {
  const isOwner = session.roles.includes("owner");
  const roleLabel = isOwner ? "Owner" : session.roles.includes("staff") ? "Staff" : "Member";
  const visibleModules = session.enabledModules.filter((key) => session.mode === "demo" || !modulePresentation[key].preview);

  return (
    <section className="view modular-dashboard">
      <header className="view-heading">
        <div>
          <span className="eyebrow">Entitlement-aware workspace</span>
          <h1>{session.tenantName} operational control centre</h1>
          <p>Your dashboard contains only the production modules enabled for this organisation.</p>
        </div>
        {isOwner && <button className="secondary" onClick={() => onOpen("billing")}>Manage subscription</button>}
      </header>

      <div className="entitlement-summary">
        <article><span>Enabled modules</span><strong>{visibleModules.length}</strong><small>Dependencies included automatically</small></article>
        <article><span>Workspace access</span><strong>{roleLabel}</strong><small>Role and module checks are enforced server-side</small></article>
        <article><span>Organisation</span><strong>{session.tenantSlug}</strong><small>Tenant-isolated data boundary</small></article>
      </div>

      <div className="module-workspace-grid">
        {visibleModules.map((key) => {
          const module = modulePresentation[key];
          const Icon = module.icon;
          return (
            <button key={key} className="module-workspace-card" onClick={() => module.route && onOpen(module.route)}>
              <span className="module-card-icon"><Icon size={22} /></span>
              <span className="module-card-copy"><strong>{module.name}</strong><small>{module.description}</small></span>
              <em className={module.preview ? "preview" : "enabled"}>{module.preview ? "Preview" : "Enabled"}</em>
              <ArrowRight size={17} />
            </button>
          );
        })}
      </div>

      {visibleModules.length === 0 && (
        <div className="empty-module-state">
          <Blocks size={34} />
          <h2>No operational modules are enabled</h2>
          <p>An organisation owner or Klerion God admin must activate at least one production package before operational dashboards become available.</p>
          {isOwner && <button className="primary" onClick={() => onOpen("billing")}>Review subscription</button>}
        </div>
      )}
    </section>
  );
}
