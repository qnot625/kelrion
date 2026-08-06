import React, { useState, useEffect } from "react";
import {
  Layers,
  Plus,
  Search,
  Filter,
  GitBranch,
  Play,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  UserCheck,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import {
  WorkflowDefinitionJSON,
  WorkflowInstanceJSON,
  HumanTaskJSON,
  workflowsApi,
} from "./api.js";
import { WorkflowBuilder } from "./WorkflowBuilder.js";

export const WorkflowsManager: React.FC = () => {
  const [activeView, setActiveView] = useState<"DEFINITIONS" | "INSTANCES" | "TASKS" | "BUILDER">(
    "DEFINITIONS"
  );
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDefinitionJSON | undefined>(
    undefined
  );

  // Data states
  const [workflows, setWorkflows] = useState<WorkflowDefinitionJSON[]>([]);
  const [instances, setInstances] = useState<WorkflowInstanceJSON[]>([]);
  const [tasks, setTasks] = useState<HumanTaskJSON[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Load Workflows
  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const list = await workflowsApi.listWorkflows({
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        search: searchQuery || undefined,
      });
      setWorkflows(list);
    } catch (err) {
      console.error("Failed to load workflows:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load Tasks
  const loadTasks = async () => {
    try {
      const tList = await workflowsApi.listTasks();
      setTasks(tList);
    } catch (err) {
      console.error("Failed to load tasks:", err);
    }
  };

  useEffect(() => {
    if (activeView === "DEFINITIONS") loadWorkflows();
    if (activeView === "TASKS") loadTasks();
  }, [activeView, statusFilter]);

  // Handle Complete Task
  const handleCompleteTask = async (taskId: string, outcome: string) => {
    try {
      await workflowsApi.completeTask(taskId, {
        outcome,
        outputData: { completedAt: new Date().toISOString() },
      });
      loadTasks();
    } catch (err: any) {
      alert(`Failed to complete task: ${err.message}`);
    }
  };

  // Start instance helper
  const handleStartInstance = async (defId: string) => {
    try {
      const inst = await workflowsApi.createInstance({ workflowDefinitionId: defId });
      await workflowsApi.startInstance(inst.id);
      alert(`Workflow Instance '${inst.id}' started!`);
      setActiveView("TASKS");
      loadTasks();
    } catch (err: any) {
      alert(`Failed to start instance: ${err.message}`);
    }
  };

  if (activeView === "BUILDER") {
    return (
      <WorkflowBuilder
        initialWorkflow={editingWorkflow}
        onSave={() => {
          loadWorkflows();
        }}
        onBack={() => {
          setEditingWorkflow(undefined);
          setActiveView("DEFINITIONS");
          loadWorkflows();
        }}
      />
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <Layers className="w-6 h-6" />
              </span>
              <h1 className="text-xl font-bold text-slate-900">Workflow Platform</h1>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Design, publish, execute, and monitor automated business processes and human tasks.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              id="btn-create-new-workflow"
              onClick={() => {
                setEditingWorkflow(undefined);
                setActiveView("BUILDER");
              }}
              className="inline-flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workflow</span>
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex space-x-2">
            <button
              type="button"
              id="tab-view-definitions"
              onClick={() => setActiveView("DEFINITIONS")}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors ${
                activeView === "DEFINITIONS"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              Workflow Definitions
            </button>
            <button
              type="button"
              id="tab-view-tasks"
              onClick={() => setActiveView("TASKS")}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1.5 ${
                activeView === "TASKS"
                  ? "bg-slate-900 text-white shadow-2xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>Human Tasks</span>
              {tasks.length > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-extrabold bg-amber-400 text-slate-950 rounded-full">
                  {tasks.length}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (activeView === "DEFINITIONS") loadWorkflows();
              if (activeView === "TASKS") loadTasks();
            }}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* DEFINITIONS VIEW */}
        {activeView === "DEFINITIONS" && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadWorkflows()}
                  placeholder="Search workflows..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="DRAFT">Draft Only</option>
                  <option value="PUBLISHED">Published Only</option>
                  <option value="ARCHIVED">Archived Only</option>
                </select>
              </div>
            </div>

            {/* Workflow List Cards */}
            {loading ? (
              <div className="text-center py-12 text-xs text-slate-500">Loading workflows...</div>
            ) : workflows.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl">
                <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">No Workflow Definitions Found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Click 'Create Workflow' above to launch the Visual Workflow Builder and design your first process graph.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-extrabold rounded uppercase tracking-wider ${
                            wf.status === "PUBLISHED"
                              ? "bg-emerald-100 text-emerald-800"
                              : wf.status === "ARCHIVED"
                              ? "bg-slate-200 text-slate-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {wf.status} • v{wf.version}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {wf.steps?.length || 0} steps
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-slate-900 line-clamp-1">{wf.name}</h3>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        {wf.description || "No description provided."}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingWorkflow(wf);
                          setActiveView("BUILDER");
                        }}
                        className="text-xs font-bold text-blue-600 hover:text-blue-800"
                      >
                        Edit in Builder →
                      </button>

                      {wf.status === "PUBLISHED" && (
                        <button
                          type="button"
                          onClick={() => handleStartInstance(wf.id)}
                          className="px-2.5 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg flex items-center space-x-1"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start Instance</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TASKS VIEW */}
        {activeView === "TASKS" && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Pending Human Tasks Inbox</h2>

            {tasks.length === 0 ? (
              <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl">
                <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">No Pending Tasks</h3>
                <p className="text-xs text-slate-500 mt-1">
                  All assigned workflow tasks are completed!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded">
                          {task.status}
                        </span>
                        <span className="text-xs font-semibold text-slate-500">
                          Priority: {task.priority}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">{task.name}</h4>
                      <p className="text-xs text-slate-500">
                        Instance ID: <code className="text-slate-800 font-mono">{task.workflowInstanceId}</code>
                      </p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCompleteTask(task.id, "REJECTED")}
                        className="px-3 py-1.5 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCompleteTask(task.id, "APPROVED")}
                        className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl shadow-2xs"
                      >
                        Approve & Complete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
