import { Archive, CheckCircle2, FileInput, FileText, Layers3, Loader2, Plus, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { FormBuilder } from "./FormBuilder";
import { FormRenderer } from "./FormRenderer";
import { formsApi, type ApiFormDefinition, type ApiFormSubmission } from "./formsApi";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "—";
}

export function FormsView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [forms, setForms] = useState<ApiFormDefinition[]>([]);
  const [submissions, setSubmissions] = useState<ApiFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"forms" | "submissions">("forms");
  const [builder, setBuilder] = useState<ApiFormDefinition | "new" | null>(null);
  const [filling, setFilling] = useState<ApiFormDefinition | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (session.mode === "demo") {
        setForms([]);
        setSubmissions([]);
      } else {
        const [formList, submissionList] = await Promise.all([
          formsApi.listForms(session),
          canManage ? formsApi.listAllSubmissions(session) : formsApi.listMySubmissions(session),
        ]);
        setForms(formList);
        setSubmissions(submissionList);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load forms workspace");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [session.token, canManage]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return forms;
    return forms.filter((form) => `${form.title} ${form.description} ${form.templateKey ?? ""}`.toLowerCase().includes(normalized));
  }, [forms, query]);

  const published = forms.filter((form) => form.status === "PUBLISHED").length;
  const drafts = forms.filter((form) => form.status === "DRAFT").length;
  const submitted = submissions.filter((submission) => submission.status === "SUBMITTED" || submission.status === "VALIDATED").length;

  async function archive(form: ApiFormDefinition) {
    if (!canManage) return;
    setWorking(form.id);
    setError("");
    try {
      const updated = await formsApi.archiveForm(session, form.id);
      setForms((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not archive form");
    } finally { setWorking(""); }
  }

  async function validate(submission: ApiFormSubmission) {
    setWorking(submission.id);
    setError("");
    try {
      const updated = await formsApi.validateSubmission(session, submission.id);
      setSubmissions((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not validate submission");
    } finally { setWorking(""); }
  }

  if (builder && canManage) {
    return <div className="view"><FormBuilder session={session} initial={builder === "new" ? undefined : builder} onSaved={(saved) => {
      setForms((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
    }} onClose={() => setBuilder(null)} /></div>;
  }

  if (filling) {
    return (
      <div className="view">
        <div className="view-heading"><div><span className="eyebrow">Dynamic forms</span><h1>{filling.title}</h1><p>{filling.description || `Published version ${filling.version}`}</p></div><button className="secondary" onClick={() => setFilling(null)}>Back to forms</button></div>
        <section className="panel forms-fill-panel"><FormRenderer session={session} form={filling} onSubmitted={() => void load()} /></section>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="view-heading">
        <div><span className="eyebrow">Service operations</span><h1>Dynamic forms</h1><p>Design versioned schemas, publish controlled forms and collect submissions without losing the schema that historical records were validated against.</p></div>
        {canManage && <button className="primary" onClick={() => setBuilder("new")}><Plus size={16} /> New form</button>}
      </div>

      <div className="lifecycle-metrics">
        <article><span><FileText size={18} /></span><div><small>Forms</small><strong>{forms.length}</strong><em>available definitions</em></div></article>
        <article><span><CheckCircle2 size={18} /></span><div><small>Published</small><strong>{published}</strong><em>live schemas</em></div></article>
        <article><span><Layers3 size={18} /></span><div><small>Draft revisions</small><strong>{drafts}</strong><em>changes in progress</em></div></article>
        <article><span><FileInput size={18} /></span><div><small>Submissions</small><strong>{submitted}</strong><em>submitted or validated</em></div></article>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="toolbar lifecycle-toolbar forms-toolbar">
        <div className="segmented-control"><button className={tab === "forms" ? "active" : ""} onClick={() => setTab("forms")}>Forms</button><button className={tab === "submissions" ? "active" : ""} onClick={() => setTab("submissions")}>Submissions</button></div>
        {tab === "forms" && <label className="global-search" style={{ maxWidth: 360 }}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search forms or templates" /></label>}
      </div>

      {loading ? <section className="panel"><div className="empty-state"><Loader2 className="spin" />Loading forms workspace…</div></section> : tab === "forms" ? (
        <section className="forms-card-grid">
          {filtered.map((form) => (
            <article className="panel forms-card" key={form.id}>
              <header><div className="stack"><strong>{form.title}</strong><small>{form.description || "No description"}</small></div><span className={`status-pill ${form.status === "PUBLISHED" ? "approved" : form.status === "ARCHIVED" ? "rejected" : "pending"}`}>{form.status}</span></header>
              <div className="forms-card-meta"><span>Version <b>{form.version}</b></span><span>Fields <b>{form.fields.length}</b></span><span>Locale <b>{form.locale}</b></span></div>
              <small>Updated {date(form.updatedAt)}{form.templateKey ? ` · Template ${form.templateKey}` : ""}</small>
              <footer>
                {form.status === "PUBLISHED" && <button className="primary" onClick={() => setFilling(form)}><FileInput size={14} /> Open form</button>}
                {canManage && form.status !== "ARCHIVED" && <button className="secondary" onClick={() => setBuilder(form)}><Settings2 size={14} /> Edit</button>}
                {canManage && form.status !== "ARCHIVED" && <button className="text-button danger" disabled={working === form.id} onClick={() => void archive(form)}><Archive size={14} /> Archive</button>}
              </footer>
            </article>
          ))}
          {filtered.length === 0 && <section className="panel"><div className="empty-state">No forms match this view.</div></section>}
        </section>
      ) : (
        <section className="panel table-panel">
          <table>
            <thead><tr><th>Submission</th><th>Form</th><th>Version</th><th>Status</th><th>Updated</th>{canManage && <th>Action</th>}</tr></thead>
            <tbody>
              {submissions.map((submission) => {
                const form = forms.find((item) => item.id === submission.formDefinitionId);
                return <tr key={submission.id}><td><div className="stack"><strong>{submission.id.slice(0, 8)}</strong><small>{submission.metadata.submittedByUserId === session.userId ? "My submission" : submission.metadata.submittedByUserId?.slice(0, 8) ?? "Account removed"}</small></div></td><td>{form?.title ?? submission.formDefinitionId.slice(0, 8)}</td><td>v{submission.formVersion}</td><td><span className={`status-pill ${submission.status === "VALIDATED" ? "approved" : submission.status === "DRAFT" ? "pending" : "neutral"}`}>{submission.status}</span></td><td>{date(submission.updatedAt)}</td>{canManage && <td>{submission.status === "SUBMITTED" ? <button className="secondary compact" disabled={working === submission.id} onClick={() => void validate(submission)}><CheckCircle2 size={13} /> Validate</button> : "—"}</td>}</tr>;
              })}
              {submissions.length === 0 && <tr><td colSpan={canManage ? 6 : 5}><div className="empty-state">No form submissions yet.</div></td></tr>}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
