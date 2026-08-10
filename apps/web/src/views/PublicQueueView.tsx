import { Clock3, Monitor, RefreshCw, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { queueApi, type PublicQueueDisplay, type PublicQueueStatus } from "../features/queue/queueApi";
import "../features/queue/queue.css";
import { Brand } from "../components/Brand";

function time(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

export function PublicQueueDisplayView({ tenantSlug, branchId, serviceId }: {
  readonly tenantSlug: string;
  readonly branchId: string;
  readonly serviceId?: string;
}) {
  const [display, setDisplay] = useState<PublicQueueDisplay | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setDisplay(await queueApi.publicDisplay(tenantSlug, branchId, serviceId)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load queue display"); }
  }, [tenantSlug, branchId, serviceId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(interval);
  }, [load]);

  return <main className="queue-public-page">
    <div className="queue-display public"><header><Brand /><div><h2>Now serving</h2><span className="queue-display-waiting"><span className="queue-live-dot" />{display?.waiting ?? 0} waiting</span></div><Monitor size={34} /></header>
      {error ? <div className="queue-empty">{error}</div> : <div className="queue-display-grid">{display?.active.map((entry) => <article className="queue-display-card" key={`${entry.ticketNumber}-${entry.stationId}`}><strong>{entry.ticketNumber}</strong><span>{entry.status === "CALLED" ? "Please proceed to" : "Now serving at"}</span><span className="queue-station">{entry.stationId ?? "Service point"}</span><small>{time(entry.calledAt)}</small></article>)}{display && display.active.length === 0 && <div className="queue-empty">No tickets are currently being called or served.</div>}</div>}
      <footer><span>Updated {time(display?.generatedAt ?? null)}</span><button onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></footer>
    </div>
  </main>;
}

export function PublicQueueStatusView({ tenantSlug, publicToken }: {
  readonly tenantSlug: string;
  readonly publicToken: string;
}) {
  const [ticket, setTicket] = useState<PublicQueueStatus | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setTicket(await queueApi.publicStatus(tenantSlug, publicToken)); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not find this queue ticket"); }
  }, [tenantSlug, publicToken]);

  useEffect(() => {
    void load();
    const terminal = ticket && ["COMPLETED", "CANCELLED", "NO_SHOW", "TRANSFERRED"].includes(ticket.status);
    if (terminal) return;
    const interval = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(interval);
  }, [load, ticket?.status]);

  return <main className="queue-public-page"><section className="panel queue-public-status"><Brand />{error ? <div className="queue-empty">{error}</div> : ticket ? <><div className="queue-ticket-hero"><TicketCheck size={28} /><span>Your ticket</span><strong>{ticket.ticketNumber}</strong><div className="queue-status">{ticket.status}</div>{ticket.stationId && <p>Proceed to <b>{ticket.stationId}</b></p>}</div><div className="queue-public-details"><div><Clock3 size={17} /><span>Checked in</span><strong>{time(ticket.checkedInAt)}</strong></div><div><span>Called</span><strong>{time(ticket.calledAt)}</strong></div><div><span>Service started</span><strong>{time(ticket.serviceStartedAt)}</strong></div></div><button className="secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh status</button></> : <div className="queue-empty">Loading ticket…</div>}</section></main>;
}
