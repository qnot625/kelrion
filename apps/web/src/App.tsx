import { useEffect, useMemo, useState } from "react";
import { Shell, type RouteKey } from "./components/Shell";
import { klerionApi, type AuthenticationRequest } from "./lib/api";
import { clearSession, loadSession, saveSession, type KlerionSession } from "./lib/session";
import { AppointmentsView } from "./views/AppointmentsView";
import { AuditView } from "./views/AuditView";
import { AuthView } from "./views/AuthView";
import { DashboardView } from "./views/DashboardView";
import { FoundationView } from "./views/FoundationView";
import { LeaveView } from "./views/LeaveView";
import { LifecycleView } from "./views/LifecycleView";
import { OnboardingView } from "./views/OnboardingView";
import { QueueView } from "./views/QueueView";
import { RecruitmentView } from "./views/RecruitmentView";
import { UsersView } from "./views/UsersView";

type Stage = "auth" | "onboarding" | "app";

export default function App() {
  const stored = useMemo(() => loadSession(), []);
  const [session, setSession] = useState<KlerionSession | null>(stored);
  const [stage, setStage] = useState<Stage>(stored ? "app" : "auth");
  const [route, setRoute] = useState<RouteKey>("dashboard");
  const [apiReachable, setApiReachable] = useState<boolean | null>(null);

  useEffect(() => { let mounted = true; void klerionApi.health().then((value) => mounted && setApiReachable(value)); return () => { mounted = false; }; }, []);

  async function authenticate(request: AuthenticationRequest) {
    const next = await klerionApi.authenticate(request);
    saveSession(next); setSession(next); setStage(request.mode === "signup" ? "onboarding" : "app");
  }

  function openDemo() {
    const next: KlerionSession = { mode: "demo", tenantSlug: "klerion-demo", tenantName: "Klerion Demo", email: "owner@klerion.demo", userId: "demo-owner", roles: ["owner"] };
    saveSession(next); setSession(next); setStage("app");
  }

  function signOut() { clearSession(); setSession(null); setStage("auth"); setRoute("dashboard"); }

  if (!session || stage === "auth") return <AuthView onAuth={authenticate} onDemo={openDemo} />;
  if (stage === "onboarding") return <OnboardingView onComplete={() => setStage("app")} />;

  const views: Record<RouteKey, React.ReactNode> = {
    dashboard: <DashboardView />,
    appointments: <AppointmentsView session={session} />,
    queue: <QueueView />,
    users: <UsersView session={session} />,
    leave: <LeaveView session={session} />,
    lifecycle: <LifecycleView session={session} />,
    recruitment: <RecruitmentView />,
    audit: <AuditView session={session} />,
    reports: <FoundationView title="Reports and analytics" />,
  };

  return <Shell session={session} route={route} onRoute={setRoute} onSignOut={signOut} apiReachable={apiReachable}>{views[route]}</Shell>;
}
