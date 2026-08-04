import { CalendarPlus, CheckCircle2, Clock3, MoreHorizontal, Search, UserCheck, X, Calendar, ArrowRight, Trash2, AlertCircle, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { klerionApi, type ApiAppointment, type ApiBranch, type ApiService } from "../lib/api";
import type { KlerionSession } from "../lib/session";
import { BookingForm } from "../features/appointments/BookingForm";

const preview: ApiAppointment[] = [
  { id: "APT-1048", tenantId: "demo", customerEmail: "adeola@example.com", serviceName: "Account opening", startAt: new Date().toISOString(), endAt: new Date(Date.now() + 1800000).toISOString(), status: "booked", createdAt: new Date().toISOString() },
  { id: "APT-1047", tenantId: "demo", customerEmail: "chidi@example.com", serviceName: "Document verification", startAt: new Date(Date.now() + 3600000).toISOString(), endAt: new Date(Date.now() + 5400000).toISOString(), status: "checked_in", createdAt: new Date().toISOString() },
  { id: "APT-1046", tenantId: "demo", customerEmail: "fatima@example.com", serviceName: "Loan inquiry", startAt: new Date(Date.now() + 7200000).toISOString(), endAt: new Date(Date.now() + 9000000).toISOString(), status: "completed", createdAt: new Date().toISOString() },
];

export function AppointmentsView({ session }: { readonly session: KlerionSession }) {
  const [items, setItems] = useState<ApiAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);

  // Filtering states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");

  // Dialog / Modal states
  const [showNewModal, setShowNewModal] = useState(false);
  const [rescheduleItem, setRescheduleItem] = useState<ApiAppointment | null>(null);
  const [cancelItem, setCancelItem] = useState<ApiAppointment | null>(null);

  // Reschedule form states
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleError, setRescheduleError] = useState("");
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Refresh trigger
  const [refreshKey, setRefreshKey] = useState(0);

  // Load baseline data (appointments, branches, services)
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        setLoading(true);
        if (session.mode === "live") {
          const [appsData, branchesData, servicesData] = await Promise.all([
            klerionApi.listAppointments(session),
            klerionApi.listBranches(session),
            klerionApi.listServices(session),
          ]);
          if (active) {
            setItems(appsData);
            setBranches(branchesData);
            setServices(servicesData);
          }
        } else {
          // Demo Mode
          if (active) {
            setItems(preview);
            setBranches([
              { id: "b1", tenantId: "demo", name: "Victoria Island", slug: "vi", address: "123 Marina Rd", latitude: 6.4, longitude: 3.4, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              { id: "b2", tenantId: "demo", name: "Downtown Office", slug: "downtown", address: "456 Broad St", latitude: 6.5, longitude: 3.5, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            ]);
            setServices([
              { id: "s1", tenantId: "demo", code: "ACC", name: "Account opening", description: "Open a premium bank account", durationMinutes: 30, status: "active" },
              { id: "s2", tenantId: "demo", code: "VER", name: "Document verification", description: "Verify identification papers", durationMinutes: 30, status: "active" },
              { id: "s3", tenantId: "demo", code: "LOA", name: "Loan inquiry", description: "Consultation regarding credit", durationMinutes: 30, status: "active" }
            ]);
          }
        }
      } catch (error) {
        if (active) {
          setNotice(error instanceof Error ? error.message : "Unable to load data");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [session, refreshKey]);

  // Status transitions: check-in & complete
  async function transition(item: ApiAppointment, action: "check-in" | "complete") {
    if (session.mode !== "live") {
      setItems(current =>
        current.map(row =>
          row.id === item.id
            ? { ...row, status: action === "check-in" ? "checked_in" : "completed" }
            : row
        )
      );
      setNotice(`Successfully transitioned appointment ${item.id} to ${action === "check-in" ? "checked in" : "completed"}`);
      return;
    }

    try {
      setNotice("");
      const updated = action === "check-in"
        ? await klerionApi.checkInAppointment(session, item.id)
        : await klerionApi.completeAppointment(session, item.id);
      setItems(current => current.map(row => row.id === item.id ? updated : row));
      setNotice(`Successfully updated appointment ${item.id}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed");
    }
  }

  async function handleNoShow(item: ApiAppointment) {
    if (session.mode !== "live") {
      setItems(current =>
        current.map(row =>
          row.id === item.id
            ? { ...row, status: "no_show" }
            : row
        )
      );
      setNotice(`Appointment ${item.id} has been marked as No Show.`);
      return;
    }

    try {
      setNotice("");
      const updated = await klerionApi.markAppointmentNoShow(session, item.id);
      setItems(current => current.map(row => row.id === item.id ? updated : row));
      setNotice(`Appointment ${item.id} has been marked as No Show.`);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No show mark failed");
    }
  }

  // Handle reschedule form submission
  async function handleRescheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rescheduleItem || !rescheduleDate || !rescheduleTime) {
      setRescheduleError("Please select a date and time.");
      return;
    }

    setRescheduleLoading(true);
    setRescheduleError("");

    try {
      const startAt = new Date(`${rescheduleDate}T${rescheduleTime}:00Z`);
      if (Number.isNaN(startAt.getTime())) {
        throw new Error("Invalid date or time");
      }
      // Calculate original appointment duration to preserve it
      const originalStart = new Date(rescheduleItem.startAt);
      const originalEnd = new Date(rescheduleItem.endAt);
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      const endAt = new Date(startAt.getTime() + durationMs);

      if (session.mode !== "live") {
        setItems(current =>
          current.map(row =>
            row.id === rescheduleItem.id
              ? { ...row, startAt: startAt.toISOString(), endAt: endAt.toISOString() }
              : row
          )
        );
        setNotice(`Rescheduled appointment ${rescheduleItem.id} to ${startAt.toLocaleString()}`);
        setRescheduleItem(null);
        return;
      }

      await klerionApi.rescheduleAppointment(
        session,
        rescheduleItem.id,
        startAt.toISOString(),
        endAt.toISOString()
      );

      setNotice("Appointment successfully rescheduled.");
      setRescheduleItem(null);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      setRescheduleError(error instanceof Error ? error.message : "Reschedule failed");
    } finally {
      setRescheduleLoading(false);
    }
  }

  // Handle cancellation action
  async function handleCancelConfirm() {
    if (!cancelItem) return;

    try {
      if (session.mode !== "live") {
        setItems(current =>
          current.map(row =>
            row.id === cancelItem.id
              ? { ...row, status: "cancelled" }
              : row
          )
        );
        setNotice(`Appointment ${cancelItem.id} has been cancelled.`);
        setCancelItem(null);
        return;
      }

      await klerionApi.cancelAppointment(session, cancelItem.id);
      setNotice("Appointment successfully cancelled.");
      setCancelItem(null);
      setRefreshKey(prev => prev + 1);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Cancellation failed");
      setCancelItem(null);
    }
  }

  // Maps IDs to user-friendly Names helper
  const getServiceName = (item: ApiAppointment) => {
    if (item.serviceName) return item.serviceName;
    // Fallback: search in services
    const serviceId = (item as any).serviceId;
    const service = services.find(s => s.id === serviceId);
    return service ? service.name : serviceId || "Standard Service";
  };

  const getBranchName = (item: ApiAppointment) => {
    const branchId = (item as any).branchId;
    if (!branchId) return "Victoria Island";
    const branch = branches.find(b => b.id === branchId);
    return branch ? branch.name : "Victoria Island";
  };

  // Filter list
  const filteredItems = items.filter(item => {
    // Search filter
    const searchLower = search.toLowerCase();
    const serviceName = getServiceName(item).toLowerCase();
    const customerEmail = item.customerEmail.toLowerCase();
    const matchesSearch = serviceName.includes(searchLower) || customerEmail.includes(searchLower) || item.id.toLowerCase().includes(searchLower);

    // Status filter
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;

    // Branch filter
    const branchId = (item as any).branchId;
    const matchesBranch = branchFilter === "all" || branchId === branchFilter;

    return matchesSearch && matchesStatus && matchesBranch;
  });

  return (
    <section className="view min-h-screen bg-gray-50/50 p-6">
      <header className="view-heading mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
        <div>
          <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1 block">Service operations</span>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Appointments</h1>
          <p className="mt-1 text-sm text-gray-500">Manage bookings from confirmation through check-in and completion.</p>
        </div>
        <button
          id="btn-new-appointment"
          onClick={() => setShowNewModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors h-11"
        >
          <CalendarPlus size={18} />
          New appointment
        </button>
      </header>

      {notice && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 text-sm text-indigo-700">
          <AlertCircle size={18} className="shrink-0 text-indigo-500" />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} className="ml-auto text-indigo-400 hover:text-indigo-600 p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toolbar / Filters */}
      <div className="toolbar flex flex-col sm:flex-row gap-4 mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-xs">
        <label className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            id="input-search-appointments"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, appointment ID, or service"
            className="w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-11"
          />
        </label>
        
        <select
          id="select-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-11"
        >
          <option value="all">All Statuses</option>
          <option value="booked">Booked</option>
          <option value="checked_in">Checked In</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>

        <select
          id="select-branch-filter"
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-11"
        >
          <option value="all">All Branches</option>
          {branches.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Main Panel */}
      <article className="panel bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-900">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Customer</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Service</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Location</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Schedule</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Status</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                      Loading appointments...
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No appointments found matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const sName = getServiceName(item);
                  const bName = getBranchName(item);
                  const start = new Date(item.startAt);

                  return (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4.5">
                        <div className="identity-cell flex items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-700">
                            {item.customerEmail[0]?.toUpperCase()}
                          </span>
                          <div>
                            <strong className="block text-sm font-semibold text-gray-900">{item.customerEmail}</strong>
                            <small className="block text-xs text-gray-400 mt-0.5">{item.id}</small>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4.5 text-gray-700 align-middle">
                        <span className="font-medium">{sName}</span>
                      </td>
                      <td className="px-6 py-4.5 text-gray-500 align-middle">
                        <span>{bName}</span>
                      </td>
                      <td className="px-6 py-4.5 align-middle">
                        <div className="stack flex flex-col">
                          <strong className="text-sm font-semibold text-gray-900">{start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</strong>
                          <small className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                            <Clock3 size={13} className="text-gray-400" />
                            {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} UTC
                          </small>
                        </div>
                      </td>
                      <td className="px-6 py-4.5 align-middle">
                        <span className={`status-badge inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                          item.status === "booked" ? "bg-blue-50 text-blue-700 ring-blue-600/20" :
                          item.status === "checked_in" ? "bg-amber-50 text-amber-700 ring-amber-600/20" :
                          item.status === "completed" ? "bg-green-50 text-green-700 ring-green-600/20" :
                          item.status === "cancelled" ? "bg-gray-50 text-gray-600 ring-gray-500/10" :
                          "bg-red-50 text-red-700 ring-red-600/20"
                        }`}>
                          {item.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-6 py-4.5 text-right align-middle">
                        <div className="row-actions inline-flex items-center gap-2 justify-end">
                          {item.status === "booked" && (
                            <>
                              <button
                                id={`btn-checkin-${item.id}`}
                                onClick={() => transition(item, "check-in")}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors h-9"
                              >
                                <UserCheck size={14} className="text-indigo-500" />
                                Check in
                              </button>
                              <button
                                id={`btn-noshow-${item.id}`}
                                onClick={() => handleNoShow(item)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors h-9"
                              >
                                <XCircle size={14} className="text-amber-500" />
                                No show
                              </button>
                              <button
                                id={`btn-reschedule-${item.id}`}
                                onClick={() => {
                                  setRescheduleItem(item);
                                  setRescheduleDate(item.startAt.slice(0, 10));
                                  setRescheduleTime(item.startAt.slice(11, 16));
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors h-9"
                              >
                                <Calendar size={14} className="text-blue-500" />
                                Reschedule
                              </button>
                            </>
                          )}
                          {item.status === "checked_in" && (
                            <button
                              id={`btn-complete-${item.id}`}
                              onClick={() => transition(item, "complete")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors h-9"
                            >
                              <CheckCircle2 size={14} className="text-green-500" />
                              Complete
                            </button>
                          )}
                          {(item.status === "booked" || item.status === "checked_in") && (
                            <button
                              id={`btn-cancel-${item.id}`}
                              onClick={() => setCancelItem(item)}
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50/20 hover:bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors h-9"
                              title="Cancel appointment"
                            >
                              <Trash2 size={14} />
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Modal - New Appointment */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xs" onClick={() => setShowNewModal(false)}></div>
          <div className="relative w-full max-w-lg rounded-xl bg-white shadow-xl border border-gray-200 p-6 z-10">
            <header className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">New Appointment</h3>
              <button
                id="btn-close-new-modal"
                onClick={() => setShowNewModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </header>
            <BookingForm
              session={session}
              onSuccess={() => {
                setShowNewModal(false);
                setRefreshKey(prev => prev + 1);
                setNotice("Appointment successfully booked.");
              }}
            />
          </div>
        </div>
      )}

      {/* Modal - Reschedule */}
      {rescheduleItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xs" onClick={() => setRescheduleItem(null)}></div>
          <div className="relative w-full max-w-md rounded-xl bg-white shadow-xl border border-gray-200 p-6 z-10">
            <header className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Reschedule Appointment</h3>
              <button
                id="btn-close-reschedule-modal"
                onClick={() => setRescheduleItem(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </header>

            {rescheduleError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <AlertCircle size={16} className="shrink-0" />
                <span>{rescheduleError}</span>
              </div>
            )}

            <div className="mb-4 bg-gray-50 rounded-lg p-4 border border-gray-200 text-sm">
              <p className="text-gray-500 text-xs uppercase tracking-wider font-semibold">Current Schedule</p>
              <p className="font-semibold text-gray-900 mt-1">
                {new Date(rescheduleItem.startAt).toLocaleString()}
              </p>
              <p className="text-gray-500 text-xs mt-2 uppercase tracking-wider font-semibold">Service</p>
              <p className="text-gray-900 mt-0.5">{getServiceName(rescheduleItem)}</p>
            </div>

            <form onSubmit={handleRescheduleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="reschedule-date">
                  New Date
                </label>
                <input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="reschedule-time">
                  New Time (UTC)
                </label>
                <input
                  id="reschedule-time"
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 mt-6">
                <button
                  id="btn-cancel-reschedule"
                  type="button"
                  onClick={() => setRescheduleItem(null)}
                  className="flex-1 justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 h-11"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-reschedule"
                  type="submit"
                  disabled={rescheduleLoading}
                  className="flex-1 justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 h-11 disabled:opacity-50"
                >
                  {rescheduleLoading ? "Saving..." : "Reschedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Cancel Confirmation */}
      {cancelItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-xs" onClick={() => setCancelItem(null)}></div>
          <div className="relative w-full max-w-sm rounded-xl bg-white shadow-xl border border-gray-200 p-6 z-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Cancel Appointment?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Are you sure you want to cancel the appointment for <strong className="text-gray-900">{cancelItem.customerEmail}</strong>? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                id="btn-abort-cancel"
                onClick={() => setCancelItem(null)}
                className="flex-1 justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 h-11"
              >
                No, Keep It
              </button>
              <button
                id="btn-confirm-cancel"
                onClick={handleCancelConfirm}
                className="flex-1 justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 h-11"
              >
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
