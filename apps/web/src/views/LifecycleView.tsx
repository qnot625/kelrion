import { CheckCircle2, ClipboardCheck, Loader2, Plus, UserMinus, UserPlus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { klerionApi, type ApiLifecyclePlan, type ApiUser } from "../lib/api";
import type { KlerionSession } from "../lib/session";

const demoPlans: ApiLifecyclePlan[] = [
  {
    id: "demo-plan",
    subjectUserId: "demo-member",
    kind: "onboarding",
    title: "Operations associate onboarding",
    dueAt: "2026-08-21T17:00:00.000Z",
    status: "active",
    createdAt: "2026-07-30T08:00:00.000Z",
    steps: [
      { id: "s1", title: "Collect employment documents", ownerRole: "HR", status: "completed", completedAt: "2026-07-30T09:00:00.000Z" },
      { id: "s2", title: "Provision account and access", ownerRole: "IT", status: "pending", completedAt: null },
      { id: "s3", title: "Assign manager and first-week plan", ownerRole: "Manager", status: "pending", completedAt: null },
    ],
  },
];

export function LifecycleView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [plans, setPlans] = useState<ApiLifecyclePlan[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      if (session.mode === "demo") {
        setPlans(demoPlans);
        setUsers([{ id: "demo-member", email: "new.hire@klerion.demo", roles: ["member"], createdAt: new Date().toISOString() }]);
      } else {
        const [nextPlans, nextUsers] = await Promise.all([
          klerionApi.listLifecyclePlans(session),
          canManage ? klerionApi.listUsers(session) : Promise.resolve([]),
        ]);
        setPlans(nextPlans);
        setUsers(nextUsers);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load lifecycle plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorking("create");
    try {
      const input = {
        subjectUserId: String(data.get("subjectUserId")),
        kind: data.get("kind") as "onboarding" | "offboarding",
        title: String(data.get("title") || ""),
        dueAt: String(data.get("dueAt") || "") || undefined,
      };
      const plan =
        session.mode === "demo"
          ? { ...demoPlans[0], id: `demo-${Date.now()}`, ...input, status: "active" as const }
          : await klerionApi.createLifecyclePlan(session, input);
      setPlans((current) => [plan, ...current]);
      setShowForm(false);
      event.currentTarget.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create lifecycle plan");
    } finally {
      setWorking(null);
    }
  }

  async function completeStep(plan: ApiLifecyclePlan, stepId: string) {
    setWorking(stepId);
    try {
      const updated =
        session.mode === "demo"
          ? {
              ...plan,
              steps: plan.steps.map((step) =>
                step.id === stepId ? { ...step, status: "completed" as const, completedAt: new Date().toISOString() } : step,
              ),
            }
          : await klerionApi.completeLifecycleStep(session, plan.id, stepId);
      setPlans((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not complete step");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Workforce lifecycle</span>
          <h1>Onboarding and offboarding</h1>
          <p>Coordinate people, access, assets and handovers through one accountable checklist.</p>
        </div>
        {canManage && <button className="primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} />New plan</button>}
      </div>

      {showForm && (
        <form className="panel lifecycle-form" onSubmit={create}>
          <header><div><h2>Start a lifecycle plan</h2><p>Klerion adds a complete default checklist for the selected journey.</p></div></header>
          <div className="lifecycle-form-grid">
            <label>Employee<select name="subjectUserId" required><option value="">Select a user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></label>
            <label>Journey<select name="kind"><option value="onboarding">Onboarding</option><option value="offboarding">Offboarding</option></select></label>
            <label>Plan title<input name="title" placeholder="e.g. Finance analyst onboarding" /></label>
            <label>Target completion<input name="dueAt" type="datetime-local" /></label>
          </div>
          <footer><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={working === "create"}>{working === "create" && <Loader2 size={14} className="spin" />}Create plan</button></footer>
        </form>
      )}

      {error && <div className="form-error">{error}</div>}

      {loading ? <div className="empty-state"><Loader2 className="spin" />Loading lifecycle plans…</div> : (
        <div className="lifecycle-board">
          {plans.map((plan) => {
            const completed = plan.steps.filter((step) => step.status === "completed").length;
            const percent = plan.steps.length ? Math.round((completed / plan.steps.length) * 100) : 0;
            return (
              <section className="panel lifecycle-plan" key={plan.id}>
                <header>
                  <div className={`lifecycle-kind ${plan.kind}`}>{plan.kind === "onboarding" ? <UserPlus size={18} /> : <UserMinus size={18} />}</div>
                  <div><h2>{plan.title}</h2><p>{plan.kind} · {completed} of {plan.steps.length} steps complete</p></div>
                  <span className={`status-pill ${plan.status}`}>{plan.status}</span>
                </header>
                <div className="lifecycle-progress"><span style={{ width: `${percent}%` }} /></div>
                <div className="lifecycle-steps">
                  {plan.steps.map((step) => (
                    <article key={step.id} className={step.status}>
                      <span>{step.status === "completed" ? <CheckCircle2 size={18} /> : <ClipboardCheck size={18} />}</span>
                      <div><strong>{step.title}</strong><small>{step.ownerRole}</small></div>
                      {canManage && step.status === "pending" && <button onClick={() => void completeStep(plan, step.id)} disabled={working === step.id}>{working === step.id ? <Loader2 size={14} className="spin" /> : "Complete"}</button>}
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
          {plans.length === 0 && <div className="panel empty-state">No onboarding or offboarding plans yet.</div>}
        </div>
      )}
    </div>
  );
}
