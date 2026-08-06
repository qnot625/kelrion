import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Compass,
  Layers3,
  MapPin,
  Plus,
  Route,
  Save,
  Search,
  Settings2,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  klerionApi,
  type ApiBranch,
  type ApiDepartment,
  type ApiDiscoveredBranch,
  type ApiHoliday,
  type ApiOperatingWindow,
  type ApiService,
  type ApiServiceRequirement,
} from "../../lib/api";
import type { KlerionSession } from "../../lib/session";

type Tab = "locations" | "services" | "routing";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

const demoBranches: ApiBranch[] = [
  { id: "branch-demo-central", tenantId: "demo", slug: "central-office", name: "Central Office", status: "active", address: "14 Marina Road, Lagos", latitude: 6.4541, longitude: 3.3947 },
  { id: "branch-demo-ikeja", tenantId: "demo", slug: "ikeja-service-centre", name: "Ikeja Service Centre", status: "active", address: "22 Allen Avenue, Ikeja", latitude: 6.6018, longitude: 3.3515 },
  { id: "branch-demo-annex", tenantId: "demo", slug: "operations-annex", name: "Operations Annex", status: "inactive", address: "7 Broad Street, Lagos", latitude: 6.4502, longitude: 3.3984 },
];

const demoServices: ApiService[] = [
  { id: "service-demo-consult", tenantId: "demo", code: "CONSULT", name: "General consultation", description: "Standard customer consultation and document review.", durationMinutes: 30, status: "active", requirement: { photoIdRequired: true, minAge: null, maxAge: null, requiredDocuments: ["Appointment confirmation"], customNotes: null } },
  { id: "service-demo-verify", tenantId: "demo", code: "VERIFY", name: "Identity verification", description: "Identity and supporting-document verification.", durationMinutes: 20, status: "active", requirement: { photoIdRequired: true, minAge: 18, maxAge: null, requiredDocuments: ["Proof of address"], customNotes: "Original documents are required." } },
];

const demoDepartments: ApiDepartment[] = [
  { id: "department-demo-front", tenantId: "demo", branchId: "branch-demo-central", name: "Front desk", slug: "front-desk", capacity: 4 },
  { id: "department-demo-review", tenantId: "demo", branchId: "branch-demo-central", name: "Document review", slug: "document-review", capacity: 6 },
];

const demoWindows: ApiOperatingWindow[] = [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, openMinutes: 540, closeMinutes: 1020 }));

function timeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function demoDiscovery(branches: readonly ApiBranch[], serviceId?: string): ApiDiscoveredBranch[] {
  return branches.filter((branch) => branch.status === "active").map((branch, index) => ({
    branchId: branch.id,
    tenantId: branch.tenantId,
    branchName: branch.name,
    status: branch.status,
    address: branch.address,
    latitude: branch.latitude,
    longitude: branch.longitude,
    totalCapacity: index === 0 ? 10 : 6,
    activeBookingsCount: index === 0 ? 3 : 5,
    offeredServiceIds: serviceId ? [serviceId] : demoServices.map((service) => service.id),
    loadLevel: index === 0 ? "low" : "high",
    loadRatio: index === 0 ? 0.3 : 0.83,
    distanceKm: index === 0 ? 1.8 : 8.4,
  }));
}

