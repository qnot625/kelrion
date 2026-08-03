import React, { useEffect, useState, useCallback } from "react";
import { Ticket as TicketIcon, RefreshCw, Printer, Check, User } from "lucide-react";
import { Queue, Ticket, UserContext } from "../types/queue";
import { fetchQueues, checkInWalkIn } from "../api/client";
import { Alert } from "../components/Alert";

interface WalkInKioskViewProps {
  userContext: UserContext;
}

export const WalkInKioskView: React.FC<WalkInKioskViewProps> = ({ userContext }) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [customerName, setCustomerName] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");

  const [printedTicket, setPrintedTicket] = useState<Ticket | null>(null);
  const [selectedQueue, setSelectedQueue] = useState<Queue | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoResetSeconds, setAutoResetSeconds] = useState<number>(10);

  const loadQueues = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const queueList = await fetchQueues(userContext);
      setQueues(queueList.filter((q) => q.isActive));
    } catch (err: any) {
      setError(err.message || "Failed to load kiosk queues");
    } finally {
      setIsLoading(false);
    }
  }, [userContext]);

  useEffect(() => {
    loadQueues();
  }, [loadQueues]);

  // Auto reset countdown after printing a ticket
  useEffect(() => {
    if (!printedTicket) return;

    const timer = setInterval(() => {
      setAutoResetSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPrintedTicket(null);
          setSelectedQueue(null);
          setCustomerName("");
          setCustomerPhone("");
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [printedTicket]);

  const handleIssueTicket = async (queueId: string) => {
    try {
      setIsIssuing(true);
      setError(null);

      const targetQueue = queues.find((q) => q.id === queueId);
      setSelectedQueue(targetQueue || null);

      const ticket = await checkInWalkIn(
        queueId,
        {
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
        },
        userContext
      );

      setPrintedTicket(ticket);
      setAutoResetSeconds(10);
    } catch (err: any) {
      setError(err.message || "Failed to print kiosk ticket");
    } finally {
      setIsIssuing(false);
    }
  };

  const handleManualReset = () => {
    setPrintedTicket(null);
    setSelectedQueue(null);
    setCustomerName("");
    setCustomerPhone("");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Kiosk Banner Bar */}
      <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow shrink-0">
            <TicketIcon className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white">
              Self-Service Walk-In Kiosk
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Touch a service button below to print your queue ticket instantly.
            </p>
          </div>
        </div>

        <button
          onClick={loadQueues}
          disabled={isLoading}
          aria-label="Refresh Services"
          className="px-4 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          {isLoading ? "Refreshing..." : "Refresh Services"}
        </button>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}

      {!printedTicket ? (
        /* Kiosk Touch Interface */
        <div className="space-y-6">
          {/* Optional Name Input */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-600" />
              Step 1: Enter Guest Info (Optional)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Guest Name (Optional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                aria-label="Guest Name"
                className="p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="tel"
                placeholder="Mobile Number (Optional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                aria-label="Mobile Number"
                className="p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Service Touch Tiles */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Step 2: Touch A Service To Issue Ticket
            </h3>

            {isLoading ? (
              <div className="py-12 text-center text-slate-400">Loading kiosk services...</div>
            ) : queues.length === 0 ? (
              <div className="py-12 text-center text-slate-500">No active queues available.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {queues.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => handleIssueTicket(q.id)}
                    disabled={isIssuing || q.isPaused || !q.isActive}
                    aria-label={`Print ticket for ${q.name}`}
                    className={`p-6 rounded-2xl border text-left transition transform active:scale-95 shadow-sm cursor-pointer flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      q.isPaused || !q.isActive
                        ? "bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed"
                        : "bg-gradient-to-br from-indigo-50 to-slate-50 border-indigo-200 hover:border-indigo-500 hover:shadow-md"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-black text-indigo-600 tracking-wider uppercase">
                        [{q.code}]
                      </span>
                      <h4 className="text-lg font-bold text-slate-900 mt-1">{q.name}</h4>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500 pt-3 border-t border-indigo-100">
                      <span>Prefix: <strong>{q.prefix}</strong></span>
                      <span className="px-3 py-1 bg-indigo-600 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5">
                        <Printer className="h-3.5 w-3.5" />
                        Print Ticket
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Printed Ticket Thermal Slip Display */
        <div className="bg-slate-950 p-8 rounded-3xl shadow-2xl space-y-6 flex flex-col items-center justify-center text-center">
          {/* Simulated Printed Paper Receipt */}
          <div className="bg-amber-50 text-slate-900 p-8 rounded-xl shadow-2xl border-t-8 border-indigo-600 max-w-sm w-full font-mono space-y-4 relative">
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
              *** KLERION BRANCH ***
            </div>

            <div className="border-b-2 border-dashed border-slate-300 pb-3">
              <h3 className="text-base font-bold uppercase">{selectedQueue?.name || "Service Ticket"}</h3>
              <div className="text-xs text-slate-500 mt-0.5">
                {new Date(printedTicket.joinedAt).toLocaleString()}
              </div>
            </div>

            {/* Ticket Number Callout */}
            <div className="py-4">
              <div className="text-[10px] text-slate-500 font-bold uppercase">Ticket Number</div>
              <div className="text-6xl font-black text-slate-950 tracking-tight my-1">
                #{printedTicket.number}
              </div>
              <div className="text-xs text-indigo-700 font-bold">
                Guest: {printedTicket.customerName || "Walk-In Guest"}
              </div>
            </div>

            <div className="border-t-2 border-b-2 border-dashed border-slate-300 py-3 text-xs space-y-1">
              <div>Status: <strong>{printedTicket.status}</strong></div>
              <div>Est. Wait: <strong>{printedTicket.estimatedWaitMinutes || 5} mins</strong></div>
            </div>

            <div className="text-[10px] text-slate-400 uppercase pt-2">
              Thank you for waiting. Please watch the TV display board.
            </div>
          </div>

          {/* Controls & Auto Reset Counter */}
          <div className="space-y-3 w-full max-w-sm">
            <div className="text-xs text-slate-400 font-medium">
              Screen will auto-reset in <strong className="text-amber-400">{autoResetSeconds}s</strong>
            </div>

            <button
              onClick={handleManualReset}
              aria-label="Done or Issue Next Ticket"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition shadow cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Check className="h-4 w-4" />
              Done / Issue Next Ticket
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
