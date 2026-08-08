import { Archive, FileText, Loader2, Plus, Send, Settings2, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { approvalsApi } from "../approvals/approvalsApi";
import { formsApi, type ApiFormSubmission } from "../forms/formsApi";
import { workflowApi } from "../workflow/workflowApi";
import type { KlerionSession } from "../../lib/session";
import {
  serviceDeskApi,
  type ApiServiceDeskCatalogItem,
  type ApiServiceDeskPriority,
  type ApiServiceDeskTicket,
  type ApiServiceDeskTicketType,
} from "./serviceDeskApi";

const TYPES: readonly ApiServiceDeskTicketType[] = ["INCIDENT", "SERVICE_REQUEST", "PROBLEM", "CHANGE_REQUEST"];
const PRIORITIES: readonly ApiServiceDeskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

type Draft = {
  key: string;
  name: string;
  description: string;
  intakeMode: "FREEFORM" | "FORM";
  formDefinitionId: string;
  workflowDefinitionId: string;
  approvalPolicyId: string;
  defaultTicketType: ApiServiceDeskTicketType;
  defaultPriority: ApiServiceDeskPriority;
  categoryKey: string;
  assignmentGroupId: string;
  tags: string;
};

function blank(): Draft {
  return { key: "", name: "", description: "", intakeMode: "FREEFORM", formDefinitionId: "", workflowDefinitionId: "", approvalPolicyId: "", defaultTicketType: "SERVICE_REQUEST", defaultPriority: "MEDIUM", categoryKey: "", assignmentGroupId: "", tags: "" };
}

function fromItem(item: ApiServiceDeskCatalogItem): Draft {
  return {
    key: item.key,
    name: item.name,
    description: item.description,
    intakeMode: item.intakeMode,
    formDefinitionId: item.formDefinitionId ?? "",
    workflowDefinitionId: item.workflowDefinitionId ?? "",
    approvalPolicyId: item.approvalPolicyId ?? "",
    defaultTicketType: item.defaultTicketType,
    defaultPriority: item.defaultPriority,
    categoryKey: item.categoryKey ?? "",
    assignmentGroupId: item.assignmentGroupId ?? "",
    tags: item.tags.join(", "),
  };
}

export function ServiceDeskCatalogPanel({ session, canManage, onTicketCreated }: {
  readonly session: KlerionSession;
  readonly canManage: boolean;
  readonly onTicketCreated: (ticket: ApiServiceDeskTicket) => void;
}) {
  const [items, setItems] = useState<ApiServiceDeskCatalogItem[]>([]);
  const [forms, setForms] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [policies, setPolicies] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [submissions, setSubmissions] = useState<ApiFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ApiServiceDeskCatalogItem | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [requesting, setRequesting] = useState<ApiServiceDeskCatalogItem | null>(null);
  const [requestSubject, setRequestSubject] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [context, setContext] = useState("{}");

  async function load() {
    setLoading(true); setError("");
    try {
      if (session.mode === "demo") { setItems([]); setForms([]); setWorkflows([]); setPolicies([]); setSubmissions([]); }
      else {
        const [catalog, formList, workflowList, policyList, mySubmissions] = await Promise.all([
          serviceDeskApi.listCatalog(session),
          formsApi.listForms(session),
          workflowApi.listDefinitions(session),
          approvalsApi.listPolicies(session),
          formsApi.listMySubmissions(session),
        ]);
        setItems(catalog);
        setForms(formList.filter((item) => item.status === "PUBLISHED").map((item) => ({ id: item.id, title: item.title, status: item.status })));
        setWorkflows(workflowList.filter((item) => item.status === "PUBLISHED").map((item) => ({ id: item.id, name: item.name, status: item.status })));
        setPolicies(policyList.filter((item) => item.status === "PUBLISHED").map((item) => ({ id: item.id, name: item.name, status: item.status })));
        setSubmissions(mySubmissions.filter((item) => item.status === "SUBMITTED" || item.status === "VALIDATED"));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load the request catalogue"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [session.token]);

  const requestSubmissions = useMemo(() => requesting?.formDefinitionId ? submissions.filter((item) => item.formDefinitionId === requesting.formDefinitionId) : [], [requesting, submissions]);

  function openEditor(item?: ApiServiceDeskCatalogItem) {
    setEditing(item ?? "new");
    setDraft(item ? fromItem(item) : blank());
    setError("");
  }

  async function save(publish: boolean) {
    setWorking("catalog-save"); setError("");
    try {
      const input = {
        key: draft.key,
        name: draft.name,
        description: draft.description,
        intakeMode: draft.intakeMode,
        formDefinitionId: draft.intakeMode === "FORM" ? draft.formDefinitionId || null : null,
        workflowDefinitionId: draft.workflowDefinitionId || null,
        approvalPolicyId: draft.workflowDefinitionId ? null : draft.approvalPolicyId || null,
        defaultTicketType: draft.defaultTicketType,
        defaultPriority: draft.defaultPriority,
        categoryKey: draft.categoryKey || null,
        assignmentGroupId: draft.assignmentGroupId || null,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      let saved = editing && editing !== "new"
        ? await serviceDeskApi.updateCatalogItem(session, editing.id, input)
        : await serviceDeskApi.createCatalogItem(session, input);
      if (publish) saved = await serviceDeskApi.publishCatalogItem(session, saved.id);
      setEditing(null);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save catalogue item"); }
    finally { setWorking(""); }
  }

  async function archive(item: ApiServiceDeskCatalogItem) {
    setWorking(item.id); setError("");
    try { await serviceDeskApi.archiveCatalogItem(session, item.id); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not archive catalogue item"); }
    finally { setWorking(""); }
  }

  function openRequest(item: ApiServiceDeskCatalogItem) {
    setRequesting(item);
    setRequestSubject(item.name);
    setRequestDescription("");
    const first = submissions.find((submission) => submission.formDefinitionId === item.formDefinitionId);
    setSubmissionId(first?.id ?? "");
    setContext("{}");
    setError("");
  }

  async function requestItem() {
    if (!requesting) return;
    setWorking("catalog-request"); setError("");
    try {
      const parsed = JSON.parse(context) as Record<string, unknown>;
      const result = await serviceDeskApi.requestCatalogItem(session, requesting.id, {
        subject: requestSubject.trim() || undefined,
        description: requestDescription,
        formSubmissionId: requesting.intakeMode === "FORM" ? submissionId : undefined,
        context: parsed,
      });
      setRequesting(null);
      onTicketCreated(result.ticket);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create service request"); }
    finally { setWorking(""); }
  }

  if (loading) return <section className="panel"><div className="empty-state"><Loader2 className="spin" /> Loading request catalogue…</div></section>;

  return (
    <>
      {error && <div className="form-error">{error}</div>}
      <div className="service-catalog-heading"><div><h2>Request catalogue</h2><p>Structured employee services can require a form, start a fulfilment workflow, or request direct approval.</p></div>{canManage && <button className="primary compact" onClick={() => openEditor()}><Plus size={14} /> New service</button>}</div>
      <section className="forms-card-grid service-catalog-grid">
        {items.map((item) => <article className="panel forms-card service-catalog-card" key={item.id}>
          <header><div className="stack"><strong>{item.name}</strong><small>{item.description || item.key}</small></div><span className={`status-pill ${item.status === "PUBLISHED" ? "approved" : item.status === "ARCHIVED" ? "rejected" : "pending"}`}>{item.status}</span></header>
          <div className="forms-card-meta"><span>Intake<b>{item.intakeMode}</b></span><span>Priority<b>{item.defaultPriority}</b></span><span>Version<b>{item.version}</b></span></div>
          <div className="service-catalog-bindings">{item.formDefinitionId && <span><FileText size={13} /> Form</span>}{item.workflowDefinitionId && <span><Workflow size={13} /> Workflow</span>}{item.approvalPolicyId && <span><Settings2 size={13} /> Approval</span>}</div>
          <footer>{item.status === "PUBLISHED" && <button className="primary compact" onClick={() => openRequest(item)}><Send size={13} /> Request</button>}{canManage && item.status !== "ARCHIVED" && <button className="secondary compact" onClick={() => openEditor(item)}>Edit</button>}{canManage && item.status !== "ARCHIVED" && <button className="text-button danger" disabled={working === item.id} onClick={() => void archive(item)}><Archive size={13} /> Archive</button>}</footer>
        </article>)}
        {items.length === 0 && <section className="panel"><div className="empty-state">No published employee services are available yet.</div></section>}
      </section>

      {editing && <div className="modal-backdrop"><section className="modal-card service-catalog-modal"><header><div><span className="eyebrow">Request catalogue</span><h2>{editing === "new" ? "New employee service" : "Edit employee service"}</h2></div><button className="text-button" onClick={() => setEditing(null)}>Close</button></header><div className="service-catalog-form">
        <label>Key<input value={draft.key} onChange={(event) => setDraft({ ...draft, key: event.target.value })} placeholder="equipment-request" /></label>
        <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="wide">Description<textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label>Intake<select value={draft.intakeMode} onChange={(event) => setDraft({ ...draft, intakeMode: event.target.value as Draft["intakeMode"] })}><option value="FREEFORM">Free form</option><option value="FORM">Published form</option></select></label>
        <label>Form{draft.intakeMode === "FORM" && <select value={draft.formDefinitionId} onChange={(event) => setDraft({ ...draft, formDefinitionId: event.target.value })}><option value="">Select published form</option>{forms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}</select>}</label>
        <label>Workflow<select value={draft.workflowDefinitionId} onChange={(event) => setDraft({ ...draft, workflowDefinitionId: event.target.value, approvalPolicyId: event.target.value ? "" : draft.approvalPolicyId })}><option value="">No workflow</option>{workflows.map((workflow) => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></label>
        <label>Direct approval<select disabled={Boolean(draft.workflowDefinitionId)} value={draft.approvalPolicyId} onChange={(event) => setDraft({ ...draft, approvalPolicyId: event.target.value })}><option value="">No direct approval</option>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}</select></label>
        <label>Ticket type<select value={draft.defaultTicketType} onChange={(event) => setDraft({ ...draft, defaultTicketType: event.target.value as ApiServiceDeskTicketType })}>{TYPES.map((type) => <option value={type} key={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
        <label>Priority<select value={draft.defaultPriority} onChange={(event) => setDraft({ ...draft, defaultPriority: event.target.value as ApiServiceDeskPriority })}>{PRIORITIES.map((priority) => <option value={priority} key={priority}>{priority}</option>)}</select></label>
        <label>Category<input value={draft.categoryKey} onChange={(event) => setDraft({ ...draft, categoryKey: event.target.value })} /></label>
        <label>Assignment group<input value={draft.assignmentGroupId} onChange={(event) => setDraft({ ...draft, assignmentGroupId: event.target.value })} /></label>
        <label className="wide">Tags<input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="hr, employee-service" /></label>
      </div><footer><button className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="secondary" disabled={working === "catalog-save"} onClick={() => void save(false)}>Save draft</button><button className="primary" disabled={working === "catalog-save" || !draft.key.trim() || !draft.name.trim()} onClick={() => void save(true)}>Publish</button></footer></section></div>}

      {requesting && <div className="modal-backdrop"><section className="modal-card service-catalog-modal"><header><div><span className="eyebrow">{requesting.key}</span><h2>{requesting.name}</h2></div><button className="text-button" onClick={() => setRequesting(null)}>Close</button></header><div className="service-catalog-form"><label className="wide">Subject<input value={requestSubject} onChange={(event) => setRequestSubject(event.target.value)} /></label><label className="wide">Details<textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} /></label>{requesting.intakeMode === "FORM" && <label className="wide">Submitted form<select value={submissionId} onChange={(event) => setSubmissionId(event.target.value)}><option value="">Select a submitted form</option>{requestSubmissions.map((submission) => <option value={submission.id} key={submission.id}>{submission.id.slice(0, 8)} · v{submission.formVersion} · {submission.status}</option>)}</select><small>Complete and submit the required form in Dynamic Forms before creating this request.</small></label>}<label className="wide">Additional context (JSON)<textarea className="service-catalog-json" value={context} onChange={(event) => setContext(event.target.value)} spellCheck={false} /></label></div><footer><button className="secondary" onClick={() => setRequesting(null)}>Cancel</button><button className="primary" disabled={working === "catalog-request" || (requesting.intakeMode === "FORM" && !submissionId)} onClick={() => void requestItem()}>Submit request</button></footer></section></div>}
    </>
  );
}
