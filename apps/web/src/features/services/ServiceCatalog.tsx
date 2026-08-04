import {
  Plus, Search, ShieldCheck, Clock, FileText, CheckCircle2, XCircle, MapPin, Building2, ChevronRight, Layers, Check, X, Filter
} from "lucide-react";
import { useEffect, useState } from "react";
import { klerionApi, type ApiBranch, type ApiService, type CreateServiceInput } from "../../lib/api";
import type { KlerionSession } from "../../lib/session";

const previewServices: ApiService[] = [
  {
    id: "SVC-01",
    tenantId: "demo",
    code: "PASSPORT-RENEW",
    name: "Passport Renewal",
    description: "Standard 30 min passport renewal application processing",
    durationMinutes: 30,
    status: "active",
    requirement: {
      id: "REQ-01",
      tenantId: "demo",
      serviceId: "SVC-01",
      photoIdRequired: true,
      minAge: 18,
      maxAge: null,
      requiredDocuments: ["Proof of Residence", "Current Passport"],
      customNotes: "Please bring original physical copies of documents.",
    },
  },
  {
    id: "SVC-02",
    tenantId: "demo",
    code: "DRIVERS-LICENSE",
    name: "Driver's License Exchange",
    description: "Exchange or renew valid driving license credentials",
    durationMinutes: 45,
    status: "active",
    requirement: {
      id: "REQ-02",
      tenantId: "demo",
      serviceId: "SVC-02",
      photoIdRequired: true,
      minAge: 16,
      maxAge: 85,
      requiredDocuments: ["Old License", "Medical Certificate"],
      customNotes: null,
    },
  },
];

