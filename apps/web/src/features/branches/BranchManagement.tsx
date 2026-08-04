import { MapPin, Plus, Search, Building2, Compass } from "lucide-react";
import { useEffect, useState } from "react";
import { klerionApi, type ApiBranch } from "../../lib/api";
import type { KlerionSession } from "../../lib/session";
import { DepartmentSettings } from "./DepartmentSettings";
import { BranchDiscovery } from "./BranchDiscovery";

const preview: ApiBranch[] = [
  { id: "BR-01", tenantId: "demo", name: "Main Office", slug: "main-office", address: "123 Main St", latitude: 51.5074, longitude: -0.1278, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "BR-02", tenantId: "demo", name: "Downtown Branch", slug: "downtown-branch", address: "456 Downtown Ave", latitude: 51.5074, longitude: -0.1278, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

export function BranchManagement({ session }: { readonly session: KlerionSession }) {
  const [branches, setBranches] = useState<ApiBranch[]>(preview);
  const [selectedBranch, setSelectedBranch] = useState<ApiBranch | null>(null);
  const [loading, setLoading] = useState(session.mode === "live");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "discovery">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (session.mode !== "live") return;
    void loadBranches();
  }, [session]);

  async function loadBranches() {
    setLoading(true);
    setNotice("");
    try {
      const list = await klerionApi.listBranches(session);
      setBranches(list);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load branches");
    } finally {
      setLoading(false);
    }
  }

  const filteredBranches = branches.filter((branch) => {
    const matchesSearch =
      branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      branch.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (branch.address && branch.address.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus =
      statusFilter === "all" || branch.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (selectedBranch) {
    return (
      <DepartmentSettings
        session={session}
        branch={selectedBranch}
        onBack={() => setSelectedBranch(null)}
      />
    );
  }

  return (
    <section id="branch-management-view" className="view space-y-6">
      <header className="view-heading">
        <div>
          <span className="eyebrow">Locations</span>
          <h1>Branches</h1>
          <p>Manage physical locations and operating parameters.</p>
        </div>
        <div className="flex items-center gap-3">
          <button id="create-branch-btn" className="primary min-h-[44px]" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Create branch
          </button>
        </div>
      </header>

      <div className="flex border-b border-slate-200 space-x-6 text-sm font-medium">
        <button
          id="branch-tab-list"
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "list"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
          onClick={() => setActiveTab("list")}
        >
          <MapPin size={16} /> All Branches
        </button>
        <button
          id="branch-tab-discovery"
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === "discovery"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
          onClick={() => setActiveTab("discovery")}
        >
          <Compass size={16} /> Discovery & Routing
        </button>
      </div>

      {activeTab === "discovery" ? (
        <BranchDiscovery session={session} />
      ) : (
        <>
          {notice && <div className="inline-alert">{notice}</div>}

          <div className="toolbar flex gap-3 mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-xs">
            <label htmlFor="search-branches-input" className="relative flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3.5 py-2.5 bg-white text-slate-400 focus-within:ring-2 focus-within:ring-indigo-500/10 focus-within:border-indigo-500 h-11">
              <Search size={16} className="text-gray-400 shrink-0" />
              <input
                id="search-branches-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search branches by name, slug or address"
                className="w-full bg-transparent border-0 outline-none text-sm text-gray-900 placeholder:text-gray-400 h-full"
              />
            </label>
            <select
              id="branch-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-11 min-w-[150px]"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <article id="branches-table-panel" className="panel bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-900">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Name</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Address</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Coordinates</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Status</th>
                    <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        <div className="flex justify-center items-center gap-2">
                          <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                          Loading branches…
                        </div>
                      </td>
                    </tr>
                  ) : filteredBranches.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                        No branches found.
                      </td>
                    </tr>
                  ) : (
                    filteredBranches.map(branch => (
                      <tr key={branch.id} id={`branch-row-${branch.id}`} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="identity-cell flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-700">
                              {branch.name[0]?.toUpperCase()}
                            </span>
                            <div>
                              <strong className="block text-sm font-semibold text-gray-900">{branch.name}</strong>
                              <small className="block text-xs text-gray-400 mt-0.5">{branch.slug}</small>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-700 align-middle">{branch.address}</td>
                        <td className="px-6 py-4 text-gray-500 align-middle">{branch.latitude.toFixed(4)}, {branch.longitude.toFixed(4)}</td>
                        <td className="px-6 py-4 align-middle">
                          <span className={`status-badge inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                            branch.status === "active" ? "bg-green-50 text-green-700 ring-green-600/20" : "bg-gray-50 text-gray-600 ring-gray-500/10"
                          }`}>
                            {branch.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 align-middle">
                          <div className="flex items-center gap-2">
                            <button
                              id={`manage-dept-btn-${branch.id}`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors h-9"
                              onClick={() => setSelectedBranch(branch)}
                              title="Manage departments and capacity"
                            >
                              <Building2 size={14} className="text-indigo-500" />
                              <span>Departments</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      {modalOpen && (
        <CreateBranchModal 
          session={session} 
          onClose={() => setModalOpen(false)} 
          onSuccess={(branch) => {
            setBranches(prev => [...prev, branch]);
            setModalOpen(false);
          }} 
        />
      )}
    </section>
  );
}


function CreateBranchModal({
  session,
  onClose,
  onSuccess,
}: {
  readonly session: KlerionSession;
  readonly onClose: () => void;
  readonly onSuccess: (branch: ApiBranch) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      setError("Latitude and longitude must be valid numbers");
      return;
    }

    if (session.mode === "demo") {
      const fakeBranch: ApiBranch = {
        id: `BR-DEMO-${Date.now()}`,
        tenantId: "demo",
        name,
        slug,
        address,
        latitude: lat,
        longitude: lng,
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onSuccess(fakeBranch);
      return;
    }

    setLoading(true);
    try {
      const created = await klerionApi.createBranch(session, {
        name,
        slug,
        address,
        latitude: lat,
        longitude: lng,
        status: "active",
      });
      onSuccess(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create branch");
      setLoading(false);
    }
  }

  return (
    <div
      id="branch-modal-overlay"
      className="command-overlay"
      onMouseDown={onClose}
    >
      <section
        id="branch-modal-dialog"
        className="command-dialog branch-modal"
        role="dialog"
        aria-labelledby="branch-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="identity-cell">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600">
              <MapPin size={20} />
            </span>
            <div>
              <strong id="branch-modal-title">Create new branch</strong>
              <small>Add a new physical location</small>
            </div>
          </div>
          <button
            id="branch-modal-close-btn"
            className="modal-close-btn min-h-[44px] min-w-[44px]"
            onClick={onClose}
            aria-label="Close modal"
          >
            Esc
          </button>
        </div>

        <form id="create-branch-form" className="auth-form" onSubmit={handleSubmit}>
          {error && (
            <div id="create-branch-error" className="inline-alert">
              {error}
            </div>
          )}

          <label htmlFor="branch-name-input">
            <span>Branch Name</span>
            <input
              id="branch-name-input"
              required
              placeholder="e.g. London HQ"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) {
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "")
                  );
                }
              }}
            />
          </label>

          <label htmlFor="branch-slug-input">
            <span>URL Slug</span>
            <input
              id="branch-slug-input"
              required
              placeholder="e.g. london-hq"
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers, and hyphens only"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>

          <label htmlFor="branch-address-input">
            <span>Full Address</span>
            <input
              id="branch-address-input"
              required
              placeholder="123 Example Street, City"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>

          <div className="coords-row">
            <label htmlFor="branch-latitude-input">
              <span>Latitude</span>
              <input
                id="branch-latitude-input"
                required
                type="number"
                step="any"
                placeholder="51.5074"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
              />
            </label>
            <label htmlFor="branch-longitude-input">
              <span>Longitude</span>
              <input
                id="branch-longitude-input"
                required
                type="number"
                step="any"
                placeholder="-0.1278"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              id="branch-cancel-btn"
              type="button"
              className="min-h-[44px]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              id="branch-submit-btn"
              type="submit"
              className="primary min-h-[44px]"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create Branch"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
