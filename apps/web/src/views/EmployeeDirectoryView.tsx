import {
  AlertTriangle, Building2, ChevronLeft, ChevronRight,
  LayoutGrid, List, Mail, RefreshCw,
  Search, ShieldAlert, Trash2, UserCheck, UserMinus, UserPlus, Users, X
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { klerionApi, type ApiEmployee } from "../lib/api";
import type { KlerionSession } from "../lib/session";

const INITIAL_DEMO_EMPLOYEES: ApiEmployee[] = [
  {
    id: "EMP-001",
    tenantId: "demo-tenant",
    employeeNumber: "EMP-1001",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@klerion.demo",
    phone: "+1 (555) 019-2831",
    departmentId: "Operations",
    positionId: "Branch Operations Manager",
    managerId: undefined,
    branchId: "BRANCH-MAIN",
    employmentType: "full_time",
    employmentStatus: "active",
    hireDate: "2024-01-15",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "EMP-002",
    tenantId: "demo-tenant",
    employeeNumber: "EMP-1002",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@klerion.demo",
    phone: "+1 (555) 014-9922",
    departmentId: "Human Resources",
    positionId: "HR Operations Lead",
    managerId: "EMP-001",
    branchId: "BRANCH-MAIN",
    employmentType: "full_time",
    employmentStatus: "active",
    hireDate: "2024-03-01",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "EMP-003",
    tenantId: "demo-tenant",
    employeeNumber: "EMP-1003",
    firstName: "Alex",
    lastName: "Rivera",
    email: "alex.rivera@klerion.demo",
    phone: "+1 (555) 012-7744",
    departmentId: "Engineering",
    positionId: "Senior Systems Engineer",
    managerId: "EMP-001",
    branchId: "BRANCH-NORTH",
    employmentType: "full_time",
    employmentStatus: "on_leave",
    hireDate: "2024-05-10",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "EMP-004",
    tenantId: "demo-tenant",
    employeeNumber: "EMP-1004",
    firstName: "Sarah",
    lastName: "Chen",
    email: "sarah.chen@klerion.demo",
    phone: "+1 (555) 018-3311",
    departmentId: "Customer Support",
    positionId: "Branch Specialist",
    managerId: "EMP-002",
    branchId: "BRANCH-MAIN",
    employmentType: "part_time",
    employmentStatus: "active",
    hireDate: "2024-06-20",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "EMP-005",
    tenantId: "demo-tenant",
    employeeNumber: "EMP-1005",
    firstName: "Michael",
    lastName: "Vance",
    email: "michael.vance@klerion.demo",
    phone: "+1 (555) 016-5588",
    departmentId: "Sales",
    positionId: "Account Executive",
    managerId: "EMP-001",
    branchId: "BRANCH-SOUTH",
    employmentType: "contract",
    employmentStatus: "suspended",
    hireDate: "2024-08-01",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEPARTMENTS = ["Operations", "Human Resources", "Engineering", "Sales", "Customer Support", "Finance"];
const POSITIONS = ["Branch Operations Manager", "HR Operations Lead", "Senior Systems Engineer", "Branch Specialist", "Account Executive", "Finance Officer"];

function hasPermission(session: KlerionSession, permission: string): boolean {
  if (session.roles.includes("owner")) return true;
  if (session.roles.includes("staff")) {
    return ["employees:read", "employees:create", "employees:update", "employees:manage_hierarchy"].includes(permission);
  }
  return false;
}

export function EmployeeDirectoryView({ session }: { readonly session: KlerionSession }) {
  const [employees, setEmployees] = useState<ApiEmployee[]>(INITIAL_DEMO_EMPLOYEES);
  const [total, setTotal] = useState(INITIAL_DEMO_EMPLOYEES.length);
  const [loading, setLoading] = useState(session.mode === "live");
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  const [activeModal, setActiveModal] = useState<"create" | "edit" | "manager" | "status" | "delete" | null>(null);
  const [selectedEmp, setSelectedEmp] = useState<ApiEmployee | null>(null);

  const canRead = hasPermission(session, "employees:read");
  const canCreate = hasPermission(session, "employees:create");
  const canUpdate = hasPermission(session, "employees:update");
  const canManageHierarchy = hasPermission(session, "employees:manage_hierarchy");
  const canDelete = hasPermission(session, "employees:delete");

  const fetchEmployees = useCallback(async () => {
    if (session.mode !== "live") {
      let filtered = [...employees];
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (e) =>
            e.firstName.toLowerCase().includes(q) ||
            e.lastName.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            e.employeeNumber.toLowerCase().includes(q),
        );
      }
      if (departmentFilter !== "all") {
        filtered = filtered.filter((e) => e.departmentId === departmentFilter);
      }
      if (statusFilter !== "all") {
        filtered = filtered.filter((e) => e.employmentStatus === statusFilter);
      }
      setTotal(filtered.length);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await klerionApi.listEmployees(session, {
        search: search || undefined,
        departmentId: departmentFilter !== "all" ? departmentFilter : undefined,
        employmentStatus: statusFilter !== "all" ? statusFilter : undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setEmployees(res.data as ApiEmployee[]);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load employee directory");
    } finally {
      setLoading(false);
    }
  }, [session, employees, search, departmentFilter, statusFilter, page, pageSize]);

  useEffect(() => {
    void fetchEmployees();
  }, [fetchEmployees]);

  const getManagerName = (managerId?: string | null): string => {
    if (!managerId) return "Unassigned";
    const found = employees.find((e) => e.id === managerId);
    return found ? `${found.firstName} ${found.lastName}` : managerId;
  };

  if (!canRead) {
    return (
      <section className="view">
        <div className="security-summary" style={{ background: "#fef2f2", borderColor: "#fecdd3", color: "#9f1239" }}>
          <ShieldAlert size={20} />
          <div>
            <strong>Access Restricted</strong>
            <span>Your role ({session.roles.join(", ")}) does not have `employees:read` permission to view the directory.</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view">
      {/* Header */}
      <header className="view-heading">
        <div>
          <span className="eyebrow">Workforce Management</span>
          <h1>Employee directory</h1>
          <p>Manage employee master records, organizational reporting hierarchy, and employment status lifecycles.</p>
        </div>
        {canCreate && (
          <button
            className="primary"
            onClick={() => {
              setSelectedEmp(null);
              setActiveModal("create");
            }}
          >
            <UserPlus size={16} /> Add employee
          </button>
        )}
      </header>

      {/* Error Alert */}
      {error && (
        <div className="inline-alert" style={{ background: "#fef2f2", color: "#9f1239", border: "1px solid #fecdd3", padding: "12px", borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{error}</span>
          <button onClick={() => void fetchEmployees()} style={{ border: 0, background: "none", color: "#9f1239", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar" style={{ flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "10px", flex: 1, minWidth: "280px" }}>
          <label style={{ flex: 1, maxWidth: "360px" }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by name, email, or employee #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                style={{ border: 0, background: "none", color: "#98a2b3", cursor: "pointer", padding: "0 4px" }}
              >
                <X size={14} />
              </button>
            )}
          </label>

          <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="all">All departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="on_leave">On Leave</option>
            <option value="suspended">Suspended</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="toggle-group">
          <button className={viewMode === "table" ? "active" : ""} onClick={() => setViewMode("table")} title="Table View">
            <List size={16} /> Table
          </button>
          <button className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} title="Grid View">
            <LayoutGrid size={16} /> Grid
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <article className="panel table-panel">
          <div style={{ padding: "40px", textAlign: "center", color: "#667085" }}>Loading employee records…</div>
        </article>
      ) : employees.length === 0 ? (
        <article className="panel" style={{ padding: "48px", textAlign: "center", background: "#fff", borderRadius: "14px", border: "1px solid var(--border)" }}>
          <Users size={48} style={{ color: "#98a2b3", marginBottom: "12px" }} />
          <h3 style={{ margin: "0 0 6px", fontSize: "16px", color: "#101828" }}>No employees found</h3>
          <p style={{ color: "#667085", fontSize: "13px", margin: "0 0 16px" }}>
            {search || departmentFilter !== "all" || statusFilter !== "all"
              ? "Try adjusting your search query or filter parameters."
              : "Get started by adding your first employee to the workforce master record."}
          </p>
          {(search || departmentFilter !== "all" || statusFilter !== "all") && (
            <button
              className="primary"
              onClick={() => {
                setSearch("");
                setDepartmentFilter("all");
                setStatusFilter("all");
              }}
              style={{ padding: "8px 14px", fontSize: "12px" }}
            >
              Reset filters
            </button>
          )}
        </article>
      ) : viewMode === "table" ? (
        /* Table View */
        <article className="panel table-panel">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Contact</th>
                <th>Department & Position</th>
                <th>Type</th>
                <th>Manager</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    <div className="identity-cell">
                      <span>{emp.firstName[0]}{emp.lastName[0]}</span>
                      <div>
                        <strong>{emp.firstName} {emp.lastName}</strong>
                        <small>{emp.employeeNumber}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="stack">
                      <span>{emp.email}</span>
                      <small>{emp.phone || "No phone"}</small>
                    </div>
                  </td>
                  <td>
                    <div className="stack">
                      <strong>{emp.departmentId || "General"}</strong>
                      <small>{emp.positionId || "Staff Member"}</small>
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: "11px", fontWeight: "600", textTransform: "capitalize", color: "#475467" }}>
                      {emp.employmentType.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: "12px", color: emp.managerId ? "#101828" : "#98a2b3" }}>
                      {getManagerName(emp.managerId)}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${emp.employmentStatus}`}>
                      {emp.employmentStatus.replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      {canUpdate && (
                        <button
                          onClick={() => {
                            setSelectedEmp(emp);
                            setActiveModal("edit");
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {canManageHierarchy && (
                        <button
                          onClick={() => {
                            setSelectedEmp(emp);
                            setActiveModal("manager");
                          }}
                        >
                          Manager
                        </button>
                      )}
                      {canUpdate && (
                        <button
                          onClick={() => {
                            setSelectedEmp(emp);
                            setActiveModal("status");
                          }}
                        >
                          Status
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            setSelectedEmp(emp);
                            setActiveModal("delete");
                          }}
                          style={{ color: "#b91c1c" }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ) : (
        /* Grid View */
        <div className="employee-grid">
          {employees.map((emp) => (
            <div key={emp.id} className="employee-card">
              <div className="employee-card-header">
                <div className="identity-cell">
                  <span>{emp.firstName[0]}{emp.lastName[0]}</span>
                  <div>
                    <strong>{emp.firstName} {emp.lastName}</strong>
                    <small>{emp.employeeNumber}</small>
                  </div>
                </div>
                <span className={`status-badge ${emp.employmentStatus}`}>
                  {emp.employmentStatus.replace("_", " ")}
                </span>
              </div>
              <div className="employee-card-body">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Building2 size={14} style={{ color: "#98a2b3" }} />
                  <span>{emp.departmentId || "General"} &bull; {emp.positionId || "Staff"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Mail size={14} style={{ color: "#98a2b3" }} />
                  <span>{emp.email}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <UserCheck size={14} style={{ color: "#98a2b3" }} />
                  <span>Manager: {getManagerName(emp.managerId)}</span>
                </div>
              </div>
              <div className="employee-card-footer">
                {canUpdate && (
                  <button className="icon-button" title="Edit Profile" onClick={() => { setSelectedEmp(emp); setActiveModal("edit"); }}>
                    <UserPlus size={14} />
                  </button>
                )}
                {canManageHierarchy && (
                  <button className="icon-button" title="Assign Manager" onClick={() => { setSelectedEmp(emp); setActiveModal("manager"); }}>
                    <Users size={14} />
                  </button>
                )}
                {canUpdate && (
                  <button className="icon-button" title="Update Status" onClick={() => { setSelectedEmp(emp); setActiveModal("status"); }}>
                    <UserMinus size={14} />
                  </button>
                )}
                {canDelete && (
                  <button className="icon-button" title="Delete Employee" style={{ color: "#b91c1c" }} onClick={() => { setSelectedEmp(emp); setActiveModal("delete"); }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination Footer */}
      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", color: "#667085", fontSize: "12px" }}>
        <span>Showing {employees.length} of {total} records</span>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ border: "1px solid var(--border)", background: "#fff", padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "4px", opacity: page <= 1 ? 0.5 : 1, cursor: page <= 1 ? "default" : "pointer" }}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <button
            disabled={page * pageSize >= total}
            onClick={() => setPage((p) => p + 1)}
            style={{ border: "1px solid var(--border)", background: "#fff", padding: "6px 12px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "4px", opacity: page * pageSize >= total ? 0.5 : 1, cursor: page * pageSize >= total ? "default" : "pointer" }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </footer>

      {/* Modals */}
      {activeModal === "create" && (
        <CreateEmployeeModal
          session={session}
          candidates={employees}
          onClose={() => setActiveModal(null)}
          onSuccess={(newEmp) => {
            setActiveModal(null);
            setEmployees((prev) => [newEmp, ...prev]);
            setTotal((t) => t + 1);
          }}
        />
      )}

      {activeModal === "edit" && selectedEmp && (
        <EditEmployeeModal
          session={session}
          employee={selectedEmp}
          onClose={() => setActiveModal(null)}
          onSuccess={(updated) => {
            setActiveModal(null);
            setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          }}
        />
      )}

      {activeModal === "manager" && selectedEmp && (
        <AssignManagerModal
          session={session}
          employee={selectedEmp}
          candidates={employees.filter((e) => e.id !== selectedEmp.id && e.employmentStatus !== "terminated")}
          onClose={() => setActiveModal(null)}
          onSuccess={(updated) => {
            setActiveModal(null);
            setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          }}
        />
      )}

      {activeModal === "status" && selectedEmp && (
        <UpdateStatusModal
          session={session}
          employee={selectedEmp}
          onClose={() => setActiveModal(null)}
          onSuccess={(updated) => {
            setActiveModal(null);
            setEmployees((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          }}
        />
      )}

      {activeModal === "delete" && selectedEmp && (
        <DeleteEmployeeModal
          session={session}
          employee={selectedEmp}
          onClose={() => setActiveModal(null)}
          onSuccess={(deletedId) => {
            setActiveModal(null);
            setEmployees((prev) => prev.filter((e) => e.id !== deletedId));
            setTotal((t) => Math.max(0, t - 1));
          }}
        />
      )}
    </section>
  );
}

/* ============================================================================
   Create Employee Modal
   ============================================================================ */
function CreateEmployeeModal({
  session, candidates, onClose, onSuccess,
}: {
  readonly session: KlerionSession;
  readonly candidates: ApiEmployee[];
  readonly onClose: () => void;
  readonly onSuccess: (emp: ApiEmployee) => void;
}) {
  const [form, setForm] = useState({
    employeeNumber: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    departmentId: "Operations",
    positionId: "Branch Operations Manager",
    managerId: "",
    employmentType: "full_time",
    hireDate: new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.employeeNumber) {
      setError("Please fill in all required fields.");
      return;
    }
    setLoading(true);
    setError(null);

    if (session.mode !== "live") {
      const mockNew: ApiEmployee = {
        id: `EMP-${Date.now()}`,
        tenantId: session.tenantSlug,
        employeeNumber: form.employeeNumber,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        departmentId: form.departmentId,
        positionId: form.positionId,
        managerId: form.managerId || undefined,
        employmentType: form.employmentType as any,
        employmentStatus: "active",
        hireDate: form.hireDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onSuccess(mockNew);
      return;
    }

    try {
      const created = await klerionApi.createEmployee(session, {
        employeeNumber: form.employeeNumber,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        departmentId: form.departmentId,
        positionId: form.positionId,
        managerId: form.managerId || undefined,
        employmentType: form.employmentType,
        hireDate: form.hireDate,
      });
      onSuccess(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create employee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Add new employee</h2>
            <p>Onboard a new employee to workforce master records.</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              Employee # *
              <input value={form.employeeNumber} onChange={(e) => setForm({ ...form, employeeNumber: e.target.value })} required />
            </label>
            <label>
              Hire date *
              <input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} required />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              First name *
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </label>
            <label>
              Last name *
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              Email address *
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label>
              Phone number
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              Department
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Position title
              <select value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              Employment type
              <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value })}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
                <option value="temporary">Temporary</option>
              </select>
            </label>
            <label>
              Reporting Manager
              <select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}>
                <option value="">No Manager (Top-level)</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} ({c.employeeNumber})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <footer>
            <button type="button" onClick={onClose} style={{ border: "1px solid var(--border)", background: "#fff", padding: "8px 14px", borderRadius: "8px" }}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={loading} style={{ padding: "8px 14px" }}>
              {loading ? "Creating…" : "Save employee"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   Edit Employee Modal
   ============================================================================ */
function EditEmployeeModal({
  session, employee, onClose, onSuccess,
}: {
  readonly session: KlerionSession;
  readonly employee: ApiEmployee;
  readonly onClose: () => void;
  readonly onSuccess: (emp: ApiEmployee) => void;
}) {
  const [form, setForm] = useState({
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone || "",
    departmentId: employee.departmentId || "Operations",
    positionId: employee.positionId || "Branch Operations Manager",
    employmentType: employee.employmentType,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (session.mode !== "live") {
      onSuccess({
        ...employee,
        ...form,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const updated = await klerionApi.updateEmployee(session, employee.id, form);
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update employee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Edit employee details</h2>
            <p>Update master record details for {employee.firstName} {employee.lastName}.</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              Employee #
              <input value={employee.employeeNumber} disabled style={{ background: "#f8fafc", color: "#64748b" }} />
            </label>
            <label>
              Employment type
              <select value={form.employmentType} onChange={(e) => setForm({ ...form, employmentType: e.target.value as any })}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
                <option value="temporary">Temporary</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              First name *
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </label>
            <label>
              Last name *
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              Email address *
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label>
              Phone number
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              Department
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Position title
              <select value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>

          <footer>
            <button type="button" onClick={onClose} style={{ border: "1px solid var(--border)", background: "#fff", padding: "8px 14px", borderRadius: "8px" }}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={loading} style={{ padding: "8px 14px" }}>
              {loading ? "Saving…" : "Save changes"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   Assign Manager Modal
   ============================================================================ */
function AssignManagerModal({
  session, employee, candidates, onClose, onSuccess,
}: {
  readonly session: KlerionSession;
  readonly employee: ApiEmployee;
  readonly candidates: ApiEmployee[];
  readonly onClose: () => void;
  readonly onSuccess: (emp: ApiEmployee) => void;
}) {
  const [managerId, setManagerId] = useState(employee.managerId || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (session.mode !== "live") {
      onSuccess({
        ...employee,
        managerId: managerId || undefined,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const updated = await klerionApi.assignManager(session, employee.id, managerId || null);
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign manager");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Assign reporting manager</h2>
            <p>Set reporting relationship for {employee.firstName} {employee.lastName}.</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {error && (
          <div className="form-error" style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong>Hierarchy Invariant Violation</strong>
              <div>{error}</div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label>
            Select Manager
            <select value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">No Manager (Top-level Executive)</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName} ({c.employeeNumber}) &bull; {c.departmentId || "General"}
                </option>
              ))}
            </select>
          </label>

          <footer style={{ marginTop: "24px" }}>
            <button type="button" onClick={onClose} style={{ border: "1px solid var(--border)", background: "#fff", padding: "8px 14px", borderRadius: "8px" }}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={loading} style={{ padding: "8px 14px" }}>
              {loading ? "Assigning…" : "Update manager"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   Update Status Modal
   ============================================================================ */
function UpdateStatusModal({
  session, employee, onClose, onSuccess,
}: {
  readonly session: KlerionSession;
  readonly employee: ApiEmployee;
  readonly onClose: () => void;
  readonly onSuccess: (emp: ApiEmployee) => void;
}) {
  const [action, setAction] = useState<"suspend" | "reactivate" | "terminate">("suspend");
  const [reason, setReason] = useState("");
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const nextStatus = action === "suspend" ? "suspended" : action === "reactivate" ? "active" : "terminated";

    if (session.mode !== "live") {
      onSuccess({
        ...employee,
        employmentStatus: nextStatus as any,
        terminationDate: action === "terminate" ? terminationDate : undefined,
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    try {
      const updated = await klerionApi.updateEmployeeStatus(session, employee.id, action, reason || undefined, action === "terminate" ? terminationDate : undefined);
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2>Employment status lifecycle</h2>
            <p>Update employment status for {employee.firstName} {employee.lastName}.</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label>
            Select Lifecycle Action
            <select value={action} onChange={(e) => setAction(e.target.value as any)}>
              <option value="suspend">Suspend Employee</option>
              <option value="reactivate">Reactivate Employee</option>
              <option value="terminate">Terminate Employment</option>
            </select>
          </label>

          {action === "terminate" && (
            <label>
              Termination Date *
              <input type="date" value={terminationDate} onChange={(e) => setTerminationDate(e.target.value)} required />
            </label>
          )}

          <label>
            Audit Reason / Justification
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Provide reason for audit log" />
          </label>

          <footer>
            <button type="button" onClick={onClose} style={{ border: "1px solid var(--border)", background: "#fff", padding: "8px 14px", borderRadius: "8px" }}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={loading} style={{ padding: "8px 14px", background: action === "terminate" ? "#dc2626" : undefined }}>
              {loading ? "Updating…" : `Confirm ${action}`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
   Delete Employee Modal
   ============================================================================ */
function DeleteEmployeeModal({
  session, employee, onClose, onSuccess,
}: {
  readonly session: KlerionSession;
  readonly employee: ApiEmployee;
  readonly onClose: () => void;
  readonly onSuccess: (deletedId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    if (session.mode !== "live") {
      onSuccess(employee.id);
      return;
    }

    try {
      await klerionApi.deleteEmployee(session, employee.id);
      onSuccess(employee.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete employee");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h2 style={{ color: "#dc2626" }}>Delete employee record</h2>
            <p>Permanently remove {employee.firstName} {employee.lastName} ({employee.employeeNumber}).</p>
          </div>
          <button type="button" onClick={onClose} style={{ border: 0, background: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </header>

        {error && <div className="form-error">{error}</div>}

        <p style={{ fontSize: "13px", color: "#475467", margin: 0 }}>
          This action will permanently delete this employee record and remove them from the organization directory.
        </p>

        <footer>
          <button type="button" onClick={onClose} style={{ border: "1px solid var(--border)", background: "#fff", padding: "8px 14px", borderRadius: "8px" }}>
            Cancel
          </button>
          <button type="button" onClick={handleDelete} disabled={loading} style={{ border: 0, background: "#dc2626", color: "#fff", padding: "8px 14px", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}>
            {loading ? "Deleting…" : "Confirm Delete"}
          </button>
        </footer>
      </div>
    </div>
  );
}
