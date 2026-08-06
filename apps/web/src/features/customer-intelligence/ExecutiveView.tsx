import { CalendarCheck2, CheckCircle2, Clock3, Gauge, Loader2, MessageSquareWarning, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { customerIntelligenceApi, type ExecutiveSummaryRecord } from "./api";

const demoSummary: ExecutiveSummaryRecord = {
  generatedAt: new Date().toISOString(),
  cases: { total: 38, active: 12, breached: 2, resolved: 26, slaCompliancePercent: 92, averageResolutionHours: 6.4 },
  appointments: { total: 64, completed: 51, checkedIn: 6, noShow: 3, cancelled: 4, completionPercent: 80 },
  priorityMix: { low: 5, normal: 18, high: 11, urgent: 4 },
  topCategories: [{ category: "Service delivery", count: 16 }, { category: "Documentation", count: 9 }, { category: "Billing", count: 7 }],
  trend: Array.from({ length: 7 }, (_, index) => ({ date: `2026-07-${24 + index}`, casesCreated: 3 + index % 3, casesResolved: 2 + index % 4, appointments: 7 + index })),
};

export function ExecutiveView({ session }: { readonly session: KlerionSession }) {
  const [summary, setSummary] = useState<ExecutiveSummaryRecord | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try { setSummary(session.mode === "demo" ? demoSummary : await customerIntelligenceApi.summary(session)); }
      catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load executive summary"); }
    })();
  }, [session]);

  if (error) return <div className="view"><div className="form-error">{error}</div></div>;
  if (!summary) return <div className="empty-state"><Loader2 className="spin"/>Building executive summary…</div>;
  const maxTrend = Math.max(1, ...summary.trend.flatMap((item) => [item.casesCreated, item.casesResolved, item.appointments]));

  return <div className="view">
    <div className="view-heading"><div><span className="eyebrow">Operational intelligence</span><h1>Executive command centre</h1><p>A verifiable view of customer resolution and appointment execution, calculated from live operational records.</p></div><span className="generated-label">Updated {new Date(summary.generatedAt).toLocaleTimeString()}</span></div>
    <div className="ci-metrics executive">
      <article><MessageSquareWarning/><div><small>Active cases</small><strong>{summary.cases.active}</strong><em>{summary.cases.total} total</em></div></article>
      <article><Gauge/><div><small>SLA compliance</small><strong>{summary.cases.slaCompliancePercent}%</strong><em>{summary.cases.breached} breached</em></div></article>
      <article><Clock3/><div><small>Avg resolution</small><strong>{summary.cases.averageResolutionHours}h</strong><em>resolved cases</em></div></article>
      <article><CalendarCheck2/><div><small>Appointment completion</small><strong>{summary.appointments.completionPercent}%</strong><em>{summary.appointments.completed} completed</em></div></article>
    </div>
    <div className="ci-dashboard-grid">
      <section className="panel ci-trend"><header><div><h2>Seven-day operational trend</h2><p>Cases created, cases resolved and appointments.</p></div><TrendingUp size={18}/></header><div className="ci-chart">{summary.trend.map((item) => <article key={item.date}><div className="ci-bars"><span title={`${item.casesCreated} created`} style={{ height: `${(item.casesCreated / maxTrend) * 100}%` }}/><span title={`${item.casesResolved} resolved`} style={{ height: `${(item.casesResolved / maxTrend) * 100}%` }}/><span title={`${item.appointments} appointments`} style={{ height: `${(item.appointments / maxTrend) * 100}%` }}/></div><small>{new Date(`${item.date}T00:00:00Z`).toLocaleDateString("en", { weekday: "short" })}</small></article>)}</div><footer><span><i className="created"/>Cases created</span><span><i className="resolved"/>Cases resolved</span><span><i className="appointments"/>Appointments</span></footer></section>
      <section className="panel ci-breakdown"><header><div><h2>Priority and demand</h2><p>Current customer-service composition.</p></div></header><div className="priority-breakdown">{Object.entries(summary.priorityMix).map(([priority, count]) => <div key={priority}><span className={`priority-pill ${priority}`}>{priority}</span><div className="progress"><span style={{ width: `${summary.cases.total ? (count / summary.cases.total) * 100 : 0}%` }}/></div><strong>{count}</strong></div>)}</div><div className="category-list"><h3>Top categories</h3>{summary.topCategories.map((item) => <article key={item.category}><span>{item.category}</span><strong>{item.count}</strong></article>)}</div></section>
    </div>
    <div className="ci-outcomes"><article className="panel"><CheckCircle2/><div><strong>{summary.cases.resolved}</strong><span>cases resolved</span></div></article><article className="panel"><CalendarCheck2/><div><strong>{summary.appointments.checkedIn}</strong><span>customers checked in</span></div></article><article className="panel"><Clock3/><div><strong>{summary.appointments.noShow}</strong><span>appointment no-shows</span></div></article></div>
  </div>;
}
