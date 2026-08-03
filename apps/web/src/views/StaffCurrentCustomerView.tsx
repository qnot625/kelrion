import React, { useState, useEffect } from "react";
import { UserCheck, Clock, FileText, Check, Volume2, SkipForward, ArrowRightLeft, User, Phone, Megaphone } from "lucide-react";
import { UserContext, Ticket } from "../types/queue";
import { PriorityBadge, TicketStatusBadge } from "../components/TicketBadge";
import { Alert } from "../components/Alert";

interface StaffCurrentCustomerViewProps {
  userContext: UserContext;
  currentTicket?: Ticket | null;
  onCallNext?: () => void;
  onRecall?: () => void;
  onSkip?: () => void;
  onComplete?: () => void;
  onTransfer?: () => void;
}

export const StaffCurrentCustomerView: React.FC<StaffCurrentCustomerViewProps> = ({
  currentTicket,
  onCallNext,
  onRecall,
  onSkip,
  onComplete,
  onTransfer,
}) => {
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  // Live timer for current service duration
  useEffect(() => {
    if (!currentTicket) {
      setElapsedSeconds(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [currentTicket]);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSaveNote = () => {
    if (!notes.trim()) return;
    setSavedNotes((prev) => [notes.trim(), ...prev]);
    setNotes("");
    setNotice("Consultation note saved for ticket.");
    setTimeout(() => setNotice(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
              <UserCheck className="h-3 w-3" />
              Active Station Consultation
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Current Customer & Service Inspector
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Detailed profile, active service duration timer, staff notes, and immediate counter actions.
          </p>
        </div>

        {currentTicket && (
          <div className="flex items-center gap-3 bg-slate-900 text-white px-4 py-2 rounded-xl shadow-sm border border-slate-800">
            <Clock className="h-4 w-4 text-amber-400 animate-pulse" />
            <div className="text-right">
              <div className="text-[10px] uppercase text-slate-400 font-semibold">Service Duration</div>
              <div className="text-lg font-mono font-bold text-amber-400">{formatTimer(elapsedSeconds)}</div>
            </div>
          </div>
        )}
      </div>

      {notice && <Alert type="success" message={notice} onDismiss={() => setNotice(null)} />}

      {currentTicket ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Profile & Notes */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    Ticket ID: {currentTicket.id}
                  </span>
                  <div className="text-4xl font-black text-amber-500 mt-1">#{currentTicket.number}</div>
                </div>
                <div className="text-right space-y-2">
                  <TicketStatusBadge status={currentTicket.status} />
                  <div>
                    <PriorityBadge priority={currentTicket.priority} />
                  </div>
                </div>
              </div>

              {/* Customer Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Customer Name</span>
                    <strong className="text-slate-900 text-sm">{currentTicket.customerName || "Walk-In Customer"}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center font-bold">
                    <Phone className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Phone Number</span>
                    <strong className="text-slate-900 text-sm font-mono">{currentTicket.customerPhone || "Not Provided"}</strong>
                  </div>
                </div>
              </div>

              {/* Consultation Notes Area */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Staff Consultation Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Type service notes, account reference numbers, or resolution details..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={!notes.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs rounded-lg transition cursor-pointer"
                >
                  Save Note
                </button>

                {savedNotes.length > 0 && (
                  <div className="pt-3 space-y-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Saved Notes History</span>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {savedNotes.map((n, idx) => (
                        <div key={idx} className="p-2.5 bg-slate-100 rounded-lg text-xs text-slate-800 font-mono border border-slate-200">
                          {n}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Counter Action Controls Panel */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                Counter Station Actions
              </h3>

              <div className="space-y-2.5">
                <button
                  onClick={onRecall}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow"
                >
                  <Volume2 className="h-4 w-4" /> Recall Audio Announcement
                </button>

                <button
                  onClick={onComplete}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow"
                >
                  <Check className="h-4 w-4" /> Complete Service Session
                </button>

                <button
                  onClick={onTransfer}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow"
                >
                  <ArrowRightLeft className="h-4 w-4" /> Transfer to Another Queue
                </button>

                <button
                  onClick={onSkip}
                  className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <SkipForward className="h-4 w-4" /> Mark Customer Skipped / No-Show
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm text-center space-y-4 max-w-xl mx-auto">
          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
            <UserCheck className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">No Customer Currently Being Served</h2>
          <p className="text-xs text-slate-500">
            Your counter station is currently idle. Click "Call Next Customer" to serve the next waiting visitor.
          </p>

          <button
            onClick={onCallNext}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow cursor-pointer inline-flex items-center gap-2"
          >
            <Megaphone className="h-4 w-4" />
            Call Next Customer
          </button>
        </div>
      )}
    </div>
  );
};
