import React, { useEffect, useState, useCallback } from "react";
import { Smartphone, Bell, Ticket as TicketIcon, X, Loader2 } from "lucide-react";
import { Queue, Ticket, QueueSnapshot, UserContext } from "../types/queue";
import { fetchQueues, fetchQueueSnapshot, checkInRemote } from "../api/client";
import { useQueueRealtimeStream } from "../hooks/useQueueRealtimeStream";
import { ConnectionBadge } from "../components/ConnectionBadge";
import { TicketStatusBadge, PriorityBadge } from "../components/TicketBadge";
import { Alert } from "../components/Alert";

interface RemoteCheckInViewProps {
  userContext: UserContext;
  onTicketGenerated?: (ticket: Ticket) => void;
}

export const RemoteCheckInView: React.FC<RemoteCheckInViewProps> = ({ userContext, onTicketGenerated }) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [priority, setPriority] = useState<string>("STANDARD");

  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calledAlert, setCalledAlert] = useState<string | null>(null);

  const loadQueues = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const queueList = await fetchQueues(userContext);
      setQueues(queueList);
      if (queueList.length > 0 && !selectedQueueId) {
        setSelectedQueueId(queueList[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load queues");
    } finally {
      setIsLoading(false);
    }
  }, [userContext, selectedQueueId]);

  useEffect(() => {
    loadQueues();
  }, [loadQueues]);

  // Realtime updates for the queue of the booked ticket
  const handleRealtimeEvent = useCallback(
    (event: any) => {
      const activeQueueId = activeTicket ? activeTicket.queueId : selectedQueueId;
      if (!activeQueueId) return;

      fetchQueueSnapshot(activeQueueId, userContext)
        .then((snap) => setSnapshot(snap))
        .catch(() => {});

      if (
        activeTicket &&
        event.eventType === "queue.ticket_called.v1" &&
        event.payload?.ticketId === activeTicket.id
      ) {
        const counterName = event.payload.counterId || "Counter Station";
        setActiveTicket((prev) => (prev ? { ...prev, status: "CALLED", counterId: counterName } : null));
        setCalledAlert(`Your ticket #${activeTicket.number} has been called to ${counterName}!`);
      }
    },
    [activeTicket, selectedQueueId, userContext]
  );

  const { status: streamStatus, reconnect } = useQueueRealtimeStream({
    queueId: activeTicket ? activeTicket.queueId : selectedQueueId || null,
    userContext,
    enabled: Boolean(activeTicket ? activeTicket.queueId : selectedQueueId),
    onEvent: handleRealtimeEvent,
  });

  const handleBookTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueId) return;

    try {
      setIsSubmitting(true);
      setError(null);
      setCalledAlert(null);

      const ticket = await checkInRemote(
        selectedQueueId,
        {
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          priority,
        },
        userContext
      );

      setActiveTicket(ticket);
      if (onTicketGenerated) {
        onTicketGenerated(ticket);
      }

      // Load snapshot for estimated wait
      const snap = await fetchQueueSnapshot(selectedQueueId, userContext);
      setSnapshot(snap);
    } catch (err: any) {
      setError(err.message || "Failed to book remote check-in ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTicket = () => {
    setActiveTicket(null);
    setCalledAlert(null);
  };

  const selectedQueue = queues.find((q) => q.id === (activeTicket ? activeTicket.queueId : selectedQueueId));

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
            Mobile Self Check-In
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-0.5">
            Remote Queue Pass
          </h2>
        </div>

        <ConnectionBadge status={streamStatus} onReconnect={reconnect} />
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}
      {calledAlert && (
        <Alert
          type="success"
          title="Ticket Called"
          message={calledAlert}
          onDismiss={() => setCalledAlert(null)}
        />
      )}

      {!activeTicket ? (
        /* Ticket Booking Form */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900">Join Branch Queue</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your details to receive an instant live digital queue ticket.
            </p>
          </div>

          <form onSubmit={handleBookTicket} className="space-y-4">
            {/* Queue Selector */}
            <div>
              <label htmlFor="service-queue-select-remote" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Select Service Queue
              </label>
              {isLoading ? (
                <div className="text-xs text-slate-400 py-2">Loading available queues...</div>
              ) : queues.length === 0 ? (
                <div className="text-xs text-rose-500 py-2">No active queues found.</div>
              ) : (
                <select
                  id="service-queue-select-remote"
                  value={selectedQueueId}
                  onChange={(e) => setSelectedQueueId(e.target.value)}
                  className="w-full p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      [{q.code}] {q.name} ({q.isPaused ? "Paused" : q.isActive ? "Active" : "Closed"})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Customer Name */}
            <div>
              <label htmlFor="customer-fullname-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Your Full Name
              </label>
              <input
                id="customer-fullname-input"
                type="text"
                placeholder="e.g. Jane Doe"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Customer Phone */}
            <div>
              <label htmlFor="customer-phone-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Mobile Phone (for SMS Updates)
              </label>
              <input
                id="customer-phone-input"
                type="tel"
                placeholder="+1 555-0199"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Priority Selection */}
            <div>
              <label htmlFor="ticket-priority-select" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Ticket Priority
              </label>
              <select
                id="ticket-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="STANDARD">Standard Service</option>
                <option value="VIP">VIP / Priority Access</option>
                <option value="EMERGENCY">Urgent / Emergency</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !selectedQueueId || selectedQueue?.isPaused}
              aria-label="Get Digital Ticket"
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4" />
              )}
              Get Digital Ticket
            </button>
          </form>
        </div>
      ) : (
        /* Active Digital Ticket Pass */
        <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl space-y-6 relative overflow-hidden">
          {/* Top Pass Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-widest block">
                Digital Queue Ticket
              </span>
              <h3 className="text-lg font-bold text-slate-100 mt-0.5">
                {selectedQueue?.name || "Branch Service"}
              </h3>
            </div>
            <TicketStatusBadge status={activeTicket.status} />
          </div>

          {/* Huge Number */}
          <div className="text-center py-4 bg-slate-950/80 rounded-2xl border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-semibold block mb-1">
              Your Number
            </span>
            <div className="text-6xl font-black text-amber-400 tracking-tight">
              #{activeTicket.number}
            </div>
            <div className="mt-2">
              <PriorityBadge priority={activeTicket.priority} />
            </div>
          </div>

          {/* Details & Wait Stats */}
          <div className="grid grid-cols-2 gap-4 text-center pt-2">
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Customers Ahead
              </span>
              <strong className="text-2xl font-black text-amber-400 mt-0.5 block">
                {snapshot?.waitingCount ?? 0}
              </strong>
            </div>

            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">
                Est. Wait Time
              </span>
              <strong className="text-lg font-black text-emerald-400 mt-1 block">
                {snapshot?.estimatedWaitRange || `${snapshot?.estimatedWaitMinutes ?? 0} mins`}
              </strong>
            </div>
          </div>

          {/* Customer info */}
          <div className="text-xs text-slate-400 space-y-1 border-t border-slate-800 pt-4">
            <div>
              Customer: <strong className="text-slate-200">{activeTicket.customerName || "Guest"}</strong>
            </div>
            <div>
              Joined At: <strong className="text-slate-200">{new Date(activeTicket.joinedAt).toLocaleTimeString()}</strong>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2">
            <button
              onClick={handleCancelTicket}
              aria-label="Exit Ticket View"
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <X className="h-4 w-4" />
              Exit Ticket View / Book Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
