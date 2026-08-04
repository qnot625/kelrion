import { MapPin, Search, Navigation, Compass, Layers, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { klerionApi, type ApiDiscoveredBranch, type ApiService } from "../../lib/api";
import type { KlerionSession } from "../../lib/session";

const previewDiscovered: ApiDiscoveredBranch[] = [
  {
    branchId: "BR-01",
    tenantId: "demo",
    branchName: "Central Clinic",
    status: "active",
    address: "123 Main St, London",
    latitude: 51.5074,
    longitude: -0.1278,
    totalCapacity: 25,
    activeBookingsCount: 5,
    offeredServiceIds: ["service-general", "service-triage"],
    loadLevel: "low",
    loadRatio: 0.2,
    distanceKm: 1.2,
  },
  {
    branchId: "BR-02",
    tenantId: "demo",
    branchName: "Westside Branch",
    status: "active",
    address: "456 West St, London",
    latitude: 51.51,
    longitude: -0.13,
    totalCapacity: 15,
    activeBookingsCount: 9,
    offeredServiceIds: ["service-general"],
    loadLevel: "medium",
    loadRatio: 0.6,
    distanceKm: 3.8,
  },
  {
    branchId: "BR-03",
    tenantId: "demo",
    branchName: "Downtown Emergency Care",
    status: "active",
    address: "789 Downtown Ave, London",
    latitude: 51.52,
    longitude: -0.14,
    totalCapacity: 10,
    activeBookingsCount: 10,
    offeredServiceIds: ["service-triage"],
    loadLevel: "high",
    loadRatio: 1.0,
    distanceKm: 5.4,
  },
];

export function BranchDiscovery({ session }: { readonly session: KlerionSession }) {
  const [discovered, setDiscovered] = useState<ApiDiscoveredBranch[]>(previewDiscovered);
  const [services, setServices] = useState<ApiService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [limit, setLimit] = useState<string>("10");
  const [loading, setLoading] = useState<boolean>(session.mode === "live");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (session.mode !== "live") return;
    void loadServices();
  }, [session]);

  useEffect(() => {
    if (session.mode !== "live") return;
    void fetchDiscovery();
  }, [session, selectedServiceId, limit]);

  async function loadServices() {
    try {
      const list = await klerionApi.listServices(session);
      setServices(list);
    } catch {
      // Services dropdown defaults to empty option if fetch fails
    }
  }

  async function fetchDiscovery() {
    setLoading(true);
    setError("");
    try {
      const lat = latitude ? parseFloat(latitude) : undefined;
      const lon = longitude ? parseFloat(longitude) : undefined;
      const lim = limit ? parseInt(limit, 10) : undefined;

      const list = await klerionApi.discoverBranches({
        tenantSlug: session.tenantSlug,
        serviceId: selectedServiceId || undefined,
        latitude: lat,
        longitude: lon,
        limit: lim,
      });
      setDiscovered(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to discover branch capacities");
    } finally {
      setLoading(false);
    }
  }

  function handleUseLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(4));
        setLongitude(pos.coords.longitude.toFixed(4));
        if (session.mode === "live") {
          void fetchDiscovery();
        }
      },
      () => {
        setError("Unable to retrieve your location");
      }
    );
  }

  function getLoadBadgeClass(level: "low" | "medium" | "high") {
    switch (level) {
      case "low":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "high":
        return "bg-rose-50 text-rose-700 border-rose-200";
    }
  }

  function getLoadBarClass(level: "low" | "medium" | "high") {
    switch (level) {
      case "low":
        return "bg-emerald-500";
      case "medium":
        return "bg-amber-500";
      case "high":
        return "bg-rose-500";
    }
  }

  return (
    <section id="branch-discovery-view" className="view space-y-6">
      <header className="view-heading flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="eyebrow flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            <Compass size={14} className="text-indigo-600" /> Routing & Capacity
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Branch Discovery & Routing</h1>
          <p className="text-sm text-slate-600 mt-1">
            Find the optimal branch prioritized by lowest capacity load and geographic proximity.
          </p>
        </div>
      </header>

      {error && <div className="inline-alert bg-rose-50 text-rose-700 p-3 rounded-lg border border-rose-200 text-sm">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-4">
        <form
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (session.mode === "live") void fetchDiscovery();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="discovery-service-select" className="block text-xs font-medium text-slate-700">
              Filter by Service
            </label>
            <div className="relative">
              <select
                id="discovery-service-select"
                className="w-full h-10 px-3 pr-8 rounded-lg border border-slate-300 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
              >
                <option value="">All Services</option>
                {services.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name} ({svc.code})
                  </option>
                ))}
              </select>
              <Layers size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="discovery-latitude-input" className="block text-xs font-medium text-slate-700">
              Latitude
            </label>
            <input
              id="discovery-latitude-input"
              type="number"
              step="any"
              placeholder="e.g. 51.5074"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="discovery-longitude-input" className="block text-xs font-medium text-slate-700">
              Longitude
            </label>
            <input
              id="discovery-longitude-input"
              type="number"
              step="any"
              placeholder="e.g. -0.1278"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="discovery-limit-select" className="block text-xs font-medium text-slate-700">
              Max Results
            </label>
            <select
              id="discovery-limit-select"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            >
              <option value="5">Top 5</option>
              <option value="10">Top 10</option>
              <option value="25">Top 25</option>
            </select>
          </div>

          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
            <button
              id="discovery-search-btn"
              type="submit"
              className="h-10 px-4 flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm flex items-center justify-center gap-1.5 transition-colors"
            >
              <Search size={15} /> Discover
            </button>
            <button
              id="discovery-geo-btn"
              type="button"
              className="h-10 w-10 shrink-0 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center transition-colors"
              title="Use my location"
              onClick={handleUseLocation}
            >
              <Navigation size={15} />
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Activity size={16} className="text-indigo-600" />
            Discovered Locations ({discovered.length})
          </h2>
          <span className="text-xs text-slate-500">
            Sorted by Load Priority (Low &rarr; Medium &rarr; High) & Distance
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
            Searching optimal branch locations…
          </div>
        ) : discovered.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
            No active branches match the specified routing filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {discovered.map((branch) => {
              const loadPercent = Math.round(branch.loadRatio * 100);
              return (
                <div
                  key={branch.branchId}
                  id={`discovered-branch-card-${branch.branchId}`}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm">
                          {branch.branchName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm leading-tight">{branch.branchName}</h3>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin size={12} /> {branch.address}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${getLoadBadgeClass(
                          branch.loadLevel
                        )}`}
                      >
                        {branch.loadLevel} load
                      </span>
                    </div>

                    {branch.distanceKm !== undefined && (
                      <div className="text-xs font-medium text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md inline-flex items-center gap-1">
                        <MapPin size={12} className="text-indigo-500" />
                        <span>{branch.distanceKm} km away</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="flex justify-between text-xs text-slate-600 font-medium">
                      <span>Capacity Utilization</span>
                      <span>
                        {branch.activeBookingsCount} / {branch.totalCapacity} active ({loadPercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getLoadBarClass(branch.loadLevel)}`}
                        style={{ width: `${Math.min(loadPercent, 100)}%` }}
                      />
                    </div>
                  </div>

                  {branch.offeredServiceIds.length > 0 && (
                    <div className="pt-2 flex flex-wrap gap-1">
                      {branch.offeredServiceIds.map((svcId) => (
                        <span key={svcId} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-md">
                          {svcId}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
