import { AlertTriangle, ArrowUpRight, CalendarDays, Clock3, TicketCheck, Users } from "lucide-react";
import type { KlerionSession } from "../lib/session";
import { ClockWidget } from "../components/attendance/ClockWidget";

const metrics = [
  { label: "Customers served", value: "184", change: "+12.4%", icon: Users },
  { label: "Active queue", value: "27", change: "Across 4 services", icon: TicketCheck },
  { label: "Average wait", value: "11m", change: "3m faster", icon: Clock3 },
  { label: "Appointments today", value: "62", change: "91% confirmed", icon: CalendarDays },
];
const activity = [
  ["Account opening completed", "Victoria Island · 2 minutes ago"],
  ["Role updated for operations@acme.com", "Security · 18 minutes ago"],
  ["Interview moved to final stage", "Recruitment · 31 minutes ago"],
];

export function DashboardView({ session }: { readonly session: KlerionSession }) {
  return (
    <section className="view">
      <header className="view-heading">
        <div>
          <span className="eyebrow">Monday, 28 July</span>
          <h1>Good morning. Here is what needs attention.</h1>
          <p>A real-time view of service delivery, workforce activity, and operational risk.</p>
        </div>
        <button className="secondary">Export report</button>
      </header>

      <div className="mb-6">
        <ClockWidget session={session} />
      </div>

      <div className="metric-grid">
        {metrics.map(({ label, value, change, icon: Icon }) => (
          <article className="metric-card" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{change}</small>
            </div>
            <i>
              <Icon size={20} />
            </i>
          </article>
        ))}
      </div><div className="dashboard-grid"><article className="panel chart-panel"><header><div><h2>Service demand</h2><p>Customers served by hour</p></div><select><option>Today</option><option>This week</option></select></header><div className="bar-chart" aria-label="Service demand chart">{[32,48,61,70,57,82,74,91,68,55].map((height,index)=><div key={index}><span style={{height:`${height}%`}} /><small>{8+index}:00</small></div>)}</div></article><article className="panel attention-panel"><header><div><h2>Needs attention</h2><p>Prioritised operational signals</p></div><AlertTriangle size={19} /></header><div className="attention-list"><button><i className="danger" /><span><strong>Queue capacity at 82%</strong><small>Victoria Island branch</small></span><ArrowUpRight size={15} /></button><button><i className="warning" /><span><strong>4 approvals are overdue</strong><small>Oldest pending for 2 days</small></span><ArrowUpRight size={15} /></button><button><i className="info" /><span><strong>3 interviews begin today</strong><small>First session at 10:30</small></span><ArrowUpRight size={15} /></button></div></article><article className="panel activity-panel"><header><div><h2>Recent activity</h2><p>Latest organisation events</p></div><button>View audit trail</button></header>{activity.map(([title,meta])=><div className="activity-row" key={title}><span /><div><strong>{title}</strong><small>{meta}</small></div></div>)}</article><article className="panel branch-panel"><header><div><h2>Branch performance</h2><p>Today&apos;s service health</p></div></header>{[["Victoria Island",92,"184 served"],["Ikeja",78,"126 served"],["Abuja Central",68,"103 served"]].map(([name,score,meta])=><div className="branch-row" key={String(name)}><div><strong>{name}</strong><small>{meta}</small></div><div className="progress"><span style={{width:`${score}%`}} /></div><b>{score}%</b></div>)}</article></div></section>);
}
