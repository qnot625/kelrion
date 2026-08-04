import { useState, useEffect } from "react";
import { klerionApi, type ApiWaitlistEntry, type ApiBranch, type ApiService } from "../../lib/api";
import type { KlerionSession } from "../../lib/session";
import { Plus, Trash2, AlertCircle, Layers, MapPin, Mail, Clock, ListOrdered, ChevronRight, Check } from "lucide-react";

interface WaitlistConsoleProps {
  readonly session: KlerionSession;
}

export function WaitlistConsole({ session }: WaitlistConsoleProps) {
  const [entries, setEntries] = useState<ApiWaitlistEntry[]>([]);
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);

  // Form states
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        if (session.mode === "live") {
          const [loadedEntries, loadedBranches, loadedServices] = await Promise.all([
            klerionApi.listWaitlist(session),
            klerionApi.listBranches(session),
            klerionApi.listServices(session),
          ]);
          if (active) {
            setEntries(loadedEntries);
            setBranches(loadedBranches.filter((b) => b.status === "active"));
            setServices(loadedServices.filter((s) => s.status === "active"));
          }
        } else {
          // Demo / Preview Mode Data
          if (active) {
            setBranches([
              { id: "b1", tenantId: "demo", name: "Victoria Island", slug: "vi", address: "123 Marina Rd", latitude: 6.4, longitude: 3.4, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              { id: "b2", tenantId: "demo", name: "Downtown Office", slug: "downtown", address: "456 Broad St", latitude: 6.5, longitude: 3.5, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            ]);
            setServices([
              { id: "s1", tenantId: "demo", code: "ACC", name: "Account opening", description: "Open a premium bank account", durationMinutes: 30, status: "active" },
              { id: "s2", tenantId: "demo", code: "VER", name: "Document verification", description: "Verify identification papers", durationMinutes: 30, status: "active" },
              { id: "s3", tenantId: "demo", code: "LOA", name: "Loan inquiry", description: "Consultation regarding credit", durationMinutes: 30, status: "active" }
            ]);
            setEntries([
              { id: "w1", tenantId: "demo", branchId: "b1", serviceId: "s1", customerEmail: "waiting.customer1@example.com", queuePosition: 1, customerMetadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
              { id: "w2", tenantId: "demo", branchId: "b1", serviceId: "s1", customerEmail: "waiting.customer2@example.com", queuePosition: 2, customerMetadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
            ]);
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to load waitlist data");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadData();
    return () => {
      active = false;
    };
  }, [session]);

  const handleAddWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId || !selectedServiceId || !customerEmail) {
      setError("Please fill in all fields.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (session.mode !== "live") {
        const mockNewEntry: ApiWaitlistEntry = {
          id: `w_mock_${Date.now()}`,
          tenantId: "demo",
          branchId: selectedBranchId,
          serviceId: selectedServiceId,
          customerEmail,
          queuePosition: entries.filter(e => e.branchId === selectedBranchId && e.serviceId === selectedServiceId).length + 1,
          customerMetadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setEntries(prev => [...prev, mockNewEntry]);
        setSuccess(`Successfully added ${customerEmail} to the waitlist.`);
        setCustomerEmail("");
        return;
      }

      const newEntry = await klerionApi.addToWaitlist(session, {
        branchId: selectedBranchId,
        serviceId: selectedServiceId,
        customerEmail,
      });

      setEntries(prev => [...prev, newEntry]);
      setSuccess(`Successfully added ${customerEmail} to the waitlist.`);
      setCustomerEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register on waitlist");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveWaitlist = async (id: string) => {
    setError(null);
    setSuccess(null);

    try {
      if (session.mode !== "live") {
        setEntries(prev => prev.filter(e => e.id !== id));
        setSuccess("Customer successfully removed from waitlist.");
        return;
      }

      await klerionApi.removeFromWaitlist(session, id);
      setEntries(prev => prev.filter(e => e.id !== id));
      setSuccess("Customer successfully removed from waitlist.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove from waitlist");
    }
  };

  const getServiceName = (item: ApiWaitlistEntry) => {
    const service = services.find(s => s.id === item.serviceId);
    return service ? service.name : "Standard Service";
  };

  const getBranchName = (item: ApiWaitlistEntry) => {
    const branch = branches.find(b => b.id === item.branchId);
    return branch ? branch.name : "Victoria Island";
  };

  return (
    <section className="view min-h-screen bg-gray-50/50 p-6">
      <header className="view-heading mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
        <div>
          <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-1 block">Queue management</span>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Waitlist Console</h1>
          <p className="mt-1 text-sm text-gray-500">Track and register customers into priority FIFO queues when branch capacities are reached.</p>
        </div>
      </header>

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={18} className="shrink-0 text-red-500" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 p-1">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-100 bg-green-50 p-4 text-sm text-green-700">
          <Check size={18} className="shrink-0 text-green-500" />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-600 p-1">
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Registration Form Panel */}
        <article className="panel bg-white border border-gray-200 rounded-xl shadow-xs p-6 lg:col-span-1">
          <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
            <ListOrdered size={18} className="text-indigo-600" />
            Join Waitlist
          </h2>
          <p className="text-sm text-gray-500 mb-6">Register a customer to the back of the priority line.</p>

          <form onSubmit={handleAddWaitlist} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Branch Location</label>
              <div className="relative">
                <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  id="select-waitlist-branch"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-11"
                  disabled={submitting}
                  required
                >
                  <option value="">Select branch</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Offered Service</label>
              <div className="relative">
                <Layers size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <select
                  id="select-waitlist-service"
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-11"
                  disabled={submitting}
                  required
                >
                  <option value="">Select service</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes}m)</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Customer Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  id="input-waitlist-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-lg border border-gray-200 pl-10 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 h-11"
                  disabled={submitting}
                  required
                />
              </div>
            </div>

            <button
              id="btn-submit-waitlist"
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors h-11 mt-2"
            >
              <Plus size={16} />
              {submitting ? "Registering..." : "Add to Waitlist"}
            </button>
          </form>
        </article>

        {/* Waitlist Queue List */}
        <article className="panel bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden lg:col-span-2">
          <header className="px-6 py-5 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock size={18} className="text-indigo-600" />
                FIFO Priority Queue
              </h2>
              <p className="text-sm text-gray-500 mt-1">Real-time view of customer priority waitlists.</p>
            </div>
            <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
              {entries.length} Active waiting
            </span>
          </header>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-6 py-12 text-center text-gray-500">
                <div className="flex justify-center items-center gap-2">
                  <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                  Loading active waitlists...
                </div>
              </div>
            ) : entries.length === 0 ? (
              <div className="px-6 py-16 text-center text-gray-500 flex flex-col items-center justify-center">
                <Clock size={40} className="text-gray-300 mb-3" />
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Queue is empty</h3>
                <p className="text-xs text-gray-400">All customers have been successfully promoted or cleared.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-900">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Position</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Customer</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Location & Service</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Registered</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {entries
                    .sort((a, b) => a.queuePosition - b.queuePosition)
                    .map((item) => {
                      const sName = getServiceName(item);
                      const bName = getBranchName(item);
                      const createdDate = new Date(item.createdAt);

                      return (
                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4.5 align-middle">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                              #{item.queuePosition}
                            </span>
                          </td>
                          <td className="px-6 py-4.5 align-middle">
                            <div className="font-semibold text-gray-900">{item.customerEmail}</div>
                            <div className="text-xs text-gray-400 mt-0.5">ID: {item.id}</div>
                          </td>
                          <td className="px-6 py-4.5 align-middle">
                            <div className="font-medium text-gray-800">{sName}</div>
                            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                              <MapPin size={11} className="text-gray-400" />
                              {bName}
                            </div>
                          </td>
                          <td className="px-6 py-4.5 align-middle text-gray-500">
                            <div>{createdDate.toLocaleDateString()}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {createdDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </td>
                          <td className="px-6 py-4.5 text-right align-middle">
                            <button
                              id={`btn-remove-waitlist-${item.id}`}
                              onClick={() => handleRemoveWaitlist(item.id)}
                              className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50/20 hover:bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors h-9 gap-1.5"
                              title="Remove from queue"
                            >
                              <Trash2 size={14} />
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
