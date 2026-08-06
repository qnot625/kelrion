import React from "react";
import {
  Play,
  CheckCircle,
  UserCheck,
  FileText,
  Cog,
  GitFork,
  GitMerge,
  Flag,
  Trash2,
  Copy,
  Zap,
} from "lucide-react";
import { CanvasStep } from "./types.js";
import { StepType } from "./types.js";

interface WorkflowNodeProps {
  step: CanvasStep;
  isStartStep: boolean;
  isSelected: boolean;
  isReadOnly?: boolean;
  onSelect: (stepId: string) => void;
  onDragStart: (e: React.MouseEvent, stepId: string) => void;
  onDelete?: (stepId: string) => void;
  onSetStartStep?: (stepId: string) => void;
  onStartConnection?: (stepId: string, e: React.MouseEvent) => void;
  onEndConnection?: (stepId: string) => void;
}

const STEP_TYPE_CONFIG: Record<
  StepType,
  { label: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  START: { label: "Start", bg: "bg-emerald-50 text-emerald-700", border: "border-emerald-300", icon: Play },
  END: { label: "End", bg: "bg-rose-50 text-rose-700", border: "border-rose-300", icon: Flag },
  AUTOMATIC_TASK: { label: "Script Task", bg: "bg-blue-50 text-blue-700", border: "border-blue-300", icon: Cog },
  MANUAL_TASK: { label: "Human Task", bg: "bg-amber-50 text-amber-700", border: "border-amber-300", icon: FileText },
  APPROVAL_TASK: { label: "Approval", bg: "bg-purple-50 text-purple-700", border: "border-purple-300", icon: UserCheck },
  PARALLEL_SPLIT: { label: "Parallel Split", bg: "bg-indigo-50 text-indigo-700", border: "border-indigo-300", icon: GitFork },
  PARALLEL_JOIN: { label: "Parallel Join", bg: "bg-cyan-50 text-cyan-700", border: "border-cyan-300", icon: GitMerge },
};

export const WorkflowNode: React.FC<WorkflowNodeProps> = ({
  step,
  isStartStep,
  isSelected,
  isReadOnly,
  onSelect,
  onDragStart,
  onDelete,
  onSetStartStep,
  onStartConnection,
  onEndConnection,
}) => {
  const config = STEP_TYPE_CONFIG[step.type] || {
    label: step.type,
    bg: "bg-slate-50 text-slate-700",
    border: "border-slate-300",
    icon: Zap,
  };
  const Icon = config.icon;

  return (
    <div
      id={`workflow-node-${step.id}`}
      style={{
        transform: `translate(${step.position.x}px, ${step.position.y}px)`,
        touchAction: "none",
      }}
      className={`absolute w-64 select-none rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md z-20"
          : "border-slate-200 z-10"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(step.id);
      }}
      onMouseUp={() => onEndConnection?.(step.id)}
    >
      {/* Node Header & Drag Bar */}
      <div
        className="flex items-center justify-between cursor-move pb-2 border-b border-slate-100"
        onMouseDown={(e) => onDragStart(e, step.id)}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <span className={`inline-flex p-1.5 rounded-lg border ${config.bg} ${config.border}`}>
            <Icon className="w-4 h-4" />
          </span>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
            {config.label}
          </span>
        </div>

        {/* Action icons */}
        {!isReadOnly && (
          <div className="flex items-center space-x-1">
            {!isStartStep && step.type !== "END" && onSetStartStep && (
              <button
                type="button"
                id={`btn-set-start-${step.id}`}
                title="Set as Start Step"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetStartStep(step.id);
                }}
                className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                id={`btn-delete-node-${step.id}`}
                title="Delete Step"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(step.id);
                }}
                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Node Content */}
      <div className="pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900 truncate">{step.name}</h4>
          {isStartStep && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase bg-emerald-100 text-emerald-800 rounded">
              Start
            </span>
          )}
        </div>
        {step.description && (
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{step.description}</p>
        )}

        {/* Task details summary */}
        {step.taskConfig?.assigneeId && (
          <div className="mt-2 text-[11px] text-slate-600 bg-slate-50 rounded px-2 py-1 flex items-center justify-between">
            <span className="text-slate-400">Assignee:</span>
            <span className="font-medium text-slate-700 truncate max-w-[120px]">
              {step.taskConfig.assigneeId}
            </span>
          </div>
        )}

        {step.transitions.length > 0 && (
          <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Transitions:</span>
            <span className="font-medium text-slate-600">{step.transitions.length} rule(s)</span>
          </div>
        )}
      </div>

      {/* Input Handle (Left) */}
      {step.type !== "START" && (
        <div
          title="Input connection handle"
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-slate-300 border-2 border-white shadow-sm hover:scale-125 hover:bg-blue-500 transition-all cursor-crosshair"
        />
      )}

      {/* Output Handle (Right) */}
      {step.type !== "END" && !isReadOnly && (
        <button
          type="button"
          title="Click or drag to connect next step"
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartConnection?.(step.id, e);
          }}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white shadow-sm hover:scale-125 hover:bg-blue-600 transition-all cursor-crosshair"
        />
      )}
    </div>
  );
};
