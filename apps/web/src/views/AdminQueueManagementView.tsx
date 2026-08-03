import React, { useState, useEffect } from "react";
import { Plus, Search, Settings2, Pause, Play, Power, ListOrdered, CheckCircle, SlidersHorizontal } from "lucide-react";
import { Queue, UserContext } from "../types/queue";
import { fetchQueues } from "../api/client";
import { Alert } from "../components/Alert";
import { Modal } from "../components/Modal";

interface AdminQueueManagementViewProps {
  userContext: UserContext;
  onNavigateToStaff?: (queueId?: string) => void;
  onNavigateToDisplay?: (queueId?: string) => void;
}

export const AdminQueueManagementView: React.FC<AdminQueueManagementViewProps> = ({
  userContext,
  onNavigateToStaff,
  onNavigateToDisplay,
}) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [selectedQueueForConfig, setSelectedQueueForConfig] = useState<Queue | null>(null);

  // Form states
  const [newQueueName, setNewQueueName] = useState("");
  const [newQueueCode, setNewQueueCode] = useState("");
  const [newQueuePrefix, setNewQueuePrefix] = useState("");
  const [newServiceTime, setNewServiceTime] = useState("5");

  // Config form states
  const [slaMinutes, setSlaMinutes] = useState("15");
  const [vipPriorityBoost, setVipPriorityBoost] = useState(true);
  const [allocatedCounters, setAllocatedCounters] = useState("3");

  const loadQueues = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchQueues(userContext);
      setQueues(data);
    } catch (err: any) {
      setError(err.message || "Failed to load queues");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQueues();
  }, [userContext]);

  const handleCreateQueue = () => {
    if (!newQueueName.trim() || !newQueueCode.trim() || !newQueuePrefix.trim()) {
      setError("Please fill out all required queue fields.");
      return;
    }

    // TODO: Connect to POST /api/queues backend endpoint when available
    const createdQueue: Queue = {
      id: `queue_${Date.now()}`,
      tenantId: userContext.tenantId,
      branchId: "branch-main",
      code: newQueueCode.toUpperCase(),
      name: newQueueName.trim(),
      prefix: newQueuePrefix.toUpperCase(),
      isActive: true,
      isPaused: false,
      currentSequence: 0,
      avgServiceTimeMinutes: parseInt(newServiceTime) || 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setQueues((prev) => [...prev, createdQueue]);
    setSuccess(`Successfully created queue [${createdQueue.code}] ${createdQueue.name}`);
    setShowCreateModal(false);
    setNewQueueName("");
    setNewQueueCode("");
    setNewQueuePrefix("");
  };

  const handleTogglePause = (queueId: string) => {
    setQueues((prev) =>
      prev.map((q) => (q.id === queueId ? { ...q, isPaused: !q.isPaused } : q))
    );
    const target = queues.find((q) => q.id === queueId);
    setSuccess(
      `Queue [${target?.code}] ${target?.isPaused ? "resumed" : "paused"} in local state.`
    );
  };

  const handleToggleActive = (queueId: string) => {
    setQueues((prev) =>
      prev.map((q) => (q.id === queueId ? { ...q, isActive: !q.isActive } : q))
    );
    const target = queues.find((q) => q.id === queueId);
    setSuccess(
      `Queue [${target?.code}] ${target?.isActive ? "deactivated" : "activated"} in local state.`
    );
  };

  const handleSaveConfig = () => {
    if (selectedQueueForConfig) {
      setSuccess(
        `Configuration updated for [${selectedQueueForConfig.code}]: SLA threshold ${slaMinutes}m, ${allocatedCounters} counters allocated.`
      );
      setShowConfigModal(false);
    }
  };

  const filteredQueues = queues.filter((q) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "active" && q.isActive && !q.isPaused) ||
      (filter === "paused" && q.isPaused);
    const matchesSearch =
      q.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.code.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <ListOrdered className="h-3 w-3" />
              Queue Management
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Active Queue Configurations & Control
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create, pause, re-configure service parameters, and manage operational thresholds for branch queues.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Plus className="h-4 w-4" />
          <span>Create New Queue</span>
        </button>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}
      {success && <Alert type="success" message={success} onDismiss={() => setSuccess(null)} />}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search queue name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filter:
          </span>
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              filter === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({queues.length})
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              filter === "active" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Active ({queues.filter((q) => q.isActive && !q.isPaused).length})
          </button>
          <button
            onClick={() => setFilter("paused")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              filter === "paused" ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Paused ({queues.filter((q) => q.isPaused).length})
          </button>
        </div>
      </div>

      {/* Queue List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading queues...</div>
        ) : filteredQueues.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            No matching queues found. Create one to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Code & Prefix</th>
                  <th className="py-3 px-4">Queue Name</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Avg Service Time</th>
                  <th className="py-3 px-4">Current Sequence</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredQueues.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-indigo-600">[{q.code}]</span>
                      <span className="text-slate-400 text-[10px] ml-1.5 font-mono">({q.prefix}-100)</span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{q.name}</td>
                    <td className="py-3.5 px-4">
                      {!q.isActive ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          Inactive
                        </span>
                      ) : q.isPaused ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          Paused
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono">{q.avgServiceTimeMinutes || 5} mins</td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">#{q.currentSequence || 0}</td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleTogglePause(q.id)}
                        className={`p-1.5 rounded transition cursor-pointer ${
                          q.isPaused ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                        }`}
                        title={q.isPaused ? "Resume Queue" : "Pause Queue"}
                      >
                        {q.isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      </button>

                      <button
                        onClick={() => handleToggleActive(q.id)}
                        className={`p-1.5 rounded transition cursor-pointer ${
                          q.isActive ? "bg-rose-100 text-rose-700 hover:bg-rose-200" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                        }`}
                        title={q.isActive ? "Deactivate Queue" : "Activate Queue"}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          setSelectedQueueForConfig(q);
                          setShowConfigModal(true);
                        }}
                        className="p-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded transition cursor-pointer"
                        title="Configure Operational Settings"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                      </button>

                      {onNavigateToStaff && (
                        <button
                          onClick={() => onNavigateToStaff(q.id)}
                          className="px-2 py-1 bg-slate-800 text-white rounded text-[10px] font-semibold hover:bg-slate-900 transition cursor-pointer inline-flex items-center gap-1"
                        >
                          Counter
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Queue Modal */}
      <Modal
        isOpen={showCreateModal}
        title="Create New Branch Queue"
        onClose={() => setShowCreateModal(false)}
        onConfirm={handleCreateQueue}
        confirmText="Create Queue"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Queue Name *</label>
            <input
              type="text"
              placeholder="e.g. Teller & Cashier Desk"
              value={newQueueName}
              onChange={(e) => setNewQueueName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Queue Code *</label>
              <input
                type="text"
                placeholder="e.g. TELLER"
                value={newQueueCode}
                onChange={(e) => setNewQueueCode(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ticket Prefix *</label>
              <input
                type="text"
                placeholder="e.g. T"
                value={newQueuePrefix}
                onChange={(e) => setNewQueuePrefix(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Avg Service Time (mins)</label>
            <input
              type="number"
              value={newServiceTime}
              onChange={(e) => setNewServiceTime(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Modal>

      {/* Queue Configuration Modal */}
      <Modal
        isOpen={showConfigModal}
        title={`Queue Parameters: [${selectedQueueForConfig?.code}] ${selectedQueueForConfig?.name}`}
        onClose={() => setShowConfigModal(false)}
        onConfirm={handleSaveConfig}
        confirmText="Save Configuration"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">SLA Max Wait Alert Threshold (mins)</label>
            <input
              type="number"
              value={slaMinutes}
              onChange={(e) => setSlaMinutes(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Allocated Active Counters</label>
            <input
              type="number"
              value={allocatedCounters}
              onChange={(e) => setAllocatedCounters(e.target.value)}
              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="vip-priority-toggle"
              checked={vipPriorityBoost}
              onChange={(e) => setVipPriorityBoost(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="vip-priority-toggle" className="font-semibold text-slate-700">
              Enable VIP & Emergency Priority Ticket Jump
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
};
