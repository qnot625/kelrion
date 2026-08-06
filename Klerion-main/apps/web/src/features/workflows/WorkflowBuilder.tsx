import React, { useState, useEffect } from "react";
import { WorkflowToolbar } from "./WorkflowToolbar.js";
import { WorkflowSidebar } from "./WorkflowSidebar.js";
import { WorkflowCanvas } from "./WorkflowCanvas.js";
import { WorkflowInspector } from "./WorkflowInspector.js";
import { CanvasStep, SelectionState, StepType } from "./types.js";
import {
  WorkflowDefinitionJSON,
  WorkflowStepJSON,
  TransitionRuleJSON,
  TriggerJSON,
  workflowsApi,
} from "./api.js";
import { X, Play, CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface WorkflowBuilderProps {
  initialWorkflow?: WorkflowDefinitionJSON;
  onSave?: (workflow: WorkflowDefinitionJSON) => void;
  onBack?: () => void;
}

const DEFAULT_STEPS: CanvasStep[] = [
  {
    id: "step-start",
    name: "Start",
    type: "START",
    description: "Workflow initiation step",
    position: { x: 100, y: 150 },
    transitions: [
      {
        id: "tr-1",
        targetStepId: "step-approval",
        isDefault: true,
      },
    ],
  },
  {
    id: "step-approval",
    name: "Manager Approval",
    type: "APPROVAL_TASK",
    description: "Manager reviews request details",
    position: { x: 420, y: 150 },
    taskConfig: {
      candidateRoles: ["manager", "admin"],
      priority: "HIGH",
    },
    transitions: [
      {
        id: "tr-2",
        targetStepId: "step-end",
        isDefault: true,
      },
    ],
  },
  {
    id: "step-end",
    name: "Completed",
    type: "END",
    description: "Workflow finished successfully",
    position: { x: 740, y: 150 },
    transitions: [],
  },
];

export const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  initialWorkflow,
  onSave,
  onBack,
}) => {
  const [workflowId, setWorkflowId] = useState<string>(
    initialWorkflow?.id || `wf_${Date.now()}`
  );
  const [name, setName] = useState<string>(
    initialWorkflow?.name || "New Business Process Workflow"
  );
  const [description, setDescription] = useState<string>(
    initialWorkflow?.description || "Automated enterprise workflow definition"
  );
  const [version, setVersion] = useState<number>(initialWorkflow?.version || 1);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED" | "ARCHIVED">(
    initialWorkflow?.status || "DRAFT"
  );
  const [startStepId, setStartStepId] = useState<string>(
    initialWorkflow?.startStepId || "step-start"
  );
  const [triggers, setTriggers] = useState<TriggerJSON[]>(
    (initialWorkflow?.triggers as TriggerJSON[]) || []
  );

  // Steps state with positions
  const [steps, setSteps] = useState<CanvasStep[]>(() => {
    if (initialWorkflow?.steps && initialWorkflow.steps.length > 0) {
      return initialWorkflow.steps.map((st, idx) => ({
        ...st,
        position: st.position || {
          x: 100 + (idx % 4) * 300,
          y: 150 + Math.floor(idx / 4) * 180,
        },
      }));
    }
    return DEFAULT_STEPS;
  });

  const [selection, setSelection] = useState<SelectionState>({ type: "NONE" });
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Test simulation modal state
  const [showSimulationModal, setShowSimulationModal] = useState(false);
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const [simRunning, setSimRunning] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Add Step
  const handleAddStep = (type: StepType, position?: { x: number; y: number }) => {
    const newId = `step_${type.toLowerCase()}_${Date.now().toString(36).substring(4)}`;
    const stepCount = steps.length;
    const defaultPos = position || {
      x: 100 + (stepCount % 4) * 280,
      y: 150 + Math.floor(stepCount / 4) * 160,
    };

    const newStep: CanvasStep = {
      id: newId,
      name: `New ${type.replace("_", " ")}`,
      type,
      description: `Description for ${type}`,
      position: defaultPos,
      transitions: [],
      taskConfig:
        type === "APPROVAL_TASK" || type === "MANUAL_TASK"
          ? { candidateRoles: ["admin"], priority: "MEDIUM" }
          : undefined,
    };

    setSteps((prev) => [...prev, newStep]);
    setSelection({ type: "STEP", stepId: newId });

    if (steps.length === 0 || type === "START") {
      setStartStepId(newId);
    }
  };

  // Delete Step
  const handleDeleteStep = (stepId: string) => {
    setSteps((prev) =>
      prev
        .filter((s) => s.id !== stepId)
        .map((s) => ({
          ...s,
          transitions: s.transitions.filter((t) => t.targetStepId !== stepId),
        }))
    );
    if (selection.type === "STEP" && selection.stepId === stepId) {
      setSelection({ type: "NONE" });
    }
    if (startStepId === stepId) {
      const remainingStart = steps.find((s) => s.id !== stepId && s.type === "START");
      setStartStepId(remainingStart ? remainingStart.id : "");
    }
  };

  // Update step
  const handleUpdateStep = (stepId: string, updatedStep: Partial<WorkflowStepJSON>) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, ...updatedStep } : s))
    );
  };

  // Update step position
  const handleUpdateStepPosition = (stepId: string, x: number, y: number) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, position: { x, y } } : s))
    );
  };

  // Add transition
  const handleAddTransition = (sourceStepId: string, targetStepId: string) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== sourceStepId) return s;
        if (s.transitions.some((t) => t.targetStepId === targetStepId)) return s;

        const newRule: TransitionRuleJSON = {
          id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          targetStepId,
          isDefault: s.transitions.length === 0,
        };

        return { ...s, transitions: [...s.transitions, newRule] };
      })
    );
  };

  // Update transitions
  const handleUpdateTransitions = (stepId: string, transitions: TransitionRuleJSON[]) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, transitions } : s))
    );
  };

  // Auto Layout algorithm
  const handleAutoLayout = () => {
    const layoutMap = new Map<string, number>();
    const visited = new Set<string>();

    const assignRank = (stepId: string, rank: number) => {
      if (visited.has(stepId)) return;
      visited.add(stepId);
      layoutMap.set(stepId, Math.max(layoutMap.get(stepId) || 0, rank));

      const step = steps.find((s) => s.id === stepId);
      step?.transitions.forEach((t) => assignRank(t.targetStepId, rank + 1));
    };

    assignRank(startStepId || steps[0]?.id || "", 0);

    // Group steps by rank
    const rankGroups: Record<number, CanvasStep[]> = {};
    steps.forEach((step) => {
      const rank = layoutMap.get(step.id) ?? 0;
      if (!rankGroups[rank]) rankGroups[rank] = [];
      rankGroups[rank].push(step);
    });

    setSteps((prev) =>
      prev.map((step) => {
        const rank = layoutMap.get(step.id) ?? 0;
        const group = rankGroups[rank] || [step];
        const indexInGroup = group.findIndex((s) => s.id === step.id);

        return {
          ...step,
          position: {
            x: 100 + rank * 320,
            y: 120 + indexInGroup * 170,
          },
        };
      })
    );

    showToast("Auto-layout applied");
  };

  // Export & Import JSON
  const handleExportJSON = () => {
    const payload: WorkflowDefinitionJSON = {
      id: workflowId,
      tenantId: "tenant-default",
      name,
      description,
      version,
      status,
      startStepId,
      steps,
      triggers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${workflowId}-v${version}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (jsonString: string) => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.name) setName(parsed.name);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.startStepId) setStartStepId(parsed.startStepId);
      if (parsed.steps && Array.isArray(parsed.steps)) {
        setSteps(
          parsed.steps.map((s: any, idx: number) => ({
            ...s,
            position: s.position || {
              x: 100 + (idx % 4) * 300,
              y: 150 + Math.floor(idx / 4) * 180,
            },
          }))
        );
      }
      showToast("Workflow JSON imported successfully");
    } catch (err: any) {
      alert("Invalid workflow JSON format");
    }
  };

  // Save Draft API Call
  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const payload: Partial<WorkflowDefinitionJSON> = {
        id: workflowId,
        name,
        description,
        startStepId,
        steps,
        triggers,
      };

      const saved = await workflowsApi.createWorkflow(payload);
      setStatus(saved.status);
      setVersion(saved.version);
      showToast("Workflow draft saved successfully!");
      onSave?.(saved);
    } catch (err: any) {
      showToast(`Error saving draft: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Publish API Call
  const handlePublish = async () => {
    setIsSaving(true);
    try {
      await workflowsApi.createWorkflow({
        id: workflowId,
        name,
        description,
        startStepId,
        steps,
        triggers,
      });

      const published = await workflowsApi.publishWorkflow(workflowId);
      setStatus(published.status);
      setVersion(published.version);
      showToast("Workflow version published!");
      onSave?.(published);
    } catch (err: any) {
      showToast(`Publish error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Archive API Call
  const handleArchive = async () => {
    try {
      const archived = await workflowsApi.archiveWorkflow(workflowId);
      setStatus(archived.status);
      showToast("Workflow definition archived");
      onSave?.(archived);
    } catch (err: any) {
      showToast(`Archive error: ${err.message}`);
    }
  };

  // Run Simulation
  const handleRunSimulation = async () => {
    setShowSimulationModal(true);
    setSimRunning(true);
    setSimLogs(["Initializing workflow execution simulation..."]);

    try {
      const logs: string[] = ["1. Validating graph structure..."];
      const startNode = steps.find((s) => s.id === startStepId);
      if (!startNode) throw new Error("Start step not found!");

      logs.push(`2. Starting execution at Start step '${startNode.name}' (${startNode.id})`);
      let current: CanvasStep | undefined = startNode;
      let stepCount = 0;

      while (current && stepCount < 20) {
        stepCount++;
        logs.push(`-> Step ${stepCount}: Executing '${current.name}' [${current.type}]`);

        if (current.type === "END") {
          logs.push("SUCCESS: Workflow reached END step and completed execution successfully!");
          break;
        }

        if (current.type === "APPROVAL_TASK" || current.type === "MANUAL_TASK") {
          logs.push(`  [PAUSE] Pausing for Human Task intervention on '${current.name}'`);
          logs.push(`  [AUTO-CLAIM] Simulating human task completion with outcome 'APPROVED'...`);
        }

        const nextTransition = current.transitions[0];
        if (!nextTransition) {
          logs.push(`FAILED: No outgoing transitions found from step '${current.name}'`);
          break;
        }

        current = steps.find((s) => s.id === nextTransition.targetStepId);
      }

      setSimLogs(logs);
    } catch (err: any) {
      setSimLogs((prev) => [...prev, `ERROR: ${err.message}`]);
    } finally {
      setSimRunning(false);
    }
  };

  // Apply Templates
  const handleApplyTemplate = (tpl: string) => {
    if (tpl === "PURCHASE_APPROVAL") {
      setName("Purchase Order Approval Workflow");
      setDescription("Multi-stage purchase request authorization process");
      setSteps([
        {
          id: "step-1",
          name: "Submit Order",
          type: "START",
          position: { x: 100, y: 150 },
          transitions: [{ id: "t1", targetStepId: "step-2", isDefault: true }],
        },
        {
          id: "step-2",
          name: "Manager Approval",
          type: "APPROVAL_TASK",
          position: { x: 420, y: 150 },
          taskConfig: { candidateRoles: ["manager"], priority: "HIGH" },
          transitions: [{ id: "t2", targetStepId: "step-3", isDefault: true }],
        },
        {
          id: "step-3",
          name: "Process Payment",
          type: "AUTOMATIC_TASK",
          position: { x: 740, y: 150 },
          transitions: [{ id: "t3", targetStepId: "step-4", isDefault: true }],
        },
        {
          id: "step-4",
          name: "Order Completed",
          type: "END",
          position: { x: 1060, y: 150 },
          transitions: [],
        },
      ]);
      setStartStepId("step-1");
      showToast("Applied Purchase Approval Template");
    }
  };

  return (
    <div className="w-full h-screen flex flex-col bg-slate-100 overflow-hidden font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-lg animate-fade-in flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Toolbar */}
      <WorkflowToolbar
        workflow={{ id: workflowId, name, description, version, status }}
        isSaving={isSaving}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        onArchive={handleArchive}
        onAutoLayout={handleAutoLayout}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        onRunTestSimulation={handleRunSimulation}
        onBack={onBack}
      />

      {/* Main Builder Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Palette Sidebar */}
        <WorkflowSidebar
          triggers={triggers}
          onAddStep={(t) => handleAddStep(t)}
          onAddTrigger={(type) =>
            setTriggers((prev) => [
              ...prev,
              { id: `trig_${Date.now()}`, type, config: {} },
            ])
          }
          onRemoveTrigger={(id) => setTriggers((prev) => prev.filter((t) => t.id !== id))}
          onApplyTemplate={handleApplyTemplate}
        />

        {/* Central Node Graph Canvas */}
        <div className="flex-1 relative">
          <WorkflowCanvas
            steps={steps}
            startStepId={startStepId}
            selection={selection}
            isReadOnly={status === "ARCHIVED"}
            onSelectStep={(stepId) => setSelection({ type: "STEP", stepId })}
            onSelectTransition={(ruleId, sourceStepId) =>
              setSelection({ type: "TRANSITION", ruleId, sourceStepId })
            }
            onClearSelection={() => setSelection({ type: "NONE" })}
            onUpdateStepPosition={handleUpdateStepPosition}
            onAddTransition={handleAddTransition}
            onDeleteStep={handleDeleteStep}
            onSetStartStep={(sId) => setStartStepId(sId)}
            onAddStepAtPosition={(x, y) => handleAddStep("AUTOMATIC_TASK", { x, y })}
          />
        </div>

        {/* Right Property Inspector Panel */}
        <WorkflowInspector
          workflow={{ id: workflowId, name, description, version, status, startStepId }}
          steps={steps}
          selection={selection}
          isReadOnly={status === "ARCHIVED"}
          onUpdateWorkflowDetails={(n, d) => {
            setName(n);
            setDescription(d);
          }}
          onUpdateStep={handleUpdateStep}
          onUpdateTransitions={handleUpdateTransitions}
          onSetStartStep={(sId) => setStartStepId(sId)}
          onClose={() => setSelection({ type: "NONE" })}
        />
      </div>

      {/* Simulation Modal */}
      {showSimulationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Play className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Workflow Execution Simulator</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSimulationModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-950 rounded-xl p-4 font-mono text-xs text-slate-200 h-64 overflow-y-auto space-y-1.5">
              {simLogs.map((log, i) => (
                <div
                  key={i}
                  className={`${
                    log.includes("SUCCESS")
                      ? "text-emerald-400 font-bold"
                      : log.includes("ERROR") || log.includes("FAILED")
                      ? "text-rose-400 font-bold"
                      : log.includes("PAUSE")
                      ? "text-amber-300"
                      : "text-slate-300"
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowSimulationModal(false)}
                className="px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800"
              >
                Close Simulator
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
