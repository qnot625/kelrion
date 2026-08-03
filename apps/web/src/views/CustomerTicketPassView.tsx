import React, { useState } from "react";
import { Ticket as TicketIcon, Clock, Users, BellRing, MapPin, XCircle, CheckCircle2, QrCode } from "lucide-react";
import { UserContext, Ticket } from "../types/queue";
import { PriorityBadge, TicketStatusBadge } from "../components/TicketBadge";
import { Alert } from "../components/Alert";

interface CustomerTicketPassViewProps {
  userContext: UserContext;
  currentTicket?: Ticket | null;
  onCancelTicket?: () => void;
}

export const CustomerTicketPassView: React.FC<CustomerTicketPassViewProps> = ({
  currentTicket,
  onCancelTicket,
}) => {
  const [isCancelled, setIsCancelled] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleCancelPass = () => {
    setIsCancelled(true);
    setNotice("Your queue ticket pass has been cancelled.");
    if (onCancelTicket) onCancelTicket();
  };

  const demoTicket: Ticket = currentTicket || {
    id: "tkt_live_customer",
    queueId: "queue_main",
    tenantId: "tenant-test-01",
    number: "A-108",
    sequence: 108,
    status: "waiting",
    priority: "STANDARD",
    customerName: "Alex Morgan",
    joinedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    estimatedWaitMinutes: 5,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <TicketIcon className="h-3 w-3" />
              Live Digital Pass
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            My Queue Ticket & Live Position Tracker
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time status updates, current position in queue, estimated arrival time, and branch directions.
          </p>
        </div>
      </div>

      {notice && <Alert type="info" message={notice} onDismiss={() => setNotice(null)} />}

      {!isCancelled ? (
        <div className="max-w-xl mx-auto space-y-6">
          {/* Main Mobile Ticket Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 space-y-6 relative overflow-hidden">
            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-indigo-600/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <span className="text-[10px] uppercase font-mono text-indigo-400 font-bold tracking-widest block">
                  KLERION DIGITAL PASS
                </span>
                <strong className="text-sm font-bold text-slate-100">Central Financial Hub</strong>
              </div>
              <TicketStatusBadge status={demoTicket.status} />
            </div>

            {/* Ticket Number */}
            <div className="text-center py-4 bg-slate-850/60 rounded-2xl border border-slate-800">
              <span className="text-xs uppercase text-slate-400 font-bold tracking-wider">Your Ticket Number</span>
              <div className="text-6xl font-black text-amber-400 font-mono tracking-tight mt-1 drop-shadow-md">
                #{demoTicket.number}
              </div>
              <div className="mt-2 inline-block">
                <PriorityBadge priority={demoTicket.priority} />
              </div>
            </div>

            {/* Position & Estimated Wait */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/50">
                <span className="text-[10px] uppercase text-slate-400 font-bold block">Ahead Of You</span>
                <div className="text-3xl font-black text-indigo-400 mt-1 flex items-center justify-center gap-1">
                  <Users className="h-5 w-5 text-indigo-400" /> 2
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">2 customers ahead</span>
              </div>

              <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/50">
                <span className="text-[10px] uppercase text-slate-400 font-bold block">Estimated Wait</span>
                <div className="text-3xl font-black text-emerald-400 mt-1 flex items-center justify-center gap-1">
                  <Clock className="h-5 w-5 text-emerald-400" /> ~{demoTicket.estimatedWaitMinutes}m
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">Estimated call: 14:45</span>
              </div>
            </div>

            {/* QR Verification Code */}
            <div className="flex items-center justify-between p-4 bg-slate-800/40 rounded-xl border border-slate-700/30 text-xs">
              <div className="flex items-center gap-3">
                <QrCode className="h-8 w-8 text-indigo-400" />
                <div>
                  <strong className="block text-slate-200">Kiosk Verification Code</strong>
                  <span className="text-[10px] font-mono text-slate-400">ID: {demoTicket.id}</span>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-2.5 py-1 rounded">SCAN AT COUNTER</span>
            </div>

            {/* Progress Timeline */}
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-slate-300 block">Queue Progress Timeline</span>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Ticket Issued at {new Date(demoTicket.joinedAt).toLocaleTimeString()}</span>
                </div>
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Clock className="h-4 w-4 animate-spin" />
                  <span>Waiting in Queue (Position #3)</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <BellRing className="h-4 w-4" />
                  <span>Counter Call & SMS Alert</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-indigo-400" /> Desk #3, Main Floor
              </span>

              <button
                onClick={handleCancelPass}
                className="px-3 py-1.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 rounded-xl font-semibold transition cursor-pointer flex items-center gap-1"
              >
                <XCircle className="h-3.5 w-3.5" /> Cancel Ticket
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm text-center space-y-4 max-w-md mx-auto">
          <XCircle className="h-10 w-10 text-slate-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Pass Cancelled</h2>
          <p className="text-xs text-slate-500">You do not have an active queue ticket. You can join a queue anytime.</p>
        </div>
      )}
    </div>
  );
};
