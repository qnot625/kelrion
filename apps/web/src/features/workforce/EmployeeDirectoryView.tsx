import { BriefcaseBusiness, Loader2, Plus, Search, UserRoundCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { KlerionSession } from "../../lib/session";
import { workforceApi, type ApiEmployee, type ApiEmploymentType } from "./workforceApi";

const demoEmployees: ApiEmployee[] = [
  {
    id: "demo-employee-1",
    tenantId: "demo-tenant",
    userId: "demo-owner",
    employeeNumber: "EMP-001",
    firstName: "Amina",
    lastName: "Yusuf",
    email: "amina@klerion.demo",
    hireDate: "2025-03-10",
    employmentType: "full_time",
    employmentStatus: "active",
    departmentId: null,
    positionId: null,
    managerId: null,
    branchId: null,
    terminationDate: null,
    createdAt: "2025-03-10T08:00:00.000Z",
    updatedAt: "2026-08-06T08:00:00.000Z",
  },
  {
    id: "demo-employee-2",
    tenantId: "demo-tenant",
    userId: null,
    employeeNumber: "EMP-002",
    firstName: "Noah",
    lastName: "Okafor",
    email: "noah@klerion.demo",
    hireDate: "2026-01-08",
    employmentType: "contract",
    employmentStatus: "active",
    departmentId: null,
    positionId: null,
    managerId: "demo-employee-1",
    branchId: null,
    terminationDate: null,
    createdAt: "2026-01-08T08:00:00.000Z",
    updatedAt: "2026-08-06T08:00:00.000Z",
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function EmployeeDirectoryView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (session.mode === "demo") setEmployees(demoEmployees);
      else setEmployees([...(await workforceApi.listEmployees(session)).data]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load employee records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.token]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return employees;
    return employees.filter((employee) =>
      `${employee.employeeNumber} ${employee.firstName} ${employee.lastName} ${employee.email}`.toLowerCase().includes(normalized),
    );
  }, [employees, query]);

  const active = employees.filter((employee) => employee.employmentStatus === "active").length;
  const linked = employees.filter((employee) => employee.userId).length;
  const managers = new Set(employees.map((employee) => employee.managerId).filter(Boolean)).size;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setWorking(true);
    setError("");
    try {
      const input = {
        employeeNumber: String(data.get("employeeNumber")),
        firstName: String(data.get("firstName")),
        lastName: String(data.get("lastName")),
        email: String(data.get("email")),
        hireDate: String(data.get("hireDate")),
        employmentType: data.get("employmentType") as ApiEmploymentType,
      };
      const created = session.mode === "demo"
        ? {
            ...demoEmployees[0],
            ...input,
            id: `demo-${Date.now()}`,
            userId: null,
            managerId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        : await workforceApi.createEmployee(session, input);
      setEmployees((current) => [...current, created]);
      setShowForm(false);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create employee");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">Workforce core</span>
          <h1>Employee directory</h1>
          <p>Maintain tenant-scoped employee master records, reporting lines and identity links without replacing account or leave data.</p>
        </div>
        {canManage && <button className="primary" onClick={() => setShowForm((value) => !value)}><Plus size={16} /> Add employee</button>}
      </div>

      <div className="lifecycle-metrics">
        <article><span><UsersRound size={18} /></span><div><small>Employee records</small><strong>{employees.length}</strong><em>in directory</em></div></article>
        <article><span><UserRoundCheck size={18} /></span><div><small>Active</small><strong>{active}</strong><em>available workforce</em></div></article>
        <article><span><BriefcaseBusiness size={18} /></span><div><small>Reporting managers</small><strong>{managers}</strong><em>manager nodes</em></div></article>
        <article><span><UserRoundCheck size={18} /></span><div><small>Identity linked</small><strong>{linked}</strong><em>self-service enabled</em></div></article>
      </div>

      {showForm && canManage && (
        <form className="panel lifecycle-form" onSubmit={submit}>
          <header><div><h2>Create employee record</h2><p>Identity linking, branch placement and manager assignment can be added through the API after the core record is created.</p></div></header>
          <div className="lifecycle-form-grid">
            <label>Employee number<input name="employeeNumber" required maxLength={40} placeholder="EMP-1042" /></label>
            <label>First name<input name="firstName" required maxLength={100} /></label>
            <label>Last name<input name="lastName" required maxLength={100} /></label>
            <label>Email<input name="email" type="email" required /></label>
            <label>Hire date<input name="hireDate" type="date" required /></label>
            <label>Employment type<select name="employmentType" defaultValue="full_time"><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="intern">Intern</option><option value="temporary">Temporary</option></select></label>
          </div>
          <footer><button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" disabled={working}>{working && <Loader2 size={14} className="spin" />}Create employee</button></footer>
        </form>
      )}

      {error && <div className="form-error">{error}</div>}

      <div className="toolbar lifecycle-toolbar">
        <strong>{canManage ? "Organisation directory" : "My employee record"}</strong>
        <label className="global-search" style={{ maxWidth: 340 }}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, number or email" /></label>
      </div>

      <section className="panel table-panel">
        {loading ? <div className="empty-state"><Loader2 className="spin" />Loading employee records…</div> : (
          <table>
            <thead><tr><th>Employee</th><th>Type</th><th>Status</th><th>Hire date</th><th>Self-service</th></tr></thead>
            <tbody>
              {filtered.map((employee) => (
                <tr key={employee.id}>
                  <td><div className="stack"><strong>{employee.firstName} {employee.lastName}</strong><small>{employee.employeeNumber} · {employee.email}</small></div></td>
                  <td>{label(employee.employmentType)}</td>
                  <td><span className={`status-pill ${employee.employmentStatus === "active" ? "approved" : employee.employmentStatus === "terminated" ? "rejected" : "pending"}`}>{label(employee.employmentStatus)}</span></td>
                  <td>{formatDate(employee.hireDate)}</td>
                  <td>{employee.userId ? "Identity linked" : "Not linked"}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5}><div className="empty-state">No employee records match this view.</div></td></tr>}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
