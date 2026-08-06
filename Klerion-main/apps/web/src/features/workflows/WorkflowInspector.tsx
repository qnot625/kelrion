import React from "react";
import {
  Layers,
  Settings,
  GitBranch,
  Play,
  CheckCircle,
  FileText,
  UserCheck,
  AlertCircle,
  X,
  Info,
} from "lucide-react";
import { CanvasStep, SelectionState } from "./types.js";
import { WorkflowDefinitionJSON, WorkflowStepJSON, TransitionRuleJSON } from "./api.js";
import { TransitionEditor } from "./TransitionEditor.js";
import { HumanTaskEditor } from "./HumanTaskEditor.js";

interface WorkflowInspectorProps {
  workflow: Partial<WorkflowDefinitionJSON>;
  steps: CanvasStep[];
  selection: SelectionState;
  isReadOnly?: boolean;
  onUpdateWorkflowDetails: (name: string, description: string) => void;
  onUpdateStep: (stepId: string, updatedStep: Partial<WorkflowStepJSON>) => void;
  onUpdateTransitions: (stepId: string, transitions: TransitionRuleJSON[]) => void;
  onSetStartStep: (stepId: string) => void;
  onClose: () => void;
}

export const WorkflowInspector: React.FC<WorkflowInspectorProps> = ({
  workflow,
  steps,
  selection,
  isReadOnly,
  onUpdateWorkflowDetails,
  onUpdateStep,
  onUpdateTransitions,
  onSetStartStep,
  onClose,
}) => {
  // Determine selected step or transition
  const selectedStep =
    selection.type === "STEP"
      ? steps.find((s) => s.id === selection.stepId)
      : null;

  const selectedTransitionStep =
    selection.type === "TRANSITION"
      ? steps.find((s) => s.id === selection.sourceStepId)
      : null;

  const selectedRule =
    selection.type === "TRANSITION" && selectedTransitionStep
      ? selectedTransitionStep.transitions.find((r) => r.id === selection.ruleId)
      : null;

  return (
    <aside className="w-80 border-l border-slate-200 bg-white flex flex-col h-full shrink-0 shadow-xs z-20">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <div className="flex items-center space-x-2">
          {selection.type === "STEP" ? (
            <Layers className="w-4 h-4 text-blue-600" />
          ) : selection.type === "TRANSITION" ? (
            <GitBranch className="w-4 h-4 text-amber-600" />
          ) : (
            <Settings className="w-4 h-4 text-slate-600" />
          )}
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {selection.type === "STEP"
              ? "Step Properties"
              : selection.type === "TRANSITION"
              ? "Transition Properties"
              : "Workflow Settings"}
          </h3>
        </div>
        <button
          type="button"
          id="btn-close-inspector"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* CASE 1: STEP SELECTED */}
        {selection.type === "STEP" && selectedStep && (
          <div className="space-y-4">
            {/* Step ID & Type */}
            <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200">
              <span>ID: <code className="font-semibold text-slate-800">{selectedStep.id}</code></span>
              <span className="px-1.5 py-0.5 font-bold uppercase text-[10px] bg-blue-100 text-blue-800 rounded">
                {selectedStep.type}
              </span>
            </div>

            {/* Step Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Step Name
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={selectedStep.name}
                onChange={(e) =>
                  onUpdateStep(selectedStep.id, { name: e.target.value })
                }
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                disabled={isReadOnly}
                value={selectedStep.description || ""}
                onChange={(e) =>
                  onUpdateStep(selectedStep.id, { description: e.target.value })
                }
                placeholder="Step description or business context"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Start step toggle */}
            {selectedStep.type !== "END" && (
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-xs font-medium text-slate-700">Set as Start Step</span>
                {workflow.startStepId === selectedStep.id ? (
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Current Start
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => onSetStartStep(selectedStep.id)}
                    className="px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    Make Start
                  </button>
                )}
              </div>
            )}

            {/* Human Task Config (if MANUAL_TASK or APPROVAL_TASK) */}
            {(selectedStep.type === "MANUAL_TASK" || selectedStep.type === "APPROVAL_TASK") && (
              <HumanTaskEditor
                taskConfig={selectedStep.taskConfig}
                onUpdateConfig={(cfg) =>
                  onUpdateStep(selectedStep.id, { taskConfig: cfg })
                }
              />
            )}

            {/* Transitions Editor */}
            {selectedStep.type !== "END" && (
              <div className="pt-2 border-t border-slate-200">
                <TransitionEditor
                  sourceStep={selectedStep}
                  allSteps={steps}
                  onUpdateTransitions={(t) => onUpdateTransitions(selectedStep.id, t)}
                />
              </div>
            )}
          </div>
        )}

        {/* CASE 2: TRANSITION SELECTED */}
        {selection.type === "TRANSITION" && selectedTransitionStep && selectedRule && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-xs font-bold text-amber-800 block">
                Transition Rule
              </span>
              <p className="text-xs text-amber-700 mt-0.5">
                From <b>{selectedTransitionStep.name}</b> to step ID <b>{selectedRule.targetStepId}</b>
              </p>
            </div>

            <TransitionEditor
              sourceStep={selectedTransitionStep}
              allSteps={steps}
              onUpdateTransitions={(t) => onUpdateTransitions(selectedTransitionStep.id, t)}
            />
          </div>
        )}

        {/* CASE 3: NO SELECTION / WORKFLOW DEFINITION LEVEL */}
        {(selection.type === "NONE" || selection.type === "WORKFLOW" || (!selectedStep && !selectedRule)) && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Workflow Title
              </label>
              <input
                type="text"
                disabled={isReadOnly}
                value={workflow.name || ""}
                onChange={(e) =>
                  onUpdateWorkflowDetails(e.target.value, workflow.description || "")
                }
                placeholder="Workflow Name"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                disabled={isReadOnly}
                value={workflow.description || ""}
                onChange={(e) =>
                  onUpdateWorkflowDetails(workflow.name || "", e.target.value)
                }
                placeholder="High-level description of this workflow process..."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Version:</span>
                <span className="font-bold text-slate-800">v{workflow.version || 1}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Status:</span>
                <span
                  className={`font-bold px-2 py-0.5 text-[10px] rounded uppercase ${
                    workflow.status === "PUBLISHED"
                      ? "bg-emerald-100 text-emerald-800"
                      : workflow.status === "ARCHIVED"
                      ? "bg-slate-200 text-slate-700"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {workflow.status || "DRAFT"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Total Steps:</span>
                <span className="font-bold text-slate-800">{steps.length}</span>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start space-x-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                Click any step on the canvas to inspect and edit its properties, transitions, and human task settings.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
