import React, { useState } from "react";
import {
  BarChart3,
  ListOrdered,
  FileText,
  FileCode,
  LineChart,
  Settings,
  Building2,
  PieChart,
  Network,
} from "lucide-react";
import { UserContext } from "../types/queue";
import { QueueDashboardView } from "../views/QueueDashboardView";
import { NotificationLogsView } from "../views/NotificationLogsView";
import { NotificationTemplatesView } from "../views/NotificationTemplatesView";
import { AdminQueueManagementView } from "../views/AdminQueueManagementView";
import { AdminQueueAnalyticsView } from "../views/AdminQueueAnalyticsView";
import { AdminQueueReportsView } from "../views/AdminQueueReportsView";
import { AdminBranchStatusView } from "../views/AdminBranchStatusView";

interface AdminLayoutProps {
  userContext: UserContext;
  onNavigateToStaff?: (queueId?: string) => void;
  onNavigateToDisplay?: (queueId?: string) => void;
}

export type AdminTab =
  | "dashboard"
  | "queues"
  | "branch"
  | "notifications"
  | "templates"
  | "analytics"
  | "reports"
  | "settings";

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  userContext,
  onNavigateToStaff,
  onNavigateToDisplay,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [, setSelectedQueueId] = useState<string | undefined>(undefined);

  return (
    <div className="space-y-6">
      {/* Admin Portal Header & Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded">
              <Building2 className="h-3 w-3" />
              Admin Portal
            </span>
            <span className="text-xs text-slate-400 font-mono">Tenant: {userContext.tenantId}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
            System & Branch Administration
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage active branch queues, monitor notification logs, configure templates, and inspect telemetry.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab("dashboard")}
            aria-label="Dashboard"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "dashboard"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab("queues")}
            aria-label="Queues"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "queues"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            <span>Queue Management</span>
          </button>

          <button
            onClick={() => setActiveTab("branch")}
            aria-label="Branch Status"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "branch"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Network className="h-3.5 w-3.5" />
            <span>Branch Status</span>
          </button>

          <button
            onClick={() => setActiveTab("notifications")}
            aria-label="Notification Logs"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "notifications"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Logs</span>
          </button>

          <button
            onClick={() => setActiveTab("templates")}
            aria-label="Templates"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "templates"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>Templates</span>
          </button>

          <button
            onClick={() => setActiveTab("analytics")}
            aria-label="Analytics"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "analytics"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <PieChart className="h-3.5 w-3.5" />
            <span>Analytics</span>
          </button>

          <button
            onClick={() => setActiveTab("reports")}
            aria-label="Reports"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "reports"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <LineChart className="h-3.5 w-3.5" />
            <span>Reports</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            aria-label="Settings"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "settings"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* View Content */}
      {activeTab === "dashboard" && (
        <QueueDashboardView
          userContext={userContext}
          onNavigateTab={(tab) => setActiveTab(tab as AdminTab)}
          onSelectQueueForCounter={(qId) => {
            setSelectedQueueId(qId);
            if (onNavigateToStaff) onNavigateToStaff(qId);
          }}
          onSelectQueueForDisplay={(qId) => {
            setSelectedQueueId(qId);
            if (onNavigateToDisplay) onNavigateToDisplay(qId);
          }}
        />
      )}

      {activeTab === "queues" && (
        <AdminQueueManagementView
          userContext={userContext}
          onNavigateToStaff={onNavigateToStaff}
          onNavigateToDisplay={onNavigateToDisplay}
        />
      )}

      {activeTab === "branch" && (
        <AdminBranchStatusView userContext={userContext} />
      )}

      {activeTab === "notifications" && (
        <NotificationLogsView userContext={userContext} />
      )}

      {activeTab === "templates" && (
        <NotificationTemplatesView />
      )}

      {activeTab === "analytics" && (
        <AdminQueueAnalyticsView userContext={userContext} />
      )}

      {activeTab === "reports" && (
        <AdminQueueReportsView userContext={userContext} />
      )}

      {activeTab === "settings" && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
          <h2 className="text-xl font-bold text-slate-900">System & Tenant Configuration</h2>
          <div className="space-y-4 max-w-xl">
            <div>
              <label htmlFor="active-tenant-id" className="block text-xs font-semibold text-slate-600 mb-1">Active Tenant ID</label>
              <input
                id="active-tenant-id"
                type="text"
                readOnly
                value={userContext.tenantId}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="owner-user-id" className="block text-xs font-semibold text-slate-600 mb-1">Owner User ID</label>
              <input
                id="owner-user-id"
                type="text"
                readOnly
                value={userContext.userId}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="realtime-stream-url" className="block text-xs font-semibold text-slate-600 mb-1">Realtime Event Stream URL</label>
              <input
                id="realtime-stream-url"
                type="text"
                readOnly
                value={`/api/realtime/stream?tenantId=${userContext.tenantId}`}
                className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded-lg text-sm font-mono text-slate-800 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
