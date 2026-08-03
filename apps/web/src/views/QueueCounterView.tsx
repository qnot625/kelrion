import React, { useEffect, useState, useCallback } from "react";
import { Lock, Volume2, SkipForward, ArrowRightLeft, Check, Ticket as TicketIcon, Megaphone } from "lucide-react";
import { Queue, QueueSnapshot, Ticket, UserContext } from "../types/queue";
import {
  fetchQueues,
  fetchQueueSnapshot,
  callNextTicket,
  recallTicket,
  skipTicket,
  completeTicket,
  transferTicket,
} from "../api/client";
import { useQueueRealtimeStream } from "../hooks/useQueueRealtimeStream";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { TicketStatusBadge, PriorityBadge } from "../components/TicketBadge";
import { Alert } from "../components/Alert";
import { Modal } from "../components/Modal";

interface QueueCounterViewProps {
  userContext: UserContext;
  initialQueueId?: string;
}

export const QueueCounterView: React.FC<QueueCounterViewProps> = ({
  userContext,
  initialQueueId,
}) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>(initialQueueId || "");
  const [counterId, setCounterId] = useState<string>("Counter 1");
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [currentlyServing, setCurrentlyServing] = useState<Ticket | null>(null);

  const [, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [targetQueueId, setTargetQueueId] = useState<string>("");
  const [showSkipModal, setShowSkipModal] = useState(false);

  const isStaffOrOwner = userContext.role === "OWNER" || userContext.role === "STAFF";

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const queueList = await fetchQueues(userContext);
      setQueues(queueList);

      let activeId = selectedQueueId;
      if (!activeId && queueList.length > 0) {
        activeId = queueList[0].id;
        setSelectedQueueId(activeId);
      }

      if (activeId) {
        const snap = await fetchQueueSnapshot(activeId, userContext);
        setSnapshot(snap);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load counter data");
    } finally {
      setIsLoading(false);
    }
  }, [selectedQueueId, userContext]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime update handler
  const handleRealtimeEvent = useCallback(
    (_event: any) => {
      if (!selectedQueueId) return;
      fetchQueueSnapshot(selectedQueueId, userContext)
        .then((snap) => setSnapshot(snap))
        .catch(() => {});
    },
    [selectedQueueId, userContext]
  );

  const { status: streamStatus, reconnect } = useQueueRealtimeStream({
    queueId: selectedQueueId || null,
    userContext,
    enabled: Boolean(selectedQueueId),
    onEvent: handleRealtimeEvent,
  });

  const refreshSnapshot = async () => {
    if (!selectedQueueId) return;
    try {
      const snap = await fetchQueueSnapshot(selectedQueueId, userContext);
      setSnapshot(snap);
    } catch {
      // Ignore background refresh failure
    }
  };

  // 1. Call Next
  const handleCallNext = async () => {
    if (!selectedQueueId || !isStaffOrOwner) return;
    try {
      setIsActionLoading(true);
      setError(null);
      setSuccessMessage(null);

      const ticket = await callNextTicket(selectedQueueId, counterId, userContext);
      if (ticket) {
        setCurrentlyServing(ticket);
        setSuccessMessage(`Ticket #${ticket.number} called to ${counterId}`);
      } else {
        setCurrentlyServing(null);
        setSuccessMessage("No waiting tickets in the queue.");
      }
      await refreshSnapshot();
    } catch (err: any) {
      setError(err.message || "Failed to call next ticket");
    } finally {
      setIsActionLoading(false);
    }
  };

  // 2. Recall Ticket
  const handleRecall = async () => {
    if (!currentlyServing || !isStaffOrOwner) return;
    try {
      setIsActionLoading(true);
      setError(null);
      setSuccessMessage(null);

      const ticket = await recallTicket(currentlyServing.id, userContext);
      setCurrentlyServing(ticket);
      setSuccessMessage(`Recalled Ticket #${ticket.number}`);
      await refreshSnapshot();
    } catch (err: any) {
      setError(err.message || "Failed to recall ticket");
    } finally {
      setIsActionLoading(false);
    }
  };

  // 3. Skip Ticket
  const handleSkipConfirm = async () => {
    if (!currentlyServing || !isStaffOrOwner) return;
    try {
      setIsActionLoading(true);
      setError(null);
      setSuccessMessage(null);

      const ticket = await skipTicket(currentlyServing.id, userContext);
      setCurrentlyServing(null);
      setSuccessMessage(`Ticket #${ticket.number} marked as skipped.`);
      setShowSkipModal(false);
      await refreshSnapshot();
    } catch (err: any) {
      setError(err.message || "Failed to skip ticket");
    } finally {
      setIsActionLoading(false);
    }
  };

  // 4. Complete Ticket
  const handleComplete = async () => {
    if (!currentlyServing || !isStaffOrOwner) return;
    try {
      setIsActionLoading(true);
      setError(null);
      setSuccessMessage(null);

      const ticket = await completeTicket(currentlyServing.id, userContext);
      setCurrentlyServing(null);
      setSuccessMessage(`Ticket #${ticket.number} completed successfully.`);
      await refreshSnapshot();
    } catch (err: any) {
      setError(err.message || "Failed to complete ticket");
    } finally {
      setIsActionLoading(false);
    }
  };

  // 5. Transfer Ticket
  const handleTransferConfirm = async () => {
    if (!currentlyServing || !targetQueueId || !isStaffOrOwner) return;
    try {
      setIsActionLoading(true);
      setError(null);
      setSuccessMessage(null);

      const ticket = await transferTicket(currentlyServing.id, targetQueueId, userContext);
      const targetQueue = queues.find((q) => q.id === targetQueueId);
      setCurrentlyServing(null);
      setSuccessMessage(
        `Ticket #${ticket.number} transferred to ${targetQueue?.name || "target queue"}.`
      );
      setShowTransferModal(false);
      await refreshSnapshot();
    } catch (err: any) {
      setError(err.message || "Failed to transfer ticket");
    } finally {
      setIsActionLoading(false);
    }
  };

  if (!isStaffOrOwner) {
    return (
      <div className="p-8 bg-white rounded-xl border border-rose-200 shadow-sm max-w-2xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
          <Lock className="h-6 w-6 text-rose-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-600">
          Role <strong className="text-rose-600">{userContext.role}</strong> does not have permission to access the Counter Operational Workspace.
        </p>
        <p className="text-xs text-slate-400">
          Please switch role to <strong>STAFF</strong> or <strong>OWNER</strong> in the top header.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Staff Counter Workspace
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Perform ticket operations: Call Next, Recall, Skip, Complete, and Transfer.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Queue Selector */}
          <div>
            <label htmlFor="active-queue-select" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Active Queue
            </label>
            <select
              id="active-queue-select"
              value={selectedQueueId}
              onChange={(e) => {
                setSelectedQueueId(e.target.value);
                setCurrentlyServing(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  [{q.code}] {q.name}
                </option>
              ))}
            </select>
          </div>

          {/* Counter Selector */}
          <div>
            <label htmlFor="counter-station-select" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Counter / Station
            </label>
            <select
              id="counter-station-select"
              value={counterId}
              onChange={(e) => setCounterId(e.target.value)}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="Counter 1">Counter 1</option>
              <option value="Counter 2">Counter 2</option>
              <option value="Counter 3">Counter 3</option>
              <option value="Counter 4">Counter 4</option>
              <option value="Counter 5">Counter 5</option>
            </select>
          </div>

          <div className="pt-4 md:pt-0">
            <ConnectionBadge status={streamStatus} onReconnect={reconnect} />
          </div>
        </div>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}
      {successMessage && (
        <Alert
          type="success"
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Main Counter Serving Console */}
        <div className="lg:col-span-2 space-y-6">
          {/* Serving Ticket Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                  Station: {counterId}
                </span>
                <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  Currently Serving Ticket
                </h2>
              </div>

              {currentlyServing && (
                <TicketStatusBadge status={currentlyServing.status} />
              )}
            </div>

            {currentlyServing ? (
              <div className="p-6 bg-slate-900 text-white rounded-2xl shadow-inner space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Ticket Number</div>
                    <div className="text-5xl font-black text-amber-400 tracking-tight mt-1">
                      #{currentlyServing.number}
                    </div>
                  </div>

                  <div className="text-right">
                    <PriorityBadge priority={currentlyServing.priority} />
                    <div className="text-xs text-slate-400 mt-2">
                      Joined: {new Date(currentlyServing.joinedAt).toLocaleTimeString()}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t border-slate-800">
                  <div>
                    <span className="text-slate-400 block text-xs">Customer Name</span>
                    <strong className="text-slate-100 font-semibold">
                      {currentlyServing.customerName || "Walk-In Customer"}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs">Phone Number</span>
                    <strong className="text-slate-100 font-semibold">
                      {currentlyServing.customerPhone || "N/A"}
                    </strong>
                  </div>
                </div>

                {/* Counter Operational Control Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800">
                  <button
                    onClick={handleRecall}
                    disabled={isActionLoading}
                    aria-label="Recall Ticket"
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <Volume2 className="h-4 w-4" />
                    Recall
                  </button>

                  <button
                    onClick={() => setShowSkipModal(true)}
                    disabled={isActionLoading}
                    aria-label="Skip Ticket"
                    className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-100 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <SkipForward className="h-4 w-4" />
                    Skip
                  </button>

                  <button
                    onClick={() => {
                      const availableTargets = queues.filter((q) => q.id !== selectedQueueId);
                      if (availableTargets.length > 0) {
                        setTargetQueueId(availableTargets[0].id);
                      }
                      setShowTransferModal(true);
                    }}
                    disabled={isActionLoading}
                    aria-label="Transfer Ticket"
                    className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Transfer
                  </button>

                  <button
                    onClick={handleComplete}
                    disabled={isActionLoading}
                    aria-label="Complete Ticket"
                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <Check className="h-4 w-4" />
                    Complete
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-12 px-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-4">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                  <TicketIcon className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">No Active Ticket</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Click "Call Next" to invite the next waiting customer to {counterId}.
                  </p>
                </div>

                <button
                  onClick={handleCallNext}
                  disabled={isActionLoading || !selectedQueueId}
                  aria-label="Call Next Ticket"
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition shadow-md cursor-pointer inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <Megaphone className="h-4 w-4" />
                  Call Next Ticket
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Col: Queue Status & Waiting List */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Queue Live Metrics
            </h3>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="text-[10px] font-bold text-amber-700 uppercase">
                  Waiting
                </div>
                <div className="text-2xl font-black text-amber-800 mt-1">
                  {snapshot?.waitingCount ?? 0}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                <div className="text-[10px] font-bold text-emerald-700 uppercase">
                  Est. Wait
                </div>
                <div className="text-base font-extrabold text-emerald-800 mt-1">
                  {snapshot?.estimatedWaitRange || `${snapshot?.estimatedWaitMinutes ?? 0}m`}
                </div>
              </div>
            </div>

            <button
              onClick={handleCallNext}
              disabled={isActionLoading || !selectedQueueId || (snapshot?.waitingCount ?? 0) === 0}
              aria-label="Call Next Customer"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition shadow cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Megaphone className="h-4 w-4" />
              Call Next Customer
            </button>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      <Modal
        isOpen={showTransferModal}
        title="Transfer Ticket"
        onClose={() => setShowTransferModal(false)}
        onConfirm={handleTransferConfirm}
        confirmText="Transfer Ticket"
        isLoading={isActionLoading}
      >
        <div className="space-y-4">
          <p>Select target queue to transfer ticket #{currentlyServing?.number}:</p>
          <select
            aria-label="Target Queue"
            value={targetQueueId}
            onChange={(e) => setTargetQueueId(e.target.value)}
            className="w-full p-2.5 text-sm border border-slate-300 rounded-lg font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {queues
              .filter((q) => q.id !== selectedQueueId)
              .map((q) => (
                <option key={q.id} value={q.id}>
                  [{q.code}] {q.name}
                </option>
              ))}
          </select>
        </div>
      </Modal>

      {/* Skip Modal */}
      <Modal
        isOpen={showSkipModal}
        title="Skip Ticket"
        confirmVariant="warning"
        onClose={() => setShowSkipModal(false)}
        onConfirm={handleSkipConfirm}
        confirmText="Confirm Skip"
        isLoading={isActionLoading}
      >
        <p>
          Are you sure you want to mark ticket <strong>#{currentlyServing?.number}</strong> as skipped?
        </p>
      </Modal>
    </div>
  );
};
