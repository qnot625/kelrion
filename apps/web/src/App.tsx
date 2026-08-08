import { useEffect, useMemo, useState } from "react";
import { availableRoutes, Shell, type RouteKey } from "./components/Shell";
import { ApprovalView } from "./features/approvals/ApprovalView";
import { BranchesView } from "./features/branches/BranchesView";
import { CasesView } from "./features/customer-intelligence/CasesView";
import { ExecutiveView } from "./features/customer-intelligence/ExecutiveView";
import { FormsView } from "./features/forms/FormsView";
import { AttendanceView } from "./features/workforce/AttendanceView";
import { EmployeeDirectoryView } from "./features/workforce/EmployeeDirectoryView";
import { WorkflowView } from "./features/workflow/WorkflowView";
import { klerionApi, type AuthenticationRequest } from "./lib/api";
import { clearSession, loadSession, saveSession, type KlerionSession, type ModuleKey } from "./lib/session";
import { AppointmentsView } from "./views/AppointmentsView";
import { AuditView } from "./views/AuditView";
import { AuthView } from "./views/AuthView";
import { BillingView } from "./views/BillingView";
import { DashboardView } from "./views/DashboardView";
import { FoundationView } from "./views/FoundationView";
import { LeaveView } from "./views/LeaveView";
import { LifecycleView } from "./views/LifecycleView";
import { OnboardingView } from "./views/OnboardingView";
import { PlatformAdminView } from "./views/PlatformAdminView";
import { PublicBookingView } from "./views/PublicBookingView";
import { QueueView } from "./views/QueueView";
import { RecruitmentView } from "./views/RecruitmentView";
import { UsersView } from "./views/UsersView";

type Stage = "auth" | "onboarding" | "app";

const demoModules: readonly ModuleKey[] = [
  "branches",
  "appointments",
  "queue",
  "notifications",
  "employees",
  "attendance",
  "forms",
  "workflow",
  "approvals",
  "cases",
  "analytics",
];

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const stored = useMemo(() => loadSession(), []);
  const [session, setSession] = useState<KlerionSession | null>(stored);
  const [stage, setStage] = useState<Stage>(stored ? "app" : "auth");
  const [route, setRoute] = useState<RouteKey>("dashboard");
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    void klerionApi.health().then((value) => mounted && setApiReachable(value));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!session || session.mode !== "live") return;
    let active = true;
    void klerionApi.getEntitlements(session).then((entitlements) => {
      if (!active) return;
      const next = { ...session, enabledModules: entitlements.enabledModules };
      setSession(next);
      saveSession(next);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session?.token]);

  useEffect(() => {
    if (session && !availableRoutes(session).includes(route)) setRoute("dashboard");
  }, [session, route]);

  async function authenticate(request: AuthenticationRequest) {
    const next = await klerionApi.authenticate(request);
    saveSession(next);
    setSession(next);
    setStage(request.mode === "signup" ? "onboarding" : "app");
  }

  function openDemo() {
    const next: KlerionSession = {
      mode: "demo",
      tenantSlug: "klerion-demo",
      tenantName: "Klerion Demo",
      email: "owner@klerion.demo",
      userId: "demo-owner",
      roles: ["owner"],
      enabledModules: demoModules,
    };
    saveSession(next);
    setSession(next);
    setStage("app");
  }

  function signOut() {
    clearSession();
    setSession(null);
    setStage("auth");
    setRoute("dashboard");
  }

  const bookingSlug = hash.startsWith("#book/") ? decodeURIComponent(hash.slice("#book/".length)) : "";
  if (bookingSlug) return <PublicBookingView tenantSlug={bookingSlug} />;
  if (hash.startsWith("#platform")) return <PlatformAdminView />;
  if (!session || stage === "auth") return <AuthView onAuth={authenticate} onDemo={openDemo} />;
  if (stage === "onboarding") return <OnboardingView onComplete={() => setStage("app")} />;

  const views: Record<RouteKey, React.ReactNode> = {
    dashboard: <DashboardView session={session} onOpen={setRoute} />,
    branches: <BranchesView session={session} />,
    appointments: <AppointmentsView session={session} />,
    queue: <QueueView />,
    notifications: <FoundationView title="Omnichannel notifications" />,
    employees: <EmployeeDirectoryView session={session} />,
    attendance: <AttendanceView session={session} />,
    leave: <LeaveView session={session} />,
    lifecycle: <LifecycleView session={session} />,
    forms: <FormsView session={session} />,
    workflow: <WorkflowView session={session} />,
    approvals: <ApprovalView session={session} />,
    serviceDesk: <FoundationView title="Internal service desk" />,
    cases: <CasesView session={session} />,
    executive: <ExecutiveView session={session} />,
    recruitment: <RecruitmentView />,
    users: <UsersView session={session} />,
    audit: <AuditView session={session} />,
    billing: <BillingView session={session} />,
  };

  return <Shell session={session} route={route} onRoute={setRoute} onSignOut={signOut} apiReachable={apiReachable}>{views[route]}</Shell>;
}
