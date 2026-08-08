import { Activity, CheckCircle2, Clock3, GitBranch, Loader2, Play, Plus, Search, ShieldCheck, StopCircle, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { WorkflowBuilder } from "./WorkflowBuilder";
import { workflowApi, type ApiHumanTask, type ApiWorkflowDefinition, type ApiWorkflowInstance } from "./workflowApi";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
}

export function WorkflowView({ session }: { readonly session: KlerionSession }) {
  const canManage = session.roles.some((role) => role === "owner" || role === "staff");
  const [definitions, setDefinitions] = useState<ApiWorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<ApiWorkflowInstance[]>([]);
  const [tasks, setTasks] = useState<ApiHumanTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"definitions" | "instances" | "tasks">("definitions");
  const [builder, setBuilder] = useState<ApiWorkflowDefinition | "new" | null>(null);
  const [variablesText, setVariablesText] = useState("{}");
  const [starting, setStarting] = useState<ApiWorkflowDefinition | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (session.mode === "demo") {
        setDefinitions([]); setInstances([]); setTasks([]);
      } else {
        const [definitionList, instanceList, taskList] = await Promise.all([
          workflowApi.listDefinitions(session),
          workflowApi.listInstances(session),
          workflowApi.listTasks(session, canManage),
        ]);
        setDefinitions(definitionList);
        setInstances(instanceList);
        setTasks(taskList);
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load workflow workspace"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [session.token, canManage]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? definitions.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(q)) : definitions;
  }, [definitions, query]);

  async function archive(definition: ApiWorkflowDefinition) {
    setWorking(definition.id); setError("");
    try {
      const updated = await workflowApi.archiveDefinition(session, definition.id);
      setDefinitions((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not archive workflow"); }
    finally { setWorking(""); }
  }

  async function start() {
    if (!starting) return;
    setWorking(starting.id); setError("");
    try {
      const variables = JSON.parse(variablesText) as Record<string, unknown>;
      await workflowApi.startWorkflow(session, starting.id, variables);
      setStarting(null); setVariablesText("{}"); await load(); setTab("instances");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Variables must be valid JSON and the workflow must be startable"); }
    finally { setWorking(""); }
  }

  async function completeTask(task: ApiHumanTask) {
    setWorking(task.id); setError("");
    try { await workflowApi.completeTask(session, task.id, {}); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not complete task"); }
    finally { setWorking(""); }
  }

  async function cancel(instance: ApiWorkflowInstance) {
    setWorking(instance.id); setError("");
    try { const updated = await workflowApi.cancelInstance(session, instance.id, "Cancelled from Company Console"); setInstances((current) => current.map((item) => item.id === updated.id ? updated : item)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not cancel workflow instance"); }
    finally { setWorking(""); }
  }

  if (builder && canManage) {
    return <div className="view"><WorkflowBuilder session={session} initial={builder === "new" ? undefined : builder} onSaved={(saved) => setDefinitions((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current])} onClose={() => setBuilder(null)} /></div>;
  }

  const published = definitions.filter((item) => item.status === "PUBLISHED").length;
  const waiting = instances.filter((item) => item.status === "WAITING").length;
  const openTasks = tasks.filter((item) => !["COMPLETED", "CANCELLED"].includes(item.status)).length;

  return (
    <div className="view">
      <div className="view-heading">
        <div><span className="eyebrow">Process automation</span><h1>Workflow engine</h1><p>Publish versioned process graphs, trigger them manually or from forms and events, and route human work without changing running instances when definitions evolve.</p></div>
        {canManage && <button className="primary" onClick={() => setBuilder("new")}><Plus size={16} /> New workflow</button>}
      </div>

      <div className="lifecycle-metrics">
        <article><span><GitBranch size={18} /></span><div><small>Definitions</small><strong>{definitions.length}</strong><em>{published} published</em></div></article>
        <article><span><Activity size={18} /></span><div><small>Instances</small><strong>{instances.length}</strong><em>{waiting} waiting</em></div></article>
        <article><span><Clock3 size={18} /></span><div><small>Open tasks</small><strong>{openTasks}</strong><em>human actions</em></div></article>
        <article><span><ShieldCheck size={18} /></span><div><small>Engine</small><strong>100</strong><em>automatic-step safety guard</em></div></article>
      </div>
      {error && <div className="form-error">{error}</div>}

      <div className="toolbar lifecycle-toolbar workflow-toolbar">
        <div className="segmented-control"><button className={tab === "definitions" ? "active" : ""} onClick={() => setTab("definitions")}>Definitions</button><button className={tab === "instances" ? "active" : ""} onClick={() => setTab("instances")}>Instances</button><button className={tab === "tasks" ? "active" : ""} onClick={() => setTab("tasks")}>Tasks</button></div>
        {tab === "definitions" && <label className="global-search" style={{ maxWidth: 360 }}><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflow definitions" /></label>}
      </div>

      {loading ? <section className="panel"><div className="empty-state"><Loader2 className="spin" /> Loading workflow engine…</div></section> : tab === "definitions" ? (
        <section className="forms-card-grid">
          {filtered.map((definition) => <article className="panel forms-card workflow-definition-card" key={definition.id}><header><div className="stack"><strong>{definition.name}</strong><small>{definition.description || "No description"}</small></div><span className={`status-pill ${definition.status === "PUBLISHED" ? "approved" : definition.status === "ARCHIVED" ? "rejected" : "pending"}`}>{definition.status}</span></header><div className="forms-card-meta"><span>Version<b>{definition.version}</b></span><span>Steps<b>{definition.steps.length}</b></span><span>Triggers<b>{definition.triggers.length}</b></span></div><small>{definition.triggers.map((trigger) => trigger.type.replaceAll("_", " ")).join(" · ")} · Updated {date(definition.updatedAt)}</small><footer>{definition.status === "PUBLISHED" && <button className="primary" onClick={() => { setStarting(definition); setVariablesText("{}"); }}><Play size={14} /> Start</button>}{canManage && definition.status !== "ARCHIVED" && <button className="secondary" onClick={() => setBuilder(definition)}><Wrench size={14} /> Edit</button>}{canManage && definition.status !== "ARCHIVED" && <button className="text-button danger" disabled={working === definition.id} onClick={() => void archive(definition)}>Archive</button>}</footer></article>)}
          {filtered.length === 0 && <section className="panel"><div className="empty-state">No workflow definitions match this view.</div></section>}
        </section>
      ) : tab === "instances" ? (
        <section className="panel table-panel"><table><thead><tr><th>Instance</th><th>Workflow</th><th>Version</th><th>Source</th><th>Status</th><th>Updated</th>{canManage && <th>Action</th>}</tr></thead><tbody>{instances.map((instance) => <tr key={instance.id}><td><div className="stack"><strong>{instance.id.slice(0, 8)}</strong><small>{instance.startedByUserId === session.userId ? "Started by me" : instance.startedByUserId.slice(0, 8)}</small></div></td><td>{definitions.find((item) => item.id === instance.workflowDefinitionId)?.name ?? instance.workflowDefinitionId.slice(0, 8)}</td><td>v{instance.workflowVersion}</td><td>{instance.sourceType.replaceAll("_", " ")}</td><td><span className={`status-pill ${instance.status === "COMPLETED" ? "approved" : instance.status === "FAILED" || instance.status === "CANCELLED" ? "rejected" : "pending"}`}>{instance.status}</span></td><td>{date(instance.updatedAt)}</td>{canManage && <td>{!["COMPLETED", "FAILED", "CANCELLED"].includes(instance.status) ? <button className="secondary compact" disabled={working === instance.id} onClick={() => void cancel(instance)}><StopCircle size={13} /> Cancel</button> : "—"}</td>}</tr>)}{instances.length === 0 && <tr><td colSpan={canManage ? 7 : 6}><div className="empty-state">No workflow instances yet.</div></td></tr>}</tbody></table></section>
      ) : (
        <section className="panel table-panel"><table><thead><tr><th>Task</th><th>Workflow</th><th>Kind</th><th>Assignee</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><div className="stack"><strong>{task.name}</strong><small>{task.description || task.stepId}</small></div></td><td>{definitions.find((item) => item.id === task.workflowDefinitionId)?.name ?? task.workflowDefinitionId.slice(0, 8)}</td><td>{task.kind}</td><td>{task.assigneeUserId === session.userId ? "Me" : task.assigneeUserId?.slice(0, 8) ?? task.candidateRoles.join(", ") || "Eligible user"}</td><td>{date(task.dueAt)}</td><td><span className={`status-pill ${task.status === "COMPLETED" ? "approved" : "pending"}`}>{task.status}</span></td><td>{!["COMPLETED", "CANCELLED"].includes(task.status) ? <button className="primary compact" disabled={working === task.id} onClick={() => void completeTask(task)}><CheckCircle2 size={13} /> Complete</button> : "—"}</td></tr>)}{tasks.length === 0 && <tr><td colSpan={7}><div className="empty-state">No workflow tasks are available in this view.</div></td></tr>}</tbody></table></section>
      )}

      {starting && <div className="modal-backdrop"><section className="modal-card workflow-start-modal"><header><div><span className="eyebrow">Manual execution</span><h2>Start {starting.name}</h2></div><button className="text-button" onClick={() => setStarting(null)}>Close</button></header><p>Provide initial workflow variables as a JSON object. Published form and event triggers supply these values automatically.</p><textarea value={variablesText} onChange={(event) => setVariablesText(event.target.value)} spellCheck={false} /><footer><button className="secondary" onClick={() => setStarting(null)}>Cancel</button><button className="primary" disabled={working === starting.id} onClick={() => void start()}><Play size={14} /> Start workflow</button></footer></section></div>}
    </div>
  );
}