export function BranchesView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.includes("owner");
  const [tab, setTab] = useState<Tab>("locations");
  const [branches, setBranches] = useState<ApiBranch[]>(session.mode === "demo" ? demoBranches : []);
  const [services, setServices] = useState<ApiService[]>(session.mode === "demo" ? demoServices : []);
  const [loading, setLoading] = useState(session.mode === "live");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [branchDialog, setBranchDialog] = useState(false);
  const [serviceDialog, setServiceDialog] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<ApiBranch | null>(null);

  const loadCore = useCallback(async () => {
    if (session.mode !== "live") return;
    setLoading(true);
    setNotice("");
    try {
      const [nextBranches, nextServices] = await Promise.all([
        klerionApi.listBranches(session),
        klerionApi.listServices(session),
      ]);
      setBranches(nextBranches);
      setServices(nextServices);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to load branch operations.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void loadCore(); }, [loadCore]);

  const filteredBranches = useMemo(() => branches.filter((branch) =>
    `${branch.name} ${branch.slug} ${branch.address}`.toLowerCase().includes(query.toLowerCase()),
  ), [branches, query]);

  const activeBranches = branches.filter((branch) => branch.status === "active").length;
  const activeServices = services.filter((service) => service.status === "active").length;

  async function toggleBranch(branch: ApiBranch) {
    const status = branch.status === "active" ? "inactive" : "active";
    if (session.mode === "demo") {
      setBranches((current) => current.map((item) => item.id === branch.id ? { ...item, status } : item));
      return;
    }
    try {
      const updated = await klerionApi.updateBranch(session, branch.id, { status });
      setBranches((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to update branch status.");
    }
  }

  async function toggleService(service: ApiService) {
    const status = service.status === "active" ? "inactive" : "active";
    if (session.mode === "demo") {
      setServices((current) => current.map((item) => item.id === service.id ? { ...item, status } : item));
      return;
    }
    try {
      const updated = await klerionApi.updateService(session, service.id, { status });
      setServices((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to update service status.");
    }
  }

  return (
    <section className="view branch-ops-view">
      <header className="view-heading">
        <div><span className="eyebrow"><Building2 size={14} />Customer operations</span><h1>Branches & services</h1><p>Manage locations, capacity, calendars, service requirements and customer routing.</p></div>
        {canManage && <button className="primary" onClick={() => tab === "services" ? setServiceDialog(true) : setBranchDialog(true)}><Plus size={16} />{tab === "services" ? "Create service" : "Create branch"}</button>}
      </header>

      <div className="branch-metrics">
        <article><Building2 /><span><small>Locations</small><strong>{branches.length}</strong></span></article>
        <article><CheckCircle2 /><span><small>Active branches</small><strong>{activeBranches}</strong></span></article>
        <article><Layers3 /><span><small>Active services</small><strong>{activeServices}</strong></span></article>
        <article><Route /><span><small>Routing engine</small><strong>Live</strong></span></article>
      </div>

      <div className="branch-tabs" role="tablist">
        <button className={tab === "locations" ? "active" : ""} onClick={() => setTab("locations")}><MapPin size={15} />Locations</button>
        <button className={tab === "services" ? "active" : ""} onClick={() => setTab("services")}><Layers3 size={15} />Service catalogue</button>
        <button className={tab === "routing" ? "active" : ""} onClick={() => setTab("routing")}><Compass size={15} />Discovery & routing</button>
      </div>

      {notice && <div className="inline-alert">{notice}</div>}
      {loading ? <div className="panel branch-loading">Loading branch operations…</div> : tab === "locations" ? (
        <LocationsPanel
          branches={filteredBranches}
          query={query}
          onQuery={setQuery}
          canManage={canManage}
          onManage={setSelectedBranch}
          onToggle={(branch) => void toggleBranch(branch)}
        />
      ) : tab === "services" ? (
        <ServicesPanel services={services} canManage={canManage} onToggle={(service) => void toggleService(service)} />
      ) : (
        <RoutingPanel session={session} branches={branches} services={services} />
      )}

      {branchDialog && <CreateBranchDialog session={session} onClose={() => setBranchDialog(false)} onCreated={(branch) => { setBranches((current) => [...current, branch]); setBranchDialog(false); }} />}
      {serviceDialog && <CreateServiceDialog session={session} onClose={() => setServiceDialog(false)} onCreated={(service) => { setServices((current) => [...current, service]); setServiceDialog(false); }} />}
      {selectedBranch && <BranchSettings
        session={session}
        branch={selectedBranch}
        services={services}
        canManage={canManage}
        onClose={() => setSelectedBranch(null)}
      />}
    </section>
  );
}

function LocationsPanel({ branches, query, onQuery, canManage, onManage, onToggle }: {
  readonly branches: readonly ApiBranch[];
  readonly query: string;
  readonly onQuery: (value: string) => void;
  readonly canManage: boolean;
  readonly onManage: (branch: ApiBranch) => void;
  readonly onToggle: (branch: ApiBranch) => void;
}) {
  return <>
    <div className="toolbar"><label><Search size={15} /><input id="branch-search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search by branch name, slug or address" /></label></div>
    <div className="panel table-panel"><table><thead><tr><th>Branch</th><th>Address</th><th>Coordinates</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {branches.length === 0 ? <tr><td colSpan={5} className="empty-cell">No branches match this search.</td></tr> : branches.map((branch) => <tr key={branch.id}>
        <td><div className="identity-cell"><span>{branch.name.slice(0, 2).toUpperCase()}</span><div><strong>{branch.name}</strong><small>{branch.slug}</small></div></div></td>
        <td>{branch.address}</td><td>{branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}</td>
        <td><span className={`ops-status ${branch.status}`}>{branch.status}</span></td>
        <td><div className="row-actions"><button onClick={() => onManage(branch)}><Settings2 size={14} />Manage</button>{canManage && <button onClick={() => onToggle(branch)}>{branch.status === "active" ? "Deactivate" : "Activate"}</button>}</div></td>
      </tr>)}
    </tbody></table></div>
  </>;
}

function ServicesPanel({ services, canManage, onToggle }: { readonly services: readonly ApiService[]; readonly canManage: boolean; readonly onToggle: (service: ApiService) => void }) {
  return <div className="panel table-panel"><table><thead><tr><th>Service</th><th>Duration</th><th>Requirements</th><th>Status</th><th>Action</th></tr></thead><tbody>
    {services.length === 0 ? <tr><td colSpan={5} className="empty-cell">No services have been created.</td></tr> : services.map((service) => <tr key={service.id}>
      <td><div className="identity-cell"><span>{service.code.slice(0, 2)}</span><div><strong>{service.name}</strong><small>{service.code} · {service.description ?? "No description"}</small></div></div></td>
      <td><span className="inline-icon"><Clock3 size={14} />{service.durationMinutes} minutes</span></td>
      <td><div className="requirement-summary">{service.requirement?.photoIdRequired && <em>Photo ID</em>}{service.requirement?.minAge !== null && service.requirement?.minAge !== undefined && <em>Age {service.requirement.minAge}+</em>}{service.requirement?.requiredDocuments.map((document) => <em key={document}>{document}</em>)}{!service.requirement && <small>None</small>}</div></td>
      <td><span className={`ops-status ${service.status}`}>{service.status}</span></td>
      <td>{canManage && <button className="secondary compact" onClick={() => onToggle(service)}>{service.status === "active" ? "Deactivate" : "Activate"}</button>}</td>
    </tr>)}
  </tbody></table></div>;
}

function RoutingPanel({ session, branches, services }: { readonly session: KlerionSession; readonly branches: readonly ApiBranch[]; readonly services: readonly ApiService[] }) {
  const [serviceId, setServiceId] = useState(services.find((service) => service.status === "active")?.id ?? "");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [results, setResults] = useState<ApiDiscoveredBranch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function discover(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const query = {
        ...(serviceId ? { serviceId } : {}),
        ...(latitude && longitude ? { latitude: Number(latitude), longitude: Number(longitude) } : {}),
      };
      const next = session.mode === "demo" ? demoDiscovery(branches, serviceId || undefined) : await klerionApi.discoverBranches(session, query);
      setResults(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to route branches.");
    } finally { setBusy(false); }
  }

  return <section className="routing-layout">
    <form className="panel routing-form" onSubmit={discover}><header><div><h2>Find the best branch</h2><p>Rank eligible locations by capacity load, proximity and current demand.</p></div><Compass /></header>
      <label>Service<select id="routing-service" value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Any active service</option>{services.filter((service) => service.status === "active").map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
      <div className="form-grid compact-grid"><label>Latitude<input id="routing-latitude" type="number" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="6.4541" /></label><label>Longitude<input id="routing-longitude" type="number" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="3.3947" /></label></div>
      {error && <div className="form-error">{error}</div>}<button className="primary" disabled={busy}>{busy ? "Calculating…" : "Route customer"}</button>
    </form>
    <div className="routing-results">{results.length === 0 ? <div className="panel routing-empty"><Route size={28} /><strong>No routing result yet</strong><p>Select a service and optionally provide customer coordinates.</p></div> : results.map((result, index) => <article className="panel route-card" key={result.branchId}>
      <span className="route-rank">#{index + 1}</span><div><strong>{result.branchName}</strong><small><MapPin size={12} />{result.address}</small></div><em className={`load-badge ${result.loadLevel}`}>{result.loadLevel} load</em>
      <dl><div><dt>Capacity</dt><dd>{result.activeBookingsCount}/{result.totalCapacity}</dd></div><div><dt>Utilisation</dt><dd>{Math.round(result.loadRatio * 100)}%</dd></div><div><dt>Distance</dt><dd>{result.distanceKm === undefined ? "—" : `${result.distanceKm} km`}</dd></div></dl>
    </article>)}</div>
  </section>;
}

function CreateBranchDialog({ session, onClose, onCreated }: { readonly session: KlerionSession; readonly onClose: () => void; readonly onCreated: (branch: ApiBranch) => void }) {
  const [name, setName] = useState(""); const [slug, setSlug] = useState(""); const [address, setAddress] = useState(""); const [latitude, setLatitude] = useState(""); const [longitude, setLongitude] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const input = { name: name.trim(), slug: slug || slugify(name), address: address.trim(), latitude: Number(latitude), longitude: Number(longitude) }; const branch = session.mode === "demo" ? { id: `branch-${Date.now()}`, tenantId: "demo", status: "active" as const, ...input } : await klerionApi.createBranch(session, input); onCreated(branch); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create branch."); } finally { setBusy(false); } }
  return <Dialog title="Create branch" subtitle="Register a physical service location." onClose={onClose}><form className="ops-form" onSubmit={submit}><label>Name<input id="new-branch-name" required value={name} onChange={(event) => { setName(event.target.value); setSlug(slugify(event.target.value)); }} /></label><label>Slug<input id="new-branch-slug" required value={slug} onChange={(event) => setSlug(slugify(event.target.value))} /></label><label className="full">Address<input id="new-branch-address" required value={address} onChange={(event) => setAddress(event.target.value)} /></label><label>Latitude<input id="new-branch-latitude" type="number" step="any" required value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label><label>Longitude<input id="new-branch-longitude" type="number" step="any" required value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label>{error && <div className="form-error full">{error}</div>}<footer className="full"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}><Plus size={15} />{busy ? "Creating…" : "Create branch"}</button></footer></form></Dialog>;
}

function CreateServiceDialog({ session, onClose, onCreated }: { readonly session: KlerionSession; readonly onClose: () => void; readonly onCreated: (service: ApiService) => void }) {
  const [code, setCode] = useState(""); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [duration, setDuration] = useState("30"); const [photoId, setPhotoId] = useState(false); const [documents, setDocuments] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const requirement: Omit<ApiServiceRequirement, "id" | "tenantId" | "serviceId"> = { photoIdRequired: photoId, minAge: null, maxAge: null, requiredDocuments: documents.split(",").map((item) => item.trim()).filter(Boolean), customNotes: null }; const input = { code: code.toUpperCase(), name: name.trim(), description: description.trim() || null, durationMinutes: Number(duration), status: "active" as const, requirements: requirement }; const service = session.mode === "demo" ? { id: `service-${Date.now()}`, tenantId: "demo", requirement, ...input } : await klerionApi.createService(session, input); onCreated(service); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create service."); } finally { setBusy(false); } }
  return <Dialog title="Create service" subtitle="Add a catalogue item and its customer requirements." onClose={onClose}><form className="ops-form" onSubmit={submit}><label>Code<input id="new-service-code" required value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))} /></label><label>Name<input id="new-service-name" required value={name} onChange={(event) => setName(event.target.value)} /></label><label>Duration (minutes)<input id="new-service-duration" type="number" min="1" max="480" required value={duration} onChange={(event) => setDuration(event.target.value)} /></label><label className="check-label"><input id="new-service-photo-id" type="checkbox" checked={photoId} onChange={(event) => setPhotoId(event.target.checked)} />Photo ID required</label><label className="full">Description<textarea id="new-service-description" value={description} onChange={(event) => setDescription(event.target.value)} /></label><label className="full">Required documents<input id="new-service-documents" value={documents} onChange={(event) => setDocuments(event.target.value)} placeholder="Proof of address, application form" /></label>{error && <div className="form-error full">{error}</div>}<footer className="full"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}><Plus size={15} />{busy ? "Creating…" : "Create service"}</button></footer></form></Dialog>;
}

