import React, { useState } from "react";
import { ListOrdered, Search, Filter, Megaphone, Clock, UserCheck } from "lucide-react";
import { UserContext, Ticket } from "../types/queue";
import { PriorityBadge, TicketStatusBadge } from "../components/TicketBadge";
import { Alert } from "../components/Alert";

interface StaffQueueListViewProps {
  userContext: UserContext;
  onCallTicket?: (ticket: Ticket) => void;
}

const DEMO_WAITING_TICKETS: Ticket[] = [
  {
    id: "tkt_101",
    queueId: "queue_main",
    tenantId: "tenant-test-01",
    number: "A-105",
    sequence: 105,
    status: "waiting",
    priority: "VIP",
    customerName: "Eleanor Vance",
    customerPhone: "+15550192",
    joinedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    estimatedWaitMinutes: 3,
  },
  {
    id: "tkt_102",
    queueId: "queue_main",
    tenantId: "tenant-test-01",
    number: "A-106",
    sequence: 106,
    status: "waiting",
    priority: "APPOINTMENT",
    customerName: "Dr. Henry Wu",
    customerPhone: "+15550188",
    joinedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    estimatedWaitMinutes: 6,
  },
  {
    id: "tkt_103",
    queueId: "queue_teller",
    tenantId: "tenant-test-01",
    number: "T-204",
    sequence: 204,
    status: "waiting",
    priority: "STANDARD",
    customerName: "Carlos Ruiz",
    customerPhone: "+15550174",
    joinedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    estimatedWaitMinutes: 10,
  },
  {
    id: "tkt_104",
    queueId: "queue_express",
    tenantId: "tenant-test-01",
    number: "E-301",
    sequence: 301,
    status: "waiting",
    priority: "EMERGENCY",
    customerName: "Sarah Connor",
    customerPhone: "+15550111",
    joinedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    estimatedWaitMinutes: 1,
  },
  {
    id: "tkt_105",
    queueId: "queue_main",
    tenantId: "tenant-test-01",
    number: "A-107",
    sequence: 107,
    status: "waiting",
    priority: "STANDARD",
    customerName: "James O'Connor",
    customerPhone: "+15550155",
    joinedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    estimatedWaitMinutes: 14,
  },
];

export const StaffQueueListView: React.FC<StaffQueueListViewProps> = ({
  onCallTicket,
}) => {
  const [tickets, setTickets] = useState<Ticket[]>(DEMO_WAITING_TICKETS);
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [success, setSuccess] = useState<string | null>(null);

  const handleManualCall = (t: Ticket) => {
    setTickets((prev) => prev.filter((item) => item.id !== t.id));
    setSuccess(`Ticket #${t.number} called to your station out-of-order.`);
    if (onCallTicket) onCallTicket(t);
  };

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.customerName && t.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPriority = priorityFilter === "ALL" || t.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
              <ListOrdered className="h-3 w-3" />
              Live Waiting Queue Directory
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Waiting Customers & Ticket Dispatch Board
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Inspect all waiting visitors across queues, check priority statuses, and call specific tickets manually.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          <Clock className="h-4 w-4 text-amber-500" />
          Total Waiting: <strong className="text-slate-900 font-bold">{tickets.length} Customers</strong>
        </div>
      </div>

      {success && <Alert type="success" message={success} onDismiss={() => setSuccess(null)} />}

      {/* Search & Priority Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search ticket # or customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Priority:
          </span>
          {["ALL", "VIP", "EMERGENCY", "APPOINTMENT", "STANDARD"].map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                priorityFilter === p ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No waiting tickets match your criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Ticket #</th>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Priority Tier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Est. Wait</th>
                  <th className="py-3 px-4">Time Joined</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-500 text-sm">#{t.number}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900">{t.customerName || "Walk-In Guest"}</td>
                    <td className="py-3.5 px-4">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="py-3.5 px-4">
                      <TicketStatusBadge status={t.status} />
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold text-emerald-600">
                      ~{t.estimatedWaitMinutes || 5} mins
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">
                      {new Date(t.joinedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => handleManualCall(t)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg transition cursor-pointer inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <Megaphone className="h-3 w-3" /> Call Ticket
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
