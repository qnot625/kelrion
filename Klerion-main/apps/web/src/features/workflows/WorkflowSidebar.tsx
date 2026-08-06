import React, { useState } from "react";
import {
  Play,
  Flag,
  Cog,
  FileText,
  UserCheck,
  GitFork,
  GitMerge,
  Plus,
  Zap,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Clock,
  Globe,
} from "lucide-react";
import { StepType } from "./types.js";
import { TriggerJSON } from "./api.js";

interface WorkflowSidebarProps {
  triggers: TriggerJSON[];
  onAddStep: (type: StepType) => void;
  onAddTrigger: (type: TriggerJSON["type"]) => void;
  onRemoveTrigger: (id: string) => void;
  onApplyTemplate?: (templateName: string) => void;
}

const PALETTE_ITEMS: {
  type: StepType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  {
    type: "START",
    title: "Start Event",
    description: "Workflow execution entry point",
    icon: Play,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400",
  },
  {
    type: "APPROVAL_TASK",
    title: "Approval Task",
    description: "Requires decision from designated user/role",
    icon: UserCheck,
    color: "bg-purple-50 text-purple-700 border-purple-200 hover:border-purple-400",
  },
  {
    type: "MANUAL_TASK",
    title: "Human Form Task",
    description: "Requires user form filling or action",
    icon: FileText,
    color: "bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400",
  },
  {
    type: "AUTOMATIC_TASK",
    title: "Automatic Task",
    description: "Executes automated script or system logic",
    icon: Cog,
    color: "bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-400",
  },
  {
    type: "PARALLEL_SPLIT",
    title: "Parallel Split",
    description: "Forks execution into parallel branches",
    icon: GitFork,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-400",
  },
  {
    type: "PARALLEL_JOIN",
    title: "Parallel Join",
    description: "Synchronizes multiple incoming branches",
    icon: GitMerge,
    color: "bg-cyan-50 text-cyan-700 border-cyan-200 hover:border-cyan-400",
  },
  {
    type: "END",
    title: "End Event",
    description: "Terminal state completing the workflow",
    icon: Flag,
    color: "bg-rose-50 text-rose-700 border-rose-200 hover:border-rose-400",
  },
];

export const WorkflowSidebar: React.FC<WorkflowSidebarProps> = ({
  triggers,
  onAddStep,
  onAddTrigger,
  onRemoveTrigger,
  onApplyTemplate,
}) => {
  const [activeTab, setActiveTab] = useState<"STEPS" | "TRIGGERS" | "TEMPLATES">("STEPS");

  return (
    <aside className="w-72 border-r border-slate-200 bg-white flex flex-col h-full shrink-0">
      {/* Sidebar Navigation Header */}
      <div className="flex border-b border-slate-200 p-1.5 bg-slate-50">
        <button
          type="button"
          id="btn-sidebar-steps-tab"
          onClick={() => setActiveTab("STEPS")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
            activeTab === "STEPS"
              ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Steps</span>
        </button>
        <button
          type="button"
          id="btn-sidebar-triggers-tab"
          onClick={() => setActiveTab("TRIGGERS")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
            activeTab === "TRIGGERS"
              ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Triggers</span>
        </button>
        <button
          type="button"
          id="btn-sidebar-templates-tab"
          onClick={() => setActiveTab("TEMPLATES")}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center space-x-1 ${
            activeTab === "TEMPLATES"
              ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Presets</span>
        </button>
      </div>

      {/* Sidebar Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "STEPS" && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Step Palette
            </h3>
            <div className="space-y-2">
              {PALETTE_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    id={`btn-add-step-${item.type.toLowerCase()}`}
                    onClick={() => onAddStep(item.type)}
                    className={`w-full text-left p-3 rounded-xl border transition-all flex items-start space-x-3 group hover:shadow-2xs ${item.color}`}
                  >
                    <span className="p-1.5 rounded-lg bg-white/80 shadow-2xs mt-0.5">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600">
                          {item.title}
                        </span>
                        <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "TRIGGERS" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Workflow Triggers
              </h3>
            </div>

            {/* Configured triggers */}
            <div className="space-y-2">
              {triggers.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
                  <Zap className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                  <p className="text-xs text-slate-500">No triggers configured</p>
                </div>
              ) : (
                triggers.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      {t.type === "API_CALL" && <Globe className="w-4 h-4 text-blue-500" />}
                      {t.type === "CRON_SCHEDULE" && <Clock className="w-4 h-4 text-amber-500" />}
                      {t.type === "FORM_SUBMISSION" && <FileText className="w-4 h-4 text-purple-500" />}
                      <span className="text-xs font-semibold text-slate-800">{t.type}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveTrigger(t.id)}
                      className="text-xs text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-xs font-medium text-slate-600 block mb-2">Add New Trigger:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onAddTrigger("API_CALL")}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-center"
                >
                  API Call
                </button>
                <button
                  type="button"
                  onClick={() => onAddTrigger("FORM_SUBMISSION")}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-center"
                >
                  Form Submit
                </button>
                <button
                  type="button"
                  onClick={() => onAddTrigger("CRON_SCHEDULE")}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-center"
                >
                  Cron Schedule
                </button>
                <button
                  type="button"
                  onClick={() => onAddTrigger("EVENT_BUS")}
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-center"
                >
                  Event Bus
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "TEMPLATES" && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Quick Workflow Presets
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onApplyTemplate?.("PURCHASE_APPROVAL")}
                className="w-full text-left p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-2xs transition-all"
              >
                <h4 className="text-xs font-bold text-slate-900">Purchase Request Approval</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Start → Manager Approval → Payment Script → End
                </p>
              </button>
              <button
                type="button"
                onClick={() => onApplyTemplate?.("PARALLEL_REVIEW")}
                className="w-full text-left p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-2xs transition-all"
              >
                <h4 className="text-xs font-bold text-slate-900">Parallel Dual Review</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Start → Split → Legal & Finance Reviews → Join → End
                </p>
              </button>
              <button
                type="button"
                onClick={() => onApplyTemplate?.("SERVICE_DESK_ESCALATION")}
                className="w-full text-left p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-2xs transition-all"
              >
                <h4 className="text-xs font-bold text-slate-900">Service Desk Escalation</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Start → Tier 1 Triage → SLA Condition → Tier 2 Escalation → End
                </p>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
