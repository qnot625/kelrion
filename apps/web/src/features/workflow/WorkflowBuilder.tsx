import { ArrowDown, ArrowUp, Plus, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { workflowApi, type ApiWorkflowDefinition, type ApiWorkflowStep, type ApiWorkflowStepType, type ApiWorkflowTrigger } from "./workflowApi";

const STEP_TYPES: readonly ApiWorkflowStepType[] = ["MANUAL_TASK", "AUTOMATIC_TASK", "APPROVAL_TASK"];

function defaults(): ApiWorkflowStep[] {
  return [
    { id: "start", name: "Start", type: "START", transitions: [{ targetStepId: "task_1" }] },
    { id: "task_1", name: "Review request", type: "MANUAL_TASK", taskConfig: { candidateRoles: ["staff", "owner"], dueInMinutes: 1440 }, transitions: [{ targetStepId: "end" }] },
    { id: "end", name: "End", type: "END", transitions: [] },
  ];
}

function nextStepId(type: ApiWorkflowStepType, count: number) {
  return `${type.toLowerCase()}_${Date.now()}_${count}`;
}

export function WorkflowBuilder({
  session,
  initial,
  onSaved,
  onClose,
}: {
  readonly session: KlerionSession;
  readonly initial?: ApiWorkflowDefinition;
  readonly onSaved: (definition: ApiWorkflowDefinition) => void;
  readonly onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "Untitled workflow");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [steps, setSteps] = useState<ApiWorkflowStep[]>(initial ? [...initial.steps] : defaults());
  const firstTrigger = initial?.triggers[0] ?? { type: "MANUAL" as const };
  const [triggerType, setTriggerType] = useState<ApiWorkflowTrigger["type"]>(firstTrigger.type);
  const [triggerRef, setTriggerRef] = useState(firstTrigger.formDefinitionId ?? firstTrigger.eventName ?? firstTrigger.schedule ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  function patchStep(id: string, patch: Partial<ApiWorkflowStep>) {
    setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  }

  function addStep(type: ApiWorkflowStepType) {
    const endIndex = steps.findIndex((step) => step.type === "END");
    const id = nextStepId(type, steps.length);
    const endId = steps.find((step) => step.type === "END")?.id ?? "end";
    const step: ApiWorkflowStep = type === "AUTOMATIC_TASK"
      ? { id, name: "Set workflow data", type, automaticConfig: { operation: "SET_VARIABLES", values: {} }, transitions: [{ targetStepId: endId }] }
      : { id, name: type === "APPROVAL_TASK" ? "Approval" : "Manual task", type, taskConfig: { candidateRoles: ["staff", "owner"], dueInMinutes: 1440 }, transitions: [{ targetStepId: endId }] };
    const next = [...steps];
    const insertAt = endIndex >= 0 ? endIndex : next.length;
    next.splice(insertAt, 0, step);
    setSteps(next);
  }

  function move(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= steps.length) return;
    if (steps[index]?.type === "START" || steps[index]?.type === "END" || steps[destination]?.type === "START" || steps[destination]?.type === "END") return;
    const next = [...steps];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    setSteps(next);
  }

  function remove(id: string) {
    const next = steps.filter((step) => step.id !== id).map((step) => ({
      ...step,
      transitions: step.transitions.filter((transition) => transition.targetStepId !== id),
    }));
    setSteps(next);
  }

  function trigger(): ApiWorkflowTrigger[] {
    if (triggerType === "FORM_SUBMISSION") return [{ type: triggerType, formDefinitionId: triggerRef.trim() || null }];
    if (triggerType === "EVENT") return [{ type: triggerType, eventName: triggerRef.trim() || null }];
    if (triggerType === "SCHEDULED") return [{ type: triggerType, schedule: triggerRef.trim() || null }];
    return [{ type: triggerType }];
  }

  async function save(publish: boolean) {
    setWorking(true);
    setError("");
    try {
      const start = steps.find((step) => step.type === "START");
      let saved = initial
        ? await workflowApi.updateDefinition(session, initial.id, { name, description, startStepId: start?.id, steps, triggers: trigger() })
        : await workflowApi.createDefinition(session, { name, description, startStepId: start?.id, steps, triggers: trigger() });
      if (publish) saved = await workflowApi.publishDefinition(session, saved.id);
      onSaved(saved);
      if (publish) onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save workflow");
    } finally { setWorking(false); }
  }

  return (
    <section className="panel workflow-builder">
      <header className="workflow-builder-header">
        <div>
          <span className="eyebrow">Workflow designer</span>
          <input className="workflow-title-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={140} />
          <input className="workflow-description-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What process does this automate?" />
        </div>
        <div className="workflow-builder-actions">
          <button className="secondary" disabled={working} onClick={() => void save(false)}><Save size={15} /> Save draft</button>
          <button className="primary" disabled={working} onClick={() => void save(true)}><Send size={15} /> Publish</button>
          <button className="text-button" onClick={onClose}>Close</button>
        </div>
      </header>
      {error && <div className="form-error">{error}</div>}

      <div className="workflow-trigger-editor">
        <label>Trigger<select value={triggerType} onChange={(event) => setTriggerType(event.target.value as ApiWorkflowTrigger["type"])}><option value="MANUAL">Manual</option><option value="FORM_SUBMISSION">Form submission</option><option value="EVENT">Named event</option><option value="API">API</option><option value="SCHEDULED">Scheduled</option></select></label>
        {(triggerType === "FORM_SUBMISSION" || triggerType === "EVENT" || triggerType === "SCHEDULED") && <label>{triggerType === "FORM_SUBMISSION" ? "Form definition ID" : triggerType === "EVENT" ? "Event name" : "Schedule descriptor"}<input value={triggerRef} onChange={(event) => setTriggerRef(event.target.value)} placeholder={triggerType === "EVENT" ? "purchase.approved" : triggerType === "SCHEDULED" ? "daily:09:00" : "UUID"} /></label>}
      </div>

      <div className="workflow-add-steps">
        {STEP_TYPES.map((type) => <button className="secondary compact" key={type} onClick={() => addStep(type)}><Plus size={13} /> {type.replaceAll("_", " ").toLowerCase()}</button>)}
      </div>

      <div className="workflow-step-list">
        {steps.map((step, index) => (
          <article key={step.id} className={`workflow-step-card ${step.type.toLowerCase()}`}>
            <div className="workflow-step-number">{index + 1}</div>
            <div className="workflow-step-body">
              <div className="workflow-step-head">
                <div><small>{step.type.replaceAll("_", " ")}</small><input value={step.name} onChange={(event) => patchStep(step.id, { name: event.target.value })} /></div>
                {step.type !== "START" && step.type !== "END" && <div className="row-actions"><button onClick={() => move(index, -1)}><ArrowUp size={14} /></button><button onClick={() => move(index, 1)}><ArrowDown size={14} /></button><button onClick={() => remove(step.id)}><Trash2 size={14} /></button></div>}
              </div>

              {(step.type === "MANUAL_TASK" || step.type === "APPROVAL_TASK") && <div className="workflow-step-config"><label>Candidate roles<input value={(step.taskConfig?.candidateRoles ?? []).join(", ")} onChange={(event) => patchStep(step.id, { taskConfig: { ...step.taskConfig, candidateRoles: event.target.value.split(",").map((role) => role.trim()).filter(Boolean) } })} /></label><label>Due in minutes<input type="number" value={step.taskConfig?.dueInMinutes ?? ""} onChange={(event) => patchStep(step.id, { taskConfig: { ...step.taskConfig, dueInMinutes: event.target.value ? Number(event.target.value) : null } })} /></label></div>}

              {step.type === "AUTOMATIC_TASK" && <label className="workflow-json-field">Set variables (JSON)<textarea value={JSON.stringify(step.automaticConfig?.values ?? {}, null, 2)} onChange={(event) => {
                try { patchStep(step.id, { automaticConfig: { operation: "SET_VARIABLES", values: JSON.parse(event.target.value) as Record<string, unknown> } }); setError(""); }
                catch { setError("Automatic task variables must be valid JSON before saving."); }
              }} /></label>}

              {step.type !== "END" && <div className="workflow-transitions"><strong>Transitions</strong>{step.transitions.map((transition, transitionIndex) => <div className="workflow-transition" key={`${step.id}-${transitionIndex}`}><select value={transition.targetStepId} onChange={(event) => patchStep(step.id, { transitions: step.transitions.map((item, i) => i === transitionIndex ? { ...item, targetStepId: event.target.value } : item) })}>{steps.filter((candidate) => candidate.id !== step.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id}</option>)}</select><label className="form-checkbox"><input type="checkbox" checked={Boolean(transition.isDefault)} onChange={(event) => patchStep(step.id, { transitions: step.transitions.map((item, i) => i === transitionIndex ? { ...item, isDefault: event.target.checked, condition: event.target.checked ? undefined : item.condition } : item) })} /> Default</label>{!transition.isDefault && <><input placeholder="Variable, e.g. amount" value={transition.condition?.field ?? ""} onChange={(event) => patchStep(step.id, { transitions: step.transitions.map((item, i) => i === transitionIndex ? { ...item, condition: { field: event.target.value, operator: item.condition?.operator ?? "EQUALS", value: item.condition?.value ?? "" } } : item) })} /><select value={transition.condition?.operator ?? "EQUALS"} onChange={(event) => patchStep(step.id, { transitions: step.transitions.map((item, i) => i === transitionIndex ? { ...item, condition: { field: item.condition?.field ?? "", operator: event.target.value as ApiWorkflowConditionOperator, value: item.condition?.value } } : item) })}><option value="EQUALS">Equals</option><option value="NOT_EQUALS">Not equals</option><option value="GREATER_THAN">Greater than</option><option value="LESS_THAN">Less than</option><option value="CONTAINS">Contains</option><option value="IS_SET">Is set</option><option value="IS_NOT_SET">Is not set</option></select><input placeholder="Value" value={String(transition.condition?.value ?? "")} onChange={(event) => patchStep(step.id, { transitions: step.transitions.map((item, i) => i === transitionIndex ? { ...item, condition: { field: item.condition?.field ?? "", operator: item.condition?.operator ?? "EQUALS", value: event.target.value } } : item) })} /></>}</div>)}</div>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

type ApiWorkflowConditionOperator = "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN" | "CONTAINS" | "IN" | "IS_SET" | "IS_NOT_SET" | "ALWAYS";
