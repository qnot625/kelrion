import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Users, Clock, CheckCircle2, UserCheck, Tv, MonitorPlay } from "lucide-react";
import { Queue, QueueSnapshot, UserContext } from "../types/queue";
import { fetchQueues, fetchQueueSnapshot } from "../api/client";
import { useQueueRealtimeStream } from "../hooks/useQueueRealtimeStream";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { QueueStatusBadge } from "../components/QueueStatusBadge";
import { Alert } from "../components/Alert";

interface QueueDashboardViewProps {
  userContext: UserContext;
  onSelectQueueForCounter?: (queueId: string) => void;
  onSelectQueueForDisplay?: (queueId: string) => void;
  onNavigateTab?: (tab: string) => void;
}

export const QueueDashboardView: React.FC<QueueDashboardViewProps> = ({
  userContext,
  onSelectQueueForCounter,
  onSelectQueueForDisplay,
  onNavigateTab,
}) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, QueueSnapshot>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const queueList = await fetchQueues(userContext);
      setQueues(queueList);

      if (queueList.length > 0 && !selectedQueueId) {
        setSelectedQueueId(queueList[0].id);
      }

      // Fetch snapshot for all queues
      const snapshotMap: Record<string, QueueSnapshot> = {};
      await Promise.all(
        queueList.map(async (q) => {
          try {
            const snap = await fetchQueueSnapshot(q.id, userContext);
            snapshotMap[q.id] = snap;
          } catch {
            // Fallback empty snapshot
            snapshotMap[q.id] = {
              queueId: q.id,
              code: q.code,
              name: q.name,
              prefix: q.prefix,
              isActive: q.isActive,
              isPaused: q.isPaused,
              currentSequence: q.currentSequence,
              waitingCount: 0,
              inServiceCount: 0,
              completedTodayCount: 0,
              estimatedWaitMinutes: 0,
              estimatedWaitRange: "0 mins",
              activeCounters: 1,
            };
          }
        })
      );
      setSnapshots(snapshotMap);
    } catch (err: any) {
      setError(err.message || "Failed to load queue dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [userContext]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime stream integration for selected queue
  const handleRealtimeEvent = useCallback(
    (_event: any) => {
      if (!selectedQueueId) return;

      // Automatically refresh queue snapshot when a ticket or queue state changes
      fetchQueueSnapshot(selectedQueueId, userContext)
        .then((updatedSnap) => {
          setSnapshots((prev) => ({
            ...prev,
            [selectedQueueId]: updatedSnap,
          }));
        })
        .catch(() => {});
    },
    [selectedQueueId, userContext]
  );

  const { status: streamStatus, reconnect } = useQueueRealtimeStream({
    queueId: selectedQueueId,
    userContext,
    enabled: Boolean(selectedQueueId),
    onEvent: handleRealtimeEvent,
  });

  const totalWaiting = Object.values(snapshots).reduce(
    (sum, s) => sum + (s.waitingCount || 0),
    0
  );
  const totalServing = Object.values(snapshots).reduce(
    (sum, s) => sum + (s.inServiceCount || 0),
    0
  );
  const totalCompleted = Object.values(snapshots).reduce(
    (sum, s) => sum + (s.completedTodayCount || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Live Queue Management Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time multi-queue monitoring, customer wait times, and queue health metrics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionBadge status={streamStatus} onReconnect={reconnect} />
          <button
            onClick={loadData}
            disabled={isLoading}
            aria-label="Refresh Dashboard"
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && <Alert message={error} onRetry={loadData} />}

      {/* Aggregate Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab("queues")}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between text-left transition hover:border-indigo-400 hover:shadow-md cursor-pointer group focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider group-hover:text-indigo-600 transition">
              Total Active Queues
            </div>
            <div className="text-3xl font-extrabold text-slate-900 mt-2">
              {queues.filter((q) => q.isActive).length}
            </div>
            <span className="text-[10px] text-indigo-600 font-bold mt-1 inline-block">Manage Queues &rarr;</span>
          </div>
          <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-700 transition">
            <Users className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab("branch")}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between text-left transition hover:border-amber-400 hover:shadow-md cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <div>
            <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
              Waiting Customers
            </div>
            <div className="text-3xl font-extrabold text-amber-600 mt-2">
              {totalWaiting}
            </div>
            <span className="text-[10px] text-amber-600 font-bold mt-1 inline-block">Branch Status &rarr;</span>
          </div>
          <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center group-hover:bg-amber-100 transition">
            <Clock className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab("queues")}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between text-left transition hover:border-emerald-400 hover:shadow-md cursor-pointer group focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <div>
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">
              Currently Serving
            </div>
            <div className="text-3xl font-extrabold text-emerald-600 mt-2">
              {totalServing}
            </div>
            <span className="text-[10px] text-emerald-600 font-bold mt-1 inline-block">View Counters &rarr;</span>
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center group-hover:bg-emerald-100 transition">
            <UserCheck className="h-5 w-5" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab && onNavigateTab("reports")}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between text-left transition hover:border-indigo-400 hover:shadow-md cursor-pointer group focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <div>
            <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
              Completed Today
            </div>
            <div className="text-3xl font-extrabold text-indigo-600 mt-2">
              {totalCompleted}
            </div>
            <span className="text-[10px] text-indigo-600 font-bold mt-1 inline-block">View Reports &rarr;</span>
          </div>
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center group-hover:bg-indigo-100 transition">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </button>
      </div>

      {/* Main Queue Cards Grid */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Active Branch Queues</h2>
          <span className="text-xs text-slate-500 font-medium">
            {queues.length} {queues.length === 1 ? "Queue" : "Queues"} Registered
          </span>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-slate-500">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-600" />
            <p className="text-sm font-medium">Loading active queues...</p>
          </div>
        ) : queues.length === 0 ? (
          <div className="py-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <p className="text-slate-600 font-medium">No queues available for this tenant.</p>
            <p className="text-xs text-slate-400 mt-1">
              Create a queue or verify tenant context header.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {queues.map((q) => {
              const snap = snapshots[q.id];
              const isSelected = selectedQueueId === q.id;

              return (
                <div
                  key={q.id}
                  onClick={() => setSelectedQueueId(q.id)}
                  className={`p-5 rounded-xl border transition cursor-pointer relative ${
                    isSelected
                      ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/10"
                      : "border-slate-200 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-indigo-600 tracking-wider">
                        [{q.code}]
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mt-0.5">
                        {q.name}
                      </h3>
                    </div>
                    <QueueStatusBadge isActive={q.isActive} isPaused={q.isPaused} />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 font-semibold">
                        Waiting
                      </div>
                      <div className="text-lg font-bold text-amber-600">
                        {snap?.waitingCount ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 font-semibold">
                        Serving
                      </div>
                      <div className="text-lg font-bold text-emerald-600">
                        {snap?.inServiceCount ?? 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-500 font-semibold">
                        Est Wait
                      </div>
                      <div className="text-sm font-bold text-slate-800">
                        {snap?.estimatedWaitRange || `${snap?.estimatedWaitMinutes ?? 0}m`}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">
                      Counters: <strong className="text-slate-800">{snap?.activeCounters ?? 1}</strong>
                    </span>

                    <div className="flex items-center gap-2">
                      {onSelectQueueForCounter && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectQueueForCounter(q.id);
                          }}
                          aria-label={`Open counter workspace for ${q.name}`}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold text-xs transition cursor-pointer flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <UserCheck className="h-3 w-3" />
                          <span>Counter Workspace</span>
                        </button>
                      )}
                      {onSelectQueueForDisplay && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectQueueForDisplay(q.id);
                          }}
                          aria-label={`Open TV display for ${q.name}`}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded font-semibold text-xs transition cursor-pointer flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        >
                          <Tv className="h-3 w-3" />
                          <span>TV Display</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
