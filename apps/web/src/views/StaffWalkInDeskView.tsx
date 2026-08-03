import React, { useState } from "react";
import { UserPlus, Ticket as TicketIcon, Printer, CheckCircle2 } from "lucide-react";
import { UserContext, Ticket, QueuePriority } from "../types/queue";
import { Alert } from "../components/Alert";

interface StaffWalkInDeskViewProps {
  userContext: UserContext;
}

export const StaffWalkInDeskView: React.FC<StaffWalkInDeskViewProps> = ({ userContext }) => {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedQueue, setSelectedQueue] = useState("queue_main");
  const [priority, setPriority] = useState<QueuePriority>("STANDARD");

  const [createdTicket, setCreatedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleIssueTicket = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Generate demo ticket
      const prefix = selectedQueue === "queue_teller" ? "T" : selectedQueue === "queue_express" ? "E" : "A";
      const seq = Math.floor(Math.random() * 80) + 105;
      const ticketNum = `${prefix}-${seq}`;

      const ticket: Ticket = {
        id: `tkt_walkin_${Date.now()}`,
        queueId: selectedQueue,
        tenantId: userContext.tenantId,
        number: ticketNum,
        sequence: seq,
        status: "waiting",
        priority,
        customerName: customerName.trim() || "Walk-In Guest",
        customerPhone: customerPhone.trim() || undefined,
        joinedAt: new Date().toISOString(),
        estimatedWaitMinutes: priority === "VIP" ? 3 : priority === "EMERGENCY" ? 0 : 8,
      };

      setCreatedTicket(ticket);
      setCustomerName("");
      setCustomerPhone("");
    } catch (err: any) {
      setError(err.message || "Failed to register walk-in guest");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <UserPlus className="h-3 w-3" />
              Reception Walk-In Desk
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Staff Direct Walk-In Registration & Pass Issuance
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Register walk-in visitors directly at the reception counter, assign priority tiers, and print ticket slips.
          </p>
        </div>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registration Form */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Register Walk-In Visitor
          </h2>

          <form onSubmit={handleIssueTicket} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Service Queue *</label>
              <select
                value={selectedQueue}
                onChange={(e) => setSelectedQueue(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="queue_main">[MAIN] Main General Services Queue</option>
                <option value="queue_teller">[TELLER] Cashier & Teller Counter</option>
                <option value="queue_express">[EXPRESS] Express Consultation Desk</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Full Name</label>
              <input
                type="text"
                placeholder="e.g. Jane Doe (or leave empty for 'Walk-In Guest')"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone Number (SMS Alert Notifications)</label>
              <input
                type="tel"
                placeholder="e.g. +1 555-0199"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Priority Override Tier</label>
              <div className="grid grid-cols-3 gap-2">
                {(["STANDARD", "VIP", "EMERGENCY"] as QueuePriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border transition cursor-pointer ${
                      priority === p
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <TicketIcon className="h-4 w-4" />
              Issue & Print Walk-In Ticket
            </button>
          </form>
        </div>

        {/* Generated Ticket Slip Preview */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            Ticket Slip Receipt Preview
          </h2>

          {createdTicket ? (
            <div className="p-6 bg-slate-900 text-white rounded-2xl shadow-md space-y-4 border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider">
                  KLERION QUEUE RECEIPT
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                  <CheckCircle2 className="h-3 w-3" /> Ticket Issued
                </span>
              </div>

              <div className="text-center py-2">
                <div className="text-xs text-slate-400 font-medium uppercase">Ticket Number</div>
                <div className="text-5xl font-black text-amber-400 font-mono tracking-tight mt-1">
                  #{createdTicket.number}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-slate-800 pt-3">
                <div>
                  <span className="text-slate-400 block text-[10px]">Customer</span>
                  <strong className="text-slate-100 font-bold">{createdTicket.customerName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Priority</span>
                  <strong className="text-amber-400 font-mono font-bold">{createdTicket.priority}</strong>
                </div>
              </div>

              <div className="text-center pt-3 border-t border-slate-800 text-xs text-slate-400">
                Est. Wait: <strong className="text-emerald-400 font-mono">~{createdTicket.estimatedWaitMinutes} mins</strong>
              </div>

              <button
                type="button"
                onClick={() => window.print && window.print()}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="h-3.5 w-3.5" /> Print Thermal Slip
              </button>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl bg-slate-50">
              <TicketIcon className="h-8 w-8 mx-auto mb-2 text-slate-400" />
              <p className="text-xs font-semibold">Fill out the walk-in registration form to generate a ticket slip receipt.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