function BranchSettings({ session, branch, services, canManage, onClose }: { readonly session: KlerionSession; readonly branch: ApiBranch; readonly services: readonly ApiService[]; readonly canManage: boolean; readonly onClose: () => void }) {
  const [departments, setDepartments] = useState<ApiDepartment[]>(session.mode === "demo" ? demoDepartments.map((item) => ({ ...item, branchId: branch.id })) : []);
  const [windows, setWindows] = useState<ApiOperatingWindow[]>(session.mode === "demo" ? demoWindows : []);
  const [holidays, setHolidays] = useState<ApiHoliday[]>([]);
  const [mapped, setMapped] = useState<ApiService[]>(session.mode === "demo" ? demoServices.slice(0, 1) : []);
  const [notice, setNotice] = useState("");
  const [departmentName, setDepartmentName] = useState(""); const [capacity, setCapacity] = useState("1");
  const [holidayName, setHolidayName] = useState(""); const [holidayStart, setHolidayStart] = useState(""); const [holidayEnd, setHolidayEnd] = useState("");
  const [hours, setHours] = useState(() => days.map((_, dayOfWeek) => { const existing = demoWindows.find((item) => item.dayOfWeek === dayOfWeek); return { dayOfWeek, enabled: Boolean(existing), open: existing ? timeFromMinutes(existing.openMinutes) : "09:00", close: existing ? timeFromMinutes(existing.closeMinutes) : "17:00" }; }));

  useEffect(() => {
    if (session.mode !== "live") return;
    let active = true;
    void Promise.all([
      klerionApi.listDepartments(session, branch.id),
      klerionApi.getOperatingWindows(session, branch.id),
      klerionApi.listBranchHolidays(session, branch.id),
      klerionApi.listBranchServices(session, branch.id),
    ]).then(([nextDepartments, nextWindows, nextHolidays, nextMapped]) => {
      if (!active) return;
      setDepartments(nextDepartments); setWindows(nextWindows); setHolidays(nextHolidays); setMapped(nextMapped);
      setHours(days.map((_, dayOfWeek) => { const existing = nextWindows.find((item) => item.dayOfWeek === dayOfWeek); return { dayOfWeek, enabled: Boolean(existing), open: existing ? timeFromMinutes(existing.openMinutes) : "09:00", close: existing ? timeFromMinutes(existing.closeMinutes) : "17:00" }; }));
    }).catch((cause) => setNotice(cause instanceof Error ? cause.message : "Unable to load branch settings."));
    return () => { active = false; };
  }, [session, branch.id]);

  async function addDepartment(event: FormEvent) { event.preventDefault(); try { const input = { name: departmentName.trim(), slug: slugify(departmentName), capacity: Number(capacity) }; const created = session.mode === "demo" ? { id: `department-${Date.now()}`, tenantId: "demo", branchId: branch.id, ...input } : await klerionApi.createDepartment(session, branch.id, input); setDepartments((current) => [...current, created]); setDepartmentName(""); setCapacity("1"); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to create department."); } }
  async function removeDepartment(department: ApiDepartment) { try { if (session.mode === "live") await klerionApi.deleteDepartment(session, department.id); setDepartments((current) => current.filter((item) => item.id !== department.id)); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to remove department."); } }
  async function saveHours() { try { const next = hours.filter((item) => item.enabled).map((item) => ({ dayOfWeek: item.dayOfWeek, openMinutes: minutesFromTime(item.open), closeMinutes: minutesFromTime(item.close) })); if (session.mode === "live") await klerionApi.setOperatingWindows(session, branch.id, next); setWindows(next); setNotice("Operating hours saved."); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to save operating hours."); } }
  async function addHoliday(event: FormEvent) { event.preventDefault(); try { const input = { name: holidayName.trim(), startAt: new Date(holidayStart).toISOString(), endAt: new Date(holidayEnd).toISOString() }; const holiday = session.mode === "demo" ? { id: `holiday-${Date.now()}`, tenantId: "demo", branchId: branch.id, ...input } : await klerionApi.createBranchHoliday(session, branch.id, input); setHolidays((current) => [...current, holiday]); setHolidayName(""); setHolidayStart(""); setHolidayEnd(""); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to add closure." ); } }
  async function toggleMapping(service: ApiService) { const exists = mapped.some((item) => item.id === service.id); try { if (session.mode === "live") { if (exists) await klerionApi.removeServiceFromBranch(session, branch.id, service.id); else await klerionApi.assignServiceToBranch(session, branch.id, service.id); } setMapped((current) => exists ? current.filter((item) => item.id !== service.id) : [...current, service]); } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Unable to update service mapping."); } }

  const totalCapacity = departments.reduce((total, department) => total + department.capacity, 0);
  return <div className="ops-drawer-backdrop"><aside className="ops-drawer" aria-label={`${branch.name} settings`}><header><div><span className="eyebrow"><Settings2 size={14} />Branch settings</span><h2>{branch.name}</h2><p>{branch.address}</p></div><button className="icon-button" onClick={onClose} aria-label="Close branch settings"><X size={18} /></button></header>{notice && <div className={notice.endsWith("saved.") ? "success-note" : "inline-alert"}>{notice}</div>}
    <section className="drawer-summary"><article><UsersRound /><span><small>Total capacity</small><strong>{totalCapacity}</strong></span></article><article><Clock3 /><span><small>Operating windows</small><strong>{windows.length}</strong></span></article><article><Layers3 /><span><small>Services mapped</small><strong>{mapped.length}</strong></span></article></section>
    <section className="drawer-section"><header><div><h3>Departments & capacity</h3><p>Define parallel service capacity inside this branch.</p></div></header><div className="department-list">{departments.map((department) => <div key={department.id}><span><strong>{department.name}</strong><small>{department.slug}</small></span><em>{department.capacity} capacity</em>{canManage && <button onClick={() => void removeDepartment(department)} aria-label={`Remove ${department.name}`}><Trash2 size={14} /></button>}</div>)}</div>{canManage && <form className="inline-create" onSubmit={addDepartment}><input required value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder="Department name" /><input type="number" min="1" required value={capacity} onChange={(event) => setCapacity(event.target.value)} aria-label="Capacity" /><button className="secondary compact"><Plus size={14} />Add</button></form>}</section>
    <section className="drawer-section"><header><div><h3>Weekly operating hours</h3><p>Multiple-day windows drive availability calculations.</p></div>{canManage && <button className="secondary compact" onClick={() => void saveHours()}><Save size={14} />Save</button>}</header><div className="hours-grid">{hours.map((item, index) => <div key={item.dayOfWeek}><label><input type="checkbox" disabled={!canManage} checked={item.enabled} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: event.target.checked } : row))} />{days[item.dayOfWeek]}</label><input type="time" disabled={!item.enabled || !canManage} value={item.open} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, open: event.target.value } : row))} /><span>to</span><input type="time" disabled={!item.enabled || !canManage} value={item.close} onChange={(event) => setHours((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, close: event.target.value } : row))} /></div>)}</div></section>
    <section className="drawer-section"><header><div><h3>Exceptional closures</h3><p>Branch holidays are excluded from bookable availability.</p></div></header>{holidays.map((holiday) => <div className="holiday-row" key={holiday.id}><CalendarDays size={16} /><span><strong>{holiday.name}</strong><small>{new Date(holiday.startAt).toLocaleString()} — {new Date(holiday.endAt).toLocaleString()}</small></span>{canManage && <button onClick={() => { if (session.mode === "live") void klerionApi.deleteHoliday(session, holiday.id); setHolidays((current) => current.filter((item) => item.id !== holiday.id)); }}><Trash2 size={14} /></button>}</div>)}{canManage && <form className="holiday-form" onSubmit={addHoliday}><input required value={holidayName} onChange={(event) => setHolidayName(event.target.value)} placeholder="Closure name" /><input type="datetime-local" required value={holidayStart} onChange={(event) => setHolidayStart(event.target.value)} /><input type="datetime-local" required value={holidayEnd} onChange={(event) => setHolidayEnd(event.target.value)} /><button className="secondary compact"><Plus size={14} />Add closure</button></form>}</section>
    <section className="drawer-section"><header><div><h3>Service capability mapping</h3><p>Select the active services delivered at this location.</p></div></header><div className="mapping-grid">{services.map((service) => <label key={service.id}><input type="checkbox" disabled={!canManage} checked={mapped.some((item) => item.id === service.id)} onChange={() => void toggleMapping(service)} /><span><strong>{service.name}</strong><small>{service.code} · {service.durationMinutes} min</small></span></label>)}</div></section>
  </aside></div>;
}

function Dialog({ title, subtitle, onClose, children }: { readonly title: string; readonly subtitle: string; readonly onClose: () => void; readonly children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="ops-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></header>{children}</section></div>;
}
