import {
  CalendarCheck2,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  TicketCheck,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  klerionApi,
  type ApiAppointment,
  type ApiBranch,
  type ApiService,
  type ApiTimeSlot,
  type ApiWaitlistEntry,
} from "../lib/api";
import type { KlerionSession } from "../lib/session";

const preview: ApiAppointment[] = [
  {
    id: "APT-1048", tenantId: "demo", branchId: "demo-central", serviceId: "demo-service",
    customerEmail: "adeola@example.com", serviceName: "Account opening", customerMetadata: {},
    startAt: new Date().toISOString(), endAt: new Date(Date.now() + 1800000).toISOString(),
    status: "booked", createdAt: new Date().toISOString(),
  },
];

function dayWindow(value: string) {
  const start = new Date(`${value}T00:00:00Z`);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + 86400000).toISOString() };
}

export function AppointmentsView({ session }: { readonly session: KlerionSession }) {
  const [items, setItems] = useState<ApiAppointment[]>(session.mode === "demo" ? preview : []);
  const [waitlist, setWaitlist] = useState<ApiWaitlistEntry[]>([]);
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);
  const [branchServices, setBranchServices] = useState<ApiService[]>([]);
  const [slots, setSlots] = useState<ApiTimeSlot[]>([]);
  const [tab, setTab] = useState<"appointments" | "waitlist">("appointments");
  const [loading, setLoading] = useState(session.mode === "live");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [customerEmail, setCustomerEmail] = useState("");
  const [selectedSlot, setSelectedSlot] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (session.mode !== "live") return;
    setLoading(true);
    setNotice("");
    try {
      const [appointments, nextWaitlist, nextBranches, nextServices] = await Promise.all([
        klerionApi.listAppointments(session),
        klerionApi.listWaitlists(session),
        klerionApi.listBranches(session),
        klerionApi.listServices(session),
      ]);
      setItems(appointments);
      setWaitlist(nextWaitlist);
      setBranches(nextBranches);
      setServices(nextServices);
      if (!branchId && nextBranches[0]) setBranchId(nextBranches[0].id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load scheduling operations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.token]);

  useEffect(() => {
    setServiceId("");
    setSlots([]);
    setSelectedSlot("");
    if (!branchId || session.mode !== "live") {
      setBranchServices(session.mode === "demo" ? services : []);
      return;
    }
    void klerionApi.listBranchServices(session, branchId)
      .then((next) => { setBranchServices(next); if (next[0]) setServiceId(next[0].id); })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load branch services."));
  }, [branchId, session.token]);

  useEffect(() => {
    setSlots([]);
    setSelectedSlot("");
    if (!branchId || !serviceId || !date || session.mode !== "live") return;
    const window = dayWindow(date);
    void klerionApi.appointmentAvailability(session, { branchId, serviceId, ...window })
      .then(setSlots)
      .catch((error) => setNotice(error instanceof Error ? error.message : "Unable to calculate availability."));
  }, [branchId, serviceId, date, session.token]);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesText = `${item.customerEmail} ${item.serviceName}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (status === "all" || item.status === status);
  }), [items, query, status]);

  async function book(event: FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return;
    const slot = slots.find((candidate) => candidate.startAt === selectedSlot);
    if (!slot) return;
    setBusy(true); setNotice("");
    try {
      if (session.mode === "demo") {
        setItems((current) => [...current, { ...preview[0], id: `APT-${Date.now()}`, customerEmail, startAt: slot.startAt, endAt: slot.endAt }]);
      } else {
        const created = await klerionApi.createAppointment(session, { branchId, serviceId, customerEmail, startAt: slot.startAt, endAt: slot.endAt });
        setItems((current) => [...current, created].sort((a, b) => a.startAt.localeCompare(b.startAt)));
        const window = dayWindow(date);
        setSlots(await klerionApi.appointmentAvailability(session, { branchId, serviceId, ...window }));
      }
      setCustomerEmail(""); setSelectedSlot("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create appointment.");
    } finally { setBusy(false); }
  }

  async function reschedule(item: ApiAppointment) {
    const value = window.prompt("Enter the new start time in ISO format", item.startAt);
    if (!value) return;
    const nextStart = new Date(value);
    if (Number.isNaN(nextStart.getTime())) { setNotice("Enter a valid ISO date and time."); return; }
    const duration = new Date(item.endAt).getTime() - new Date(item.startAt).getTime();
    const nextEnd = new Date(nextStart.getTime() + duration).toISOString();
    if (session.mode !== "live") {
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, startAt: nextStart.toISOString(), endAt: nextEnd } : row));
      return;
    }
    try {
      const updated = await klerionApi.rescheduleAppointment(session, item.id, nextStart.toISOString(), nextEnd);
      setItems((current) => current.map((row) => row.id === item.id ? updated : row));
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to reschedule appointment."); }
  }

  async function joinWaitlist() {
    if (!branchId || !serviceId || !customerEmail) return;
    setBusy(true); setNotice("");
    try {
      if (session.mode === "live") {
        const entry = await klerionApi.addToWaitlist(session, { branchId, serviceId, customerEmail });
        setWaitlist((current) => [...current, entry]);
        setNotice(`${customerEmail} joined the waitlist at position ${entry.queuePosition}.`);
      }
      setCustomerEmail("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to join waitlist."); }
    finally { setBusy(false); }
  }

  async function transition(item: ApiAppointment, action: "check-in" | "complete" | "cancel" | "no-show") {
    if (session.mode !== "live") {
      const nextStatus = action === "check-in" ? "checked_in" : action === "complete" ? "completed" : action === "cancel" ? "cancelled" : "no_show";
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, status: nextStatus } : row));
      return;
    }
    setNotice("");
    try {
      const updated = action === "check-in" ? await klerionApi.checkInAppointment(session, item.id)
        : action === "complete" ? await klerionApi.completeAppointment(session, item.id)
          : action === "cancel" ? await klerionApi.cancelAppointment(session, item.id)
            : await klerionApi.markAppointmentNoShow(session, item.id);
      setItems((current) => current.map((row) => row.id === item.id ? updated : row));
      if (action === "cancel" || action === "no-show") await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Action failed."); }
  }

  async function removeWaitlist(id: string) {
    if (session.mode !== "live") { setWaitlist((current) => current.filter((entry) => entry.id !== id)); return; }
    try {
      const updated = await klerionApi.removeFromWaitlist(session, id);
      setWaitlist((current) => current.map((entry) => entry.id === id ? updated : entry));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to remove waitlist entry."); }
  }

  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
  const serviceNames = new Map(services.map((service) => [service.id, service.name]));

  return <section className="view scheduling-view">
    <header className="view-heading"><div><span className="eyebrow">Service operations</span><h1>Appointments & waitlists</h1><p>Search real availability, protect branch capacity and promote customers from FIFO waitlists.</p></div><div className="heading-actions"><button className="secondary" onClick={() => { window.location.hash = `book/${session.tenantSlug}`; }}><CalendarCheck2 size={16}/>Public booking</button><button className="secondary" onClick={() => void load()}><RefreshCw size={16}/>Refresh</button></div></header>
    {notice && <div className="inline-alert">{notice}</div>}
    <div className="scheduling-tabs"><button className={tab === "appointments" ? "active" : ""} onClick={() => setTab("appointments")}><CalendarRange size={15}/>Appointments <span>{items.length}</span></button><button className={tab === "waitlist" ? "active" : ""} onClick={() => setTab("waitlist")}><TicketCheck size={15}/>Waitlist <span>{waitlist.filter((entry) => entry.status === "waiting").length}</span></button></div>

    {tab === "appointments" ? <>
      <div className="scheduling-layout">
        <form className="panel booking-composer" onSubmit={book}>
          <header><CalendarPlus size={18}/><div><h2>Book from availability</h2><p>Slots use branch hours, closures, service duration and active capacity.</p></div></header>
          <label>Branch<select required value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label>Service<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Select service</option>{branchServices.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}</select></label>
          <label>Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)}/></label>
          <label>Customer email<input type="email" required value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} placeholder="visitor@example.com"/></label>
          <div className="slot-picker"><span>Available times</span>{slots.length ? <div>{slots.map((slot) => <button type="button" className={selectedSlot === slot.startAt ? "selected" : ""} key={slot.startAt} onClick={() => setSelectedSlot(slot.startAt)}>{new Date(slot.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</button>)}</div> : <small>No available times for this selection.</small>}</div>
          <button className="primary" disabled={busy || !selectedSlot}><CalendarPlus size={15}/>{busy ? "Booking…" : "Book appointment"}</button>
          {!slots.length && branchId && serviceId && customerEmail && <button type="button" className="secondary waitlist-action" disabled={busy} onClick={() => void joinWaitlist()}><TicketCheck size={15}/>Join waitlist instead</button>}
        </form>
        <section className="scheduling-summary"><article className="panel"><strong>{items.filter((item) => item.status === "booked").length}</strong><span>Upcoming bookings</span></article><article className="panel"><strong>{items.filter((item) => item.status === "checked_in").length}</strong><span>Checked in</span></article><article className="panel"><strong>{waitlist.filter((entry) => entry.status === "waiting").length}</strong><span>Waiting customers</span></article></section>
      </div>
      <div className="toolbar"><label><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer or service"/></label><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="booked">Booked</option><option value="checked_in">Checked in</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="no_show">No show</option></select></div>
      <article className="panel table-panel"><table><thead><tr><th>Customer</th><th>Location & service</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead><tbody>{loading ? <tr><td colSpan={5}>Loading appointments…</td></tr> : filtered.length ? filtered.map((item) => <tr key={item.id}><td><div className="identity-cell"><span>{item.customerEmail[0]?.toUpperCase()}</span><div><strong>{item.customerEmail}</strong><small>{item.id}</small></div></div></td><td><div className="stack"><strong>{item.serviceName}</strong><small>{item.branchId ? branchNames.get(item.branchId) ?? item.branchId : "Legacy booking"}</small></div></td><td><div className="stack"><strong>{new Date(item.startAt).toLocaleDateString()}</strong><small><Clock3 size={13}/>{new Date(item.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div></td><td><span className={`status ${item.status}`}>{item.status.replace("_", " ")}</span></td><td><div className="row-actions">{item.status === "booked" && <><button onClick={() => void reschedule(item)}><CalendarRange size={14}/>Reschedule</button><button onClick={() => void transition(item, "check-in")}><UserCheck size={14}/>Check in</button><button onClick={() => void transition(item, "no-show")}><UserX size={14}/>No show</button><button onClick={() => void transition(item, "cancel")}><XCircle size={14}/>Cancel</button></>}{item.status === "checked_in" && <button onClick={() => void transition(item, "complete")}><CheckCircle2 size={14}/>Complete</button>}</div></td></tr>) : <tr><td colSpan={5} className="empty-cell">No appointments match the current filters.</td></tr>}</tbody></table></article>
    </> : <article className="panel table-panel"><table><thead><tr><th>Position</th><th>Customer</th><th>Branch & service</th><th>Preferred slot</th><th>Status</th><th>Action</th></tr></thead><tbody>{waitlist.length ? waitlist.map((entry) => <tr key={entry.id}><td><strong>#{entry.queuePosition}</strong></td><td>{entry.customerEmail}</td><td><div className="stack"><strong>{serviceNames.get(entry.serviceId) ?? entry.serviceId}</strong><small>{branchNames.get(entry.branchId) ?? entry.branchId}</small></div></td><td>{entry.desiredStartAt ? new Date(entry.desiredStartAt).toLocaleString() : "Any opening"}</td><td><span className={`status ${entry.status}`}>{entry.status}</span></td><td>{entry.status === "waiting" && <button className="secondary" onClick={() => void removeWaitlist(entry.id)}>Remove</button>}</td></tr>) : <tr><td colSpan={6} className="empty-cell">No waitlist entries.</td></tr>}</tbody></table></article>}
  </section>;
}
