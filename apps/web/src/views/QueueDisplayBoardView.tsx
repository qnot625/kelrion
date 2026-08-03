import React, { useEffect, useState, useCallback, useRef } from "react";
import { Tv, Bell, Maximize2, Minimize2 } from "lucide-react";
import { Queue, QueueSnapshot, Ticket, UserContext } from "../types/queue";
import { fetchQueues, fetchQueueSnapshot } from "../api/client";
import { useQueueRealtimeStream } from "../hooks/useQueueRealtimeStream";
import { ConnectionBadge } from "../components/ConnectionBadge";

interface QueueDisplayBoardViewProps {
  userContext: UserContext;
  initialQueueId?: string;
}

export const QueueDisplayBoardView: React.FC<QueueDisplayBoardViewProps> = ({
  userContext,
  initialQueueId,
}) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>(initialQueueId || "");
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);

  const [lastCalledTicket, setLastCalledTicket] = useState<{
    number: string;
    counterId: string;
    timestamp: Date;
  } | null>(null);

  const [recentlyCalled, setRecentlyCalled] = useState<
    Array<{ id: string; number: string; counterId: string; timestamp: Date }>
  >([]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Audio chime synthesizer for TV callout
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "sine";

      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880, now + 0.15); // A5

      osc2.frequency.setValueAtTime(293.66, now);
      osc2.frequency.setValueAtTime(440, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.8);
      osc2.stop(now + 0.8);
    } catch {
      // Audio autoplay may be blocked
    }
  };

  const loadData = useCallback(async () => {
    try {
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
    } catch {
      // Background reload failure handled gracefully
    }
  }, [selectedQueueId, userContext]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Realtime Stream Call Handling
  const handleRealtimeEvent = useCallback((event: any) => {
    if (event.eventType === "queue.ticket_called.v1") {
      const payload = event.payload;
      const calledNum = payload.ticketNumber || payload.number || "001";
      const counterName = payload.counterId || "Counter 1";

      setLastCalledTicket({
        number: calledNum,
        counterId: counterName,
        timestamp: new Date(),
      });

      setRecentlyCalled((prev) => [
        {
          id: `${event.eventId}-${Date.now()}`,
          number: calledNum,
          counterId: counterName,
          timestamp: new Date(),
        },
        ...prev.slice(0, 4),
      ]);

      // Flash visual cue & chime
      setIsFlashing(true);
      playChime();
      setTimeout(() => setIsFlashing(false), 3000);
    }
  }, []);

  const { status: streamStatus, reconnect } = useQueueRealtimeStream({
    queueId: selectedQueueId || null,
    userContext,
    enabled: Boolean(selectedQueueId),
    onEvent: handleRealtimeEvent,
  });

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const selectedQueue = queues.find((q) => q.id === selectedQueueId);

  return (
    <div
      ref={containerRef}
      className={`space-y-6 ${
        isFullscreen ? "bg-slate-950 text-white p-8 fixed inset-0 z-50 overflow-auto" : ""
      }`}
    >
      {/* Top TV Bar */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600/30 text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
            <Tv className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest block">
              Public Display Board
            </span>
            <h1 className="text-xl font-black tracking-tight text-slate-100">
              {selectedQueue ? selectedQueue.name : "Queue Display"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedQueueId}
            onChange={(e) => setSelectedQueueId(e.target.value)}
            aria-label="Display Queue Selector"
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                [{q.code}] {q.name}
              </option>
            ))}
          </select>

          <ConnectionBadge status={streamStatus} onReconnect={reconnect} />

          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen TV Mode"}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Fullscreen TV Mode</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Called Ticket Hero Callout */}
      <div className="my-8 grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        {/* Hero Section: Currently Called Ticket */}
        <div
          className={`lg:col-span-2 p-10 rounded-3xl border transition-all duration-500 flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden ${
            isFlashing
              ? "bg-indigo-900/90 border-amber-400 ring-4 ring-amber-400/50 scale-[1.02]"
              : "bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 border-slate-800"
          }`}
        >
          {isFlashing && (
            <div className="absolute top-4 bg-amber-400 text-slate-950 font-black text-xs uppercase px-4 py-1 rounded-full animate-bounce flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5 fill-current" />
              NOW CALLING
            </div>
          )}

          <div className="text-xs sm:text-sm uppercase tracking-widest text-indigo-400 font-bold mb-2">
            Now Serving At Station
          </div>

          <div className="text-3xl sm:text-5xl font-black text-emerald-400 tracking-wide mb-6">
            {lastCalledTicket ? lastCalledTicket.counterId : "Counter 1"}
          </div>

          <div className="text-[8rem] sm:text-[11rem] leading-none font-black text-amber-400 tracking-tight my-2 drop-shadow-2xl">
            {lastCalledTicket ? `#${lastCalledTicket.number}` : "--"}
          </div>

          <div className="text-sm sm:text-base text-slate-400 font-medium mt-4">
            Please proceed immediately to your assigned counter station.
          </div>
        </div>

        {/* Recently Called Tickets Sidebar */}
        <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-4 mb-4 flex items-center justify-between">
              <span>Recently Called</span>
              <span className="text-xs text-slate-500 font-normal">Last 5</span>
            </h3>

            {recentlyCalled.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No recent calls logged.
              </div>
            ) : (
              <div className="space-y-3">
                {recentlyCalled.map((ticket, idx) => (
                  <div
                    key={ticket.id + idx}
                    className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs text-slate-500 font-semibold">
                        {ticket.counterId || "Counter"}
                      </div>
                      <div className="text-2xl font-black text-slate-100">
                        #{ticket.number}
                      </div>
                    </div>

                    <span className="text-xs text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/50 px-2.5 py-1 rounded-lg">
                      Called
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Queue Snapshot Footer Stats */}
          <div className="pt-6 border-t border-slate-800 grid grid-cols-2 gap-4 text-center mt-6">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">
                Waiting In Line
              </div>
              <div className="text-2xl font-black text-amber-400 mt-0.5">
                {snapshot?.waitingCount ?? 0}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">
                Est. Wait Range
              </div>
              <div className="text-sm font-extrabold text-slate-300 mt-1">
                {snapshot?.estimatedWaitRange || `${snapshot?.estimatedWaitMinutes ?? 0}m`}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
