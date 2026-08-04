import { Building2, Plus, Users, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { klerionApi, type ApiBranch, type ApiDepartment } from "../../lib/api";
import type { KlerionSession } from "../../lib/session";

interface DepartmentSettingsProps {
  readonly session: KlerionSession;
  readonly branch: ApiBranch;
  readonly onBack?: () => void;
}

const previewDepartments: ApiDepartment[] = [
  { id: "DEPT-01", tenantId: "demo", branchId: "BR-01", name: "Triage & Intake", slug: "triage-intake", capacity: 8 },
  { id: "DEPT-02", tenantId: "demo", branchId: "BR-01", name: "Consultation Rooms", slug: "consultation", capacity: 15 },
  { id: "DEPT-03", tenantId: "demo", branchId: "BR-01", name: "Checkout & Cashier", slug: "checkout", capacity: 5 },
];

export function DepartmentSettings({ session, branch, onBack }: DepartmentSettingsProps) {
  const [departments, setDepartments] = useState<ApiDepartment[]>(
    session.mode === "demo" ? previewDepartments : []
  );
  const [loading, setLoading] = useState(session.mode === "live");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (session.mode !== "live") return;
    void loadDepartments();
  }, [session, branch.id]);

  async function loadDepartments() {
    setLoading(true);
    setNotice("");
    try {
      const list = await klerionApi.listDepartments(session, branch.id);
      setDepartments(list);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load departments");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id={`dept-settings-${branch.id}`} className="view">
      <header className="view-heading">
        <div>
          {onBack && (
            <button
              id={`dept-back-btn-${branch.id}`}
              className="ghost icon-button min-h-[44px] mb-2"
              onClick={onBack}
            >
              <ArrowLeft size={18} className="mr-1" />
              <span>Back to Branches</span>
            </button>
          )}
          <span className="eyebrow">{branch.name}</span>
          <h1>Departments &amp; Capacity</h1>
          <p>Manage functional units and maximum concurrent customer capacity parameters.</p>
        </div>
        <button
          id={`dept-add-btn-${branch.id}`}
          className="primary min-h-[44px] px-4 py-2.5"
          onClick={() => setModalOpen(true)}
        >
          <Plus size={18} />
          <span>Add Department</span>
        </button>
      </header>

      {notice && (
        <div id={`dept-alert-${branch.id}`} className="inline-alert">
          {notice}
        </div>
      )}

      <article id={`dept-panel-${branch.id}`} className="panel table-panel">
        <table>
          <thead>
            <tr>
              <th>Department Name</th>
              <th>Slug</th>
              <th>Simultaneous Capacity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Loading departments…</td>
              </tr>
            ) : departments.length === 0 ? (
              <tr>
                <td colSpan={4}>No departments configured for this branch.</td>
              </tr>
            ) : (
              departments.map((dept) => (
                <tr key={dept.id} id={`dept-row-${dept.id}`}>
                  <td>
                    <div className="identity-cell">
                      <span className="flex items-center justify-center w-8 h-8 rounded bg-gray-100 text-gray-700">
                        <Building2 size={16} />
                      </span>
                      <div>
                        <strong>{dept.name}</strong>
                      </div>
                    </div>
                  </td>
                  <td>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-800">
                      {dept.slug}
                    </code>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 font-medium text-gray-900">
                      <Users size={16} className="text-gray-500" />
                      <span>{dept.capacity} concurrent</span>
                    </div>
                  </td>
                  <td>
                    <span className="status completed">Active</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>

      {modalOpen && (
        <CreateDepartmentModal
          session={session}
          branchId={branch.id}
          onClose={() => setModalOpen(false)}
          onSuccess={(dept) => {
            setDepartments((prev) => [...prev, dept]);
            setModalOpen(false);
          }}
        />
      )}
    </section>
  );
}

function CreateDepartmentModal({
  session,
  branchId,
  onClose,
  onSuccess,
}: {
  readonly session: KlerionSession;
  readonly branchId: string;
  readonly onClose: () => void;
  readonly onSuccess: (department: ApiDepartment) => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [capacity, setCapacity] = useState("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const capNum = parseInt(capacity, 10);
    if (isNaN(capNum) || capNum < 1) {
      setError("Capacity must be a positive integer (at least 1)");
      return;
    }

    if (session.mode === "demo") {
      const fakeDept: ApiDepartment = {
        id: `DEPT-DEMO-${Date.now()}`,
        tenantId: "demo",
        branchId,
        name,
        slug,
        capacity: capNum,
      };
      onSuccess(fakeDept);
      return;
    }

    setLoading(true);
    try {
      const created = await klerionApi.createDepartment(session, branchId, {
        name,
        slug,
        capacity: capNum,
      });
      onSuccess(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create department");
      setLoading(false);
    }
  }

  return (
    <div
      id="dept-modal-backdrop"
      className="command-overlay"
      onMouseDown={onClose}
    >
      <section
        id="dept-modal-dialog"
        className="command-dialog branch-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="identity-cell">
            <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600">
              <Building2 size={20} />
            </span>
            <div>
              <strong>Add Department</strong>
              <small>Configure new department &amp; capacity limits</small>
            </div>
          </div>
          <button
            id="dept-modal-close-btn"
            className="modal-close-btn min-h-[44px] min-w-[44px]"
            onClick={onClose}
            aria-label="Close modal"
          >
            Esc
          </button>
        </div>

        <form id="create-dept-form" className="auth-form" onSubmit={handleSubmit}>
          {error && (
            <div id="dept-form-error" className="inline-alert">
              {error}
            </div>
          )}

          <label htmlFor="dept-name-input">
            <span>Department Name</span>
            <input
              id="dept-name-input"
              required
              placeholder="e.g. Triage & Intake"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
                }
              }}
            />
          </label>

          <label htmlFor="dept-slug-input">
            <span>URL Slug</span>
            <input
              id="dept-slug-input"
              required
              placeholder="e.g. triage-intake"
              pattern="[a-z0-9-]+"
              title="Lowercase letters, numbers, and hyphens only"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>

          <label htmlFor="dept-capacity-input">
            <span>Max Parallel Capacity</span>
            <input
              id="dept-capacity-input"
              required
              type="number"
              min={1}
              step={1}
              placeholder="5"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>

          <div className="form-actions">
            <button
              id="dept-cancel-btn"
              type="button"
              className="min-h-[44px]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              id="dept-submit-btn"
              type="submit"
              className="primary min-h-[44px]"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create Department"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