const previewBranches: ApiBranch[] = [
  { id: "BR-01", tenantId: "demo", name: "Main Office", slug: "main-office", address: "123 Main St", latitude: 51.5074, longitude: -0.1278, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "BR-02", tenantId: "demo", name: "Downtown Branch", slug: "downtown-branch", address: "456 Downtown Ave", latitude: 51.5074, longitude: -0.1278, status: "active", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

export function ServiceCatalog({ session }: { readonly session: KlerionSession }) {
  const [services, setServices] = useState<ApiService[]>(previewServices);
  const [branches, setBranches] = useState<ApiBranch[]>(previewBranches);
  const [loading, setLoading] = useState(session.mode === "live");
  const [notice, setNotice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [mappingService, setMappingService] = useState<ApiService | null>(null);

  useEffect(() => {
    if (session.mode !== "live") return;
    void loadData();
  }, [session]);

  async function loadData() {
    setLoading(true);
    setNotice("");
    try {
      const [svcList, branchList] = await Promise.all([
        klerionApi.listServices(session),
        klerionApi.listBranches(session),
      ]);
      setServices(svcList);
      setBranches(branchList);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load service catalog.");
    } finally {
      setLoading(false);
    }
  }

  const filteredServices = services.filter((svc) => {
    const matchesSearch =
      svc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      svc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (svc.description && svc.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus =
      statusFilter === "all" || svc.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <section id="service-catalog-view" className="view">
      <header className="view-heading">
        <div>
          <span className="eyebrow">Catalog</span>
          <h1>Service Catalog</h1>
          <p>Define service offerings, set prerequisite rules, and map capabilities across branch locations.</p>
        </div>
        <button
          id="create-service-btn"
          className="primary min-h-[44px]"
          onClick={() => setCreateModalOpen(true)}
        >
          <Plus size={16} /> Create service
        </button>
      </header>

      {notice && <div className="inline-alert">{notice}</div>}

      <div className="toolbar flex gap-3 mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-xs">
        <label htmlFor="search-services-input" className="relative flex-1 flex items-center gap-2 border border-gray-200 rounded-lg px-3.5 py-2.5 bg-white text-slate-400 focus-within:ring-2 focus-within:ring-indigo-500/10 focus-within:border-indigo-500 h-11">
          <Search size={16} className="text-gray-400 shrink-0" />
          <input
            id="search-services-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by code, name, or description"
            className="w-full bg-transparent border-0 outline-none text-sm text-gray-900 placeholder:text-gray-400 h-full"
          />
        </label>
        <select
          id="service-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-200 px-3.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 h-11 min-w-[150px]"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      <article id="services-table-panel" className="panel bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm text-gray-900">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Service</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Duration</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Requirements</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Status</th>
                <th scope="col" className="px-6 py-4 font-semibold text-gray-600">Branch Mappings</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    <div className="flex justify-center items-center gap-2">
                      <span className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
                      Loading service catalog…
                    </div>
                  </td>
                </tr>
              ) : filteredServices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No services found.
                  </td>
                </tr>
              ) : (
                filteredServices.map((svc) => (
                  <tr key={svc.id} id={`service-row-${svc.id}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="identity-cell flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-semibold text-indigo-700">
                          {svc.code.substring(0, 2)}
                        </span>
                        <div>
                          <strong className="block text-sm font-semibold text-gray-900">{svc.name}</strong>
                          <code className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">{svc.code}</code>
                          {svc.description && (
                            <div className="text-xs text-gray-400 mt-1">{svc.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-700 align-middle">
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <Clock size={14} className="text-gray-400" />
                        <span>{svc.durationMinutes} mins</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 align-middle">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {svc.requirement ? (
                          <>
                            {svc.requirement.photoIdRequired && (
                              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                Photo ID
                              </span>
                            )}
                            {svc.requirement.minAge !== null && (
                              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 ring-1 ring-inset ring-blue-600/20">
                                Age {svc.requirement.minAge}+
                              </span>
                            )}
                            {svc.requirement.maxAge !== null && (
                              <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-800 ring-1 ring-inset ring-purple-600/20">
                                Max {svc.requirement.maxAge}
                              </span>
                            )}
                            {svc.requirement.requiredDocuments && svc.requirement.requiredDocuments.length > 0 && (
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800 ring-1 ring-inset ring-slate-600/20">
                                {svc.requirement.requiredDocuments.length} document(s)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">None</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 align-middle">
                      <span className={`status-badge inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                        svc.status === "active" ? "bg-green-50 text-green-700 ring-green-600/20" : "bg-gray-50 text-gray-600 ring-gray-500/10"
                      }`}>
                        {svc.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 align-middle">
                      <button
                        id={`manage-mappings-btn-${svc.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors h-9"
                        onClick={() => setMappingService(svc)}
                        title="Manage branch capability mappings"
                      >
                        <MapPin size={14} className="text-indigo-500" />
                        <span>Capability Mappings</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {createModalOpen && (
        <CreateServiceModal
          session={session}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={(newService) => {
            setServices((prev) => [newService, ...prev]);
            setCreateModalOpen(false);
          }}
        />
      )}

      {mappingService && (
        <BranchCapabilityModal
          session={session}
          service={mappingService}
          branches={branches}
          onClose={() => setMappingService(null)}
        />
      )}
    </section>
  );
}

function CreateServiceModal({
  session,
  onClose,
  onSuccess,
}: {
  readonly session: KlerionSession;
  readonly onClose: () => void;
  readonly onSuccess: (service: ApiService) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const [photoIdRequired, setPhotoIdRequired] = useState(false);
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [requiredDocs, setRequiredDocs] = useState("");
  const [customNotes, setCustomNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const duration = parseInt(durationMinutes, 10);
    if (isNaN(duration) || duration < 1 || duration > 480) {
      setError("Duration must be an integer between 1 and 480 minutes.");
      return;
    }

    const uppercaseCode = code.toUpperCase().trim();
    if (!/^[A-Z0-9-]+$/.test(uppercaseCode)) {
      setError("Service code must contain only alphanumeric characters and hyphens.");
      return;
    }

    const minAgeNum = minAge.trim() ? parseInt(minAge, 10) : null;
    const maxAgeNum = maxAge.trim() ? parseInt(maxAge, 10) : null;

    if (minAgeNum !== null && (isNaN(minAgeNum) || minAgeNum < 0)) {
      setError("Minimum age must be a non-negative integer.");
      return;
    }
    if (maxAgeNum !== null && (isNaN(maxAgeNum) || maxAgeNum < 0)) {
      setError("Maximum age must be a non-negative integer.");
      return;
    }
    if (minAgeNum !== null && maxAgeNum !== null && maxAgeNum < minAgeNum) {
      setError("Maximum age cannot be less than minimum age.");
      return;
    }

    const docList = requiredDocs
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    const input: CreateServiceInput = {
      code: uppercaseCode,
      name: name.trim(),
      description: description.trim() || null,
      durationMinutes: duration,
      status,
      requirements: {
        photoIdRequired,
        minAge: minAgeNum,
        maxAge: maxAgeNum,
        requiredDocuments: docList,
        customNotes: customNotes.trim() || null,
      },
    };

    if (session.mode === "demo") {
      const fakeService: ApiService = {
        id: `SVC-DEMO-${Date.now()}`,
        tenantId: "demo",
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
        status: input.status ?? "active",
        requirement: {
          id: `REQ-DEMO-${Date.now()}`,
          tenantId: "demo",
          serviceId: `SVC-DEMO-${Date.now()}`,
          photoIdRequired,
          minAge: minAgeNum,
          maxAge: maxAgeNum,
          requiredDocuments: docList,
          customNotes: customNotes.trim() || null,
        },
      };
      onSuccess(fakeService);
      return;
    }

    setLoading(true);
    try {
      const created = await klerionApi.createService(session, input);
      onSuccess(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service.");
      setLoading(false);
    }
  }

  return (
    <div
      id="service-modal-overlay"
      className="command-overlay"
      onMouseDown={onClose}
    >
      <section
        id="service-modal-dialog"
        className="command-dialog branch-modal max-w-xl"
        role="dialog"
        aria-labelledby="service-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="identity-cell">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600">
              <Layers size={20} />
            </span>
            <div>
              <strong id="service-modal-title">Create new service</strong>
              <small>Add a service item and configure prerequisites</small>
            </div>
          </div>
          <button
            id="service-modal-close-btn"
            className="modal-close-btn min-h-[44px] min-w-[44px]"
            onClick={onClose}
            aria-label="Close modal"
          >
            Esc
          </button>
        </div>

        <form id="create-service-form" className="auth-form" onSubmit={handleSubmit}>
          {error && (
            <div id="create-service-error" className="inline-alert">
              {error}
            </div>
          )}

          <div className="coords-row">
            <label htmlFor="service-code-input">
              <span>Service Code</span>
              <input
                id="service-code-input"
                required
                placeholder="e.g. PASSPORT-RENEW"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
            <label htmlFor="service-duration-input">
              <span>Duration (Mins)</span>
              <input
                id="service-duration-input"
                required
                type="number"
                min={1}
                max={480}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </label>
          </div>

          <label htmlFor="service-name-input">
            <span>Service Name</span>
            <input
              id="service-name-input"
              required
              placeholder="e.g. Passport Renewal"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label htmlFor="service-desc-input">
            <span>Description (Optional)</span>
            <input
              id="service-desc-input"
              placeholder="Brief description of service fulfillment"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label htmlFor="service-status-select">
            <span>Status</span>
            <select
              id="service-status-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <div className="border-t border-slate-200 pt-3 mt-2">
            <h4 className="font-semibold text-sm text-slate-800 mb-2">Service Prerequisites & Requirements</h4>

            <div className="flex items-center gap-2 mb-3 min-h-[44px]">
              <input
                id="service-photoid-checkbox"
                type="checkbox"
                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500"
                checked={photoIdRequired}
                onChange={(e) => setPhotoIdRequired(e.target.checked)}
              />
              <label htmlFor="service-photoid-checkbox" className="text-sm font-medium text-slate-700 cursor-pointer">
                Government Photo ID Required
              </label>
            </div>

            <div className="coords-row mb-3">
              <label htmlFor="service-minage-input">
                <span>Minimum Age</span>
                <input
                  id="service-minage-input"
                  type="number"
                  min={0}
                  placeholder="e.g. 18"
                  value={minAge}
                  onChange={(e) => setMinAge(e.target.value)}
                />
              </label>
              <label htmlFor="service-maxage-input">
                <span>Maximum Age</span>
                <input
                  id="service-maxage-input"
                  type="number"
                  min={0}
                  placeholder="e.g. 75"
                  value={maxAge}
                  onChange={(e) => setMaxAge(e.target.value)}
                />
              </label>
            </div>

            <label htmlFor="service-docs-input" className="mb-3">
              <span>Required Documents (Comma-separated)</span>
              <input
                id="service-docs-input"
                placeholder="e.g. Proof of Address, Current Passport, Birth Certificate"
                value={requiredDocs}
                onChange={(e) => setRequiredDocs(e.target.value)}
              />
            </label>

            <label htmlFor="service-notes-textarea">
              <span>Custom Notes or Instructions</span>
              <textarea
                id="service-notes-textarea"
                rows={2}
                className="w-full rounded-md border border-slate-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Additional details for customers or staff…"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="form-actions">
            <button
              id="service-cancel-btn"
              type="button"
              className="min-h-[44px]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              id="service-submit-btn"
              type="submit"
              className="primary min-h-[44px]"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create Service"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function BranchCapabilityModal({
  session,
  service,
  branches,
  onClose,
}: {
  readonly session: KlerionSession;
  readonly service: ApiService;
  readonly branches: readonly ApiBranch[];
  readonly onClose: () => void;
}) {
  const [assignedBranchIds, setAssignedBranchIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(session.mode === "live");
  const [error, setError] = useState("");
  const [updatingBranchId, setUpdatingBranchId] = useState<string | null>(null);

  useEffect(() => {
    if (session.mode !== "live") {
      // In demo mode, assign to first branch as default
      if (branches.length > 0) {
        setAssignedBranchIds(new Set([branches[0].id]));
      }
      return;
    }

    void loadAssignments();
  }, [session, service.id, branches]);

  async function loadAssignments() {
    setLoading(true);
    setError("");
    try {
      const assigned = new Set<string>();
      await Promise.all(
        branches.map(async (b) => {
          try {
            const branchServices = await klerionApi.listBranchServices(session, b.id);
            if (branchServices.some((s) => s.id === service.id)) {
              assigned.add(b.id);
            }
          } catch {
            // Ignore branch errors during capability check
          }
        })
      );
      setAssignedBranchIds(assigned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load branch capability mappings.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleBranchAssignment(branchId: string, currentAssigned: boolean) {
    if (session.mode === "demo") {
      setAssignedBranchIds((prev) => {
        const next = new Set(prev);
        if (currentAssigned) {
          next.delete(branchId);
        } else {
          next.add(branchId);
        }
        return next;
      });
      return;
    }

    setUpdatingBranchId(branchId);
    setError("");
    try {
      if (currentAssigned) {
        await klerionApi.removeServiceFromBranch(session, branchId, service.id);
        setAssignedBranchIds((prev) => {
          const next = new Set(prev);
          next.delete(branchId);
          return next;
        });
      } else {
        await klerionApi.assignServiceToBranch(session, branchId, service.id);
        setAssignedBranchIds((prev) => {
          const next = new Set(prev);
          next.add(branchId);
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update branch capability.");
    } finally {
      setUpdatingBranchId(null);
    }
  }

  return (
    <div
      id="capability-modal-overlay"
      className="command-overlay"
      onMouseDown={onClose}
    >
      <section
        id="capability-modal-dialog"
        className="command-dialog branch-modal max-w-lg"
        role="dialog"
        aria-labelledby="capability-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="identity-cell">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-xs">
              {service.code.substring(0, 2)}
            </span>
            <div>
              <strong id="capability-modal-title">Branch Capability Mapping</strong>
              <small>{service.name} ({service.code})</small>
            </div>
          </div>
          <button
            id="capability-modal-close-btn"
            className="modal-close-btn min-h-[44px] min-w-[44px]"
            onClick={onClose}
            aria-label="Close modal"
          >
            Esc
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-slate-600 mb-4">
            Select physical branch locations capable of fulfilling this service:
          </p>

          {error && (
            <div id="capability-error" className="inline-alert mb-3">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading branch capabilities…</div>
          ) : branches.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">No branches available in tenant.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {branches.map((branch) => {
                const isAssigned = assignedBranchIds.has(branch.id);
                const isUpdating = updatingBranchId === branch.id;
                return (
                  <div
                    key={branch.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors bg-white min-h-[44px]"
                  >
                    <div className="flex items-center gap-3">
                      <input
                        id={`branch-capability-checkbox-${branch.id}`}
                        type="checkbox"
                        disabled={isUpdating}
                        checked={isAssigned}
                        onChange={() => toggleBranchAssignment(branch.id, isAssigned)}
                        className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div>
                        <label
                          htmlFor={`branch-capability-checkbox-${branch.id}`}
                          className="font-medium text-sm text-slate-800 cursor-pointer"
                        >
                          {branch.name}
                        </label>
                        <div className="text-xs text-slate-500">{branch.address}</div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${isAssigned ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {isUpdating ? "Updating…" : isAssigned ? "Assigned" : "Unassigned"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer p-4 border-t border-slate-200 flex justify-end">
          <button
            id="capability-modal-done-btn"
            className="primary min-h-[44px]"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
