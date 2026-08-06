import { ArrowLeft, CalendarCheck2, Clock3, MapPin, TicketCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Brand } from "../components/Brand";
import { klerionApi, type ApiAppointment, type ApiBranch, type ApiService, type ApiTimeSlot } from "../lib/api";

function windowFor(date: string) {
  const start = new Date(`${date}T00:00:00Z`);
  return { startAt: start.toISOString(), endAt: new Date(start.getTime() + 86400000).toISOString() };
}

export function PublicBookingView({ tenantSlug }: { readonly tenantSlug: string }) {
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);
  const [branchId, setBranchId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<ApiTimeSlot[]>([]);
  const [slot, setSlot] = useState<ApiTimeSlot | null>(null);
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<ApiAppointment | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void klerionApi.listPublicBranches(tenantSlug).then((next) => {
      setBranches(next); if (next[0]) setBranchId(next[0].id);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load locations."));
  }, [tenantSlug]);

  useEffect(() => {
    setServices([]); setServiceId(""); setSlots([]); setSlot(null);
    if (!branchId) return;
    void klerionApi.listPublicBranchServices(tenantSlug, branchId).then((next) => {
      setServices(next); if (next[0]) setServiceId(next[0].id);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load services."));
  }, [tenantSlug, branchId]);

  useEffect(() => {
    setSlots([]); setSlot(null);
    if (!branchId || !serviceId || !date) return;
    void klerionApi.publicAppointmentAvailability(tenantSlug, { branchId, serviceId, ...windowFor(date) })
      .then(setSlots).catch((error) => setNotice(error instanceof Error ? error.message : "Unable to calculate availability."));
  }, [tenantSlug, branchId, serviceId, date]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!slot) return;
    setBusy(true); setNotice("");
    try {
      setResult(await klerionApi.publicBookAppointment(tenantSlug, {
        branchId, serviceId, customerEmail: email, startAt: slot.startAt, endAt: slot.endAt,
      }));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to complete booking."); }
    finally { setBusy(false); }
  }

  async function joinWaitlist() {
    setBusy(true); setNotice("");
    try {
      const entry = await klerionApi.publicJoinWaitlist(tenantSlug, { branchId, serviceId, customerEmail: email });
      setNotice(`You are number ${entry.queuePosition} on the waitlist.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to join the waitlist."); }
    finally { setBusy(false); }
  }

  if (result) return <main className="public-booking-page"><section className="booking-confirmation"><Brand/><span><CalendarCheck2/></span><h1>Appointment confirmed</h1><p>{result.serviceName} is booked for {new Date(result.startAt).toLocaleString()}.</p><code>{result.id}</code><button onClick={() => { setResult(null); setSlot(null); }} className="primary">Book another</button></section></main>;

  return <main className="public-booking-page"><header><Brand/><a href="#"><ArrowLeft size={15}/>Organisation sign in</a></header><section className="public-booking-shell"><aside><span className="eyebrow">Secure self-service booking</span><h1>Choose the best time for your visit.</h1><p>Availability reflects live branch hours, closures, service duration and operational capacity.</p><div><MapPin/><span><strong>{branches.find((branch) => branch.id === branchId)?.name ?? "Select a location"}</strong><small>{branches.find((branch) => branch.id === branchId)?.address}</small></span></div><div><Clock3/><span><strong>Live availability</strong><small>Times disappear as capacity is reserved.</small></span></div></aside><form onSubmit={submit}><h2>Book an appointment</h2>{notice && <div className="inline-alert">{notice}</div>}<label>Location<select required value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Select location</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Service<select required value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Select service</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}</select></label><label>Date<input type="date" required value={date} onChange={(event) => setDate(event.target.value)}/></label><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com"/></label><div className="public-slots"><span>Available times</span>{slots.length ? <div>{slots.map((candidate) => <button type="button" className={slot?.startAt === candidate.startAt ? "selected" : ""} key={candidate.startAt} onClick={() => setSlot(candidate)}>{new Date(candidate.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</button>)}</div> : <p>No slots are open for this date.</p>}</div><button className="primary" disabled={!slot || busy}><CalendarCheck2 size={16}/>{busy ? "Confirming…" : "Confirm appointment"}</button>{!slots.length && branchId && serviceId && email && <button type="button" className="secondary" disabled={busy} onClick={() => void joinWaitlist()}><TicketCheck size={16}/>Join waitlist</button>}</form></section></main>;
}
