import React, { useState, useEffect } from "react";
import { FileText, ShieldCheck, Layers, Activity, HelpCircle, ShieldAlert } from "lucide-react";
import { FormsManager } from "./features/forms/index.js";
import { WorkflowsManager } from "./features/workflows/index.js";
import { ApprovalInbox } from "./features/approvals/index.js";
import { ServicePortal } from "./features/requests/ServicePortal.js";
import { AgentWorkspace } from "./features/service-desk/AgentWorkspace.js";

export default function App() {
  const [apiStatus, setApiStatus] = useState<string>("Checking...");
  const [activeTab, setActiveTab] = useState<"requests" | "agent_workspace" | "approvals" | "workflows" | "forms">("requests");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setApiStatus(data.status || "Healthy"))
      .catch(() => setApiStatus("Online (In-Memory Engine)"));
  }, []);

  return (
    <div id="klerion-app-container" className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header id="klerion-header" className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
            K
          </div>
          <div>
            <h1 id="app-title" className="text-lg font-semibold tracking-tight text-white">
              Klerion AdminOps OS
            </h1>
            <p className="text-xs text-slate-400">Enterprise Multi-Tenant Platform Engine</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/50">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            API Engine: {apiStatus}
          </span>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main id="klerion-main-workspace" className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 space-y-8">
        {/* Metric Cards */}
        <div id="metrics-grid" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          <div
            id="metric-requests"
            onClick={() => setActiveTab("requests")}
            className={`p-4 rounded-xl border space-y-1.5 cursor-pointer transition-all ${
              activeTab === "requests" ? "bg-indigo-950/50 border-indigo-500" : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800"
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Employee Portal</span>
              <HelpCircle className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-xl font-bold text-white">Service Desk</div>
            <div className="text-xs text-indigo-400 font-medium">Phase 4.2 Live</div>
          </div>

          <div
            id="metric-agent"
            onClick={() => setActiveTab("agent_workspace")}
            className={`p-4 rounded-xl border space-y-1.5 cursor-pointer transition-all ${
              activeTab === "agent_workspace" ? "bg-purple-950/50 border-purple-500" : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800"
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Agent Workspace</span>
              <ShieldAlert className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white">Queue & SLA</div>
            <div className="text-xs text-purple-400 font-medium">Phase 4.2 Live</div>
          </div>

          <div
            id="metric-approvals"
            onClick={() => setActiveTab("approvals")}
            className={`p-4 rounded-xl border space-y-1.5 cursor-pointer transition-all ${
              activeTab === "approvals" ? "bg-emerald-950/50 border-emerald-500" : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800"
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Approval Engine</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white">Unified Inbox</div>
            <div className="text-xs text-emerald-400 font-medium">Phase 3 Live</div>
          </div>

          <div
            id="metric-workflows"
            onClick={() => setActiveTab("workflows")}
            className={`p-4 rounded-xl border space-y-1.5 cursor-pointer transition-all ${
              activeTab === "workflows" ? "bg-amber-950/50 border-amber-500" : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800"
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Workflow DAGs</span>
              <Layers className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white">DAG Builder</div>
            <div className="text-xs text-slate-400">Phase 2 Live</div>
          </div>

          <div
            id="metric-forms"
            onClick={() => setActiveTab("forms")}
            className={`p-4 rounded-xl border space-y-1.5 cursor-pointer transition-all ${
              activeTab === "forms" ? "bg-blue-950/50 border-blue-500" : "bg-slate-800/60 border-slate-700/60 hover:bg-slate-800"
            }`}
          >
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
              <span>Form Engine</span>
              <FileText className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold text-white">Schema Studio</div>
            <div className="text-xs text-slate-400">Phase 1 Live</div>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 overflow-x-auto">
          <button
            id="nav-tab-requests"
            onClick={() => setActiveTab("requests")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === "requests"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <HelpCircle className="w-4 h-4" /> Employee Service Portal
          </button>
          <button
            id="nav-tab-agent"
            onClick={() => setActiveTab("agent_workspace")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === "agent_workspace"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <ShieldAlert className="w-4 h-4" /> Agent Service Desk
          </button>
          <button
            id="nav-tab-approvals"
            onClick={() => setActiveTab("approvals")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === "approvals"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <ShieldCheck className="w-4 h-4" /> Approval Inbox
          </button>
          <button
            id="nav-tab-workflows"
            onClick={() => setActiveTab("workflows")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === "workflows"
                ? "bg-amber-600 text-white shadow-md shadow-amber-600/30"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <Layers className="w-4 h-4" /> Workflow Builder
          </button>
          <button
            id="nav-tab-forms"
            onClick={() => setActiveTab("forms")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === "forms"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            <FileText className="w-4 h-4" /> Form Engine
          </button>
        </div>

        {/* Tab Content Rendering */}
        {activeTab === "requests" && <ServicePortal />}
        {activeTab === "agent_workspace" && <AgentWorkspace />}
        {activeTab === "approvals" && <ApprovalInbox />}
        {activeTab === "workflows" && <WorkflowsManager />}
        {activeTab === "forms" && <FormsManager />}
      </main>

      {/* Footer */}
      <footer id="klerion-footer" className="border-t border-slate-800 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        Klerion AdminOps OS &bull; Developer 5 Platform Slice &bull; Multi-Tenant Isolated Context
      </footer>
    </div>
  );
}

