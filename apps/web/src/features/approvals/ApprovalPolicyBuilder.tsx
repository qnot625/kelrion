import { ArrowDown, ArrowUp, Plus, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { KlerionSession } from "../../lib/session";
import { approvalsApi, type ApiApprovalPolicy, type ApiApprovalStage, type ApiApprovalStageMode } from "./approvalsApi";

function defaultStage(): ApiApprovalStage {
  return {
    id: `stage_${Date.now()}`,
    name: "Manager approval",
    mode: "ANY",
    approverUserIds: [],
    approverRoles: ["owner", "staff"],
    requiredApprovals: 1,
    dueInMinutes: 1440,
    allowSelfApproval: false,
  };
}

export function ApprovalPolicyBuilder({ session, initial, onSaved, onClose }: {
  readonly session: KlerionSession;
  readonly initial?: ApiApprovalPolicy;
  readonly onSaved: (policy: ApiApprovalPolicy) => void;
  readonly onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "Untitled approval policy");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [stages, setStages] = useState<ApiApprovalStage[]>(initial ? [...initial.stages] : [defaultStage()]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  function patchStage(id: string, patch: Partial<ApiApprovalStage>) {
    setStages((current) => current.map((stage) => stage.id === id ? { ...stage, ...patch } : stage));
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= stages.length) return;
    const next = [...stages];
    [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
    setStages(next);
  }

  async function save(publish: boolean) {
    setWorking(true); setError("");
    try {
      let saved = initial
        ? await approvalsApi.updatePolicy(session, initial.id, { name, description, stages })
        : await approvalsApi.createPolicy(session, { name, description, stages });
      if (publish) saved = await approvalsApi.publishPolicy(session, saved.id);
      onSaved(saved);
      if (publish) onClose();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save approval policy"); }
    finally { setWorking(false); }
  }

  return (
    <section className="panel approval-builder">
      <header className="approval-builder-header">
        <div>
          <span className="eyebrow">Approval policy designer</span>
          <input className="approval-title-input" value={name} onChange={(event) => setName(event.target.value)} maxLength={140} />
          <input className="approval-description-input" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe what this policy governs" />
        </div>
        <div className="approval-builder-actions"><button className="secondary" disabled={working} onClick={() => void save(false)}><Save size={15} /> Save draft</button><button className="primary" disabled={working} onClick={() => void save(true)}><Send size={15} /> Publish</button><button className="text-button" onClick={onClose}>Close</button></div>
      </header>
      {error && <div className="form-error">{error}</div>}

      <div className="approval-builder-toolbar"><button className="secondary compact" onClick={() => setStages((current) => [...current, defaultStage()])}><Plus size={13} /> Add stage</button></div>
      <div className="approval-stage-list">
        {stages.map((stage, index) => (
          <article className="approval-stage-card" key={stage.id}>
            <div className="approval-stage-index">{index + 1}</div>
            <div className="approval-stage-body">
              <header><input value={stage.name} onChange={(event) => patchStage(stage.id, { name: event.target.value })} /><div className="row-actions"><button onClick={() => move(index, -1)}><ArrowUp size={14} /></button><button onClick={() => move(index, 1)}><ArrowDown size={14} /></button><button onClick={() => setStages((current) => current.filter((item) => item.id !== stage.id))}><Trash2 size={14} /></button></div></header>
              <div className="approval-stage-grid">
                <label>Decision mode<select value={stage.mode} onChange={(event) => patchStage(stage.id, { mode: event.target.value as ApiApprovalStageMode })}><option value="ANY">Any one approver</option><option value="QUORUM">Quorum</option><option value="ALL_NAMED">All named users</option></select></label>
                <label>Required approvals<input type="number" min={1} disabled={stage.mode !== "QUORUM"} value={stage.requiredApprovals ?? 1} onChange={(event) => patchStage(stage.id, { requiredApprovals: Number(event.target.value) })} /></label>
                <label>Due in minutes<input type="number" min={1} value={stage.dueInMinutes ?? ""} onChange={(event) => patchStage(stage.id, { dueInMinutes: event.target.value ? Number(event.target.value) : null })} /></label>
                <label>Approver roles<input disabled={stage.mode === "ALL_NAMED"} value={stage.approverRoles.join(", ")} onChange={(event) => patchStage(stage.id, { approverRoles: event.target.value.split(",").map((role) => role.trim()).filter(Boolean) })} placeholder="owner, staff" /></label>
                <label className="wide">Named approver user IDs<input value={stage.approverUserIds.join(", ")} onChange={(event) => patchStage(stage.id, { approverUserIds: event.target.value.split(",").map((id) => id.trim()).filter(Boolean) })} placeholder="UUID, UUID" /></label>
                <label className="form-checkbox wide"><input type="checkbox" checked={Boolean(stage.allowSelfApproval)} onChange={(event) => patchStage(stage.id, { allowSelfApproval: event.target.checked })} /> Allow the requester to approve their own request when otherwise eligible</label>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
