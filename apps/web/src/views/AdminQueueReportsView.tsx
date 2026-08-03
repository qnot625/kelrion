import React, { useState } from "react";
import { LineChart, Download, Search, Filter, ShieldCheck, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { UserContext } from "../types/queue";

interface AdminQueueReportsViewProps {
  userContext: UserContext;
}

interface DemoTicketReport {
  ticketNumber: string;
  queueCode: string;
  customerName: string;
  priority: string;
  waitTimeMins: number;
  serviceTimeMins: number;
  counterId: string;
  status: string;
  completedAt: string;
  slaBreached: boolean;
}

const DEMO_REPORT_DATA: DemoTicketReport[] = [
  {
    ticketNumber: "A-104",
    queueCode: "MAIN",
    customerName: "Eleanor Vance",
    priority: "STANDARD",
    waitTimeMins: 3.2,
    serviceTimeMins: 4.1,
    counterId: "Counter 1",
    status: "COMPLETED",
    completedAt: "2026-08-02 14:32:10",
    slaBreached: false,
  },
  {
    ticketNumber: "V-201",
    queueCode: "VIP",
    customerName: "Marcus Sterling",
    priority: "VIP",
    waitTimeMins: 1.1,
    serviceTimeMins: 5.8,
    counterId: "Counter 4",
    status: "COMPLETED",
    completedAt: "2026-08-02 14:28:45",
    slaBreached: false,
  },
  {
    ticketNumber: "T-309",
    queueCode: "TELLER",
    customerName: "Sarah Jenkins",
    priority: "STANDARD",
    waitTimeMins: 16.4,
    serviceTimeMins: 3.2,
    counterId: "Counter 2",
    status: "COMPLETED",
    completedAt: "2026-08-02 14:15:20",
    slaBreached: true,
  },
  {
    ticketNumber: "A-103",
    queueCode: "MAIN",
    customerName: "David Kim",
    priority: "APPOINTMENT",
    waitTimeMins: 2.0,
    serviceTimeMins: 4.5,
    counterId: "Counter 3",
    status: "COMPLETED",
    completedAt: "2026-08-02 14:02:11",
    slaBreached: false,
  },
  {
    ticketNumber: "E-501",
    queueCode: "EXPRESS",
    customerName: "Amara Patel",
    priority: "EMERGENCY",
    waitTimeMins: 0.5,
    serviceTimeMins: 2.9,
    counterId: "Counter 1",
    status: "COMPLETED",
    completedAt: "2026-08-02 13:50:00",
    slaBreached: false,
  },
];

export const AdminQueueReportsView: React.FC<AdminQueueReportsViewProps> = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSla, setFilterSla] = useState<"all" | "met" | "breached">("all");
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const filteredLogs = DEMO_REPORT_DATA.filter((item) => {
    const matchesSearch =
      item.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.queueCode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSla =
      filterSla === "all" ||
      (filterSla === "met" && !item.slaBreached) ||
      (filterSla === "breached" && item.slaBreached);
    return matchesSearch && matchesSla;
  });

  const handleExportCSV = () => {
    setExportNotice("Exporting ticket report telemetry to CSV...");
    setTimeout(() => {
      setExportNotice("Report exported successfully (5 records downloaded).");
      setTimeout(() => setExportNotice(null), 3000);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <LineChart className="h-3 w-3" />
              SLA & Wait Time Reports
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Service Level Agreement Compliance & Audit Reports
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Audit individual ticket wait times, service completion logs, counter assignments, and SLA breach incidents.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV Report</span>
        </button>
      </div>

      {exportNotice && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-semibold rounded-lg flex items-center gap-2">
          <Clock className="h-4 w-4 text-indigo-600 animate-spin" />
          {exportNotice}
        </div>
      )}

      {/* Aggregate Report Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Total Tickets Audited Today</span>
            <div className="text-3xl font-black text-slate-900 mt-1">247</div>
          </div>
          <div className="w-10 h-10 bg-slate-100 text-slate-700 rounded-lg flex items-center justify-center font-bold">
            247
          </div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-600 uppercase">SLA Compliance Rate</span>
            <div className="text-3xl font-black text-emerald-600 mt-1">98.4%</div>
          </div>
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-rose-600 uppercase">SLA Breaches (&gt;15m)</span>
            <div className="text-3xl font-black text-rose-600 mt-1">4</div>
          </div>
          <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Search and SLA Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search ticket #, customer name, queue..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> SLA Filter:
          </span>
          <button
            onClick={() => setFilterSla("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              filterSla === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All Logs
          </button>
          <button
            onClick={() => setFilterSla("met")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              filterSla === "met" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            SLA Met
          </button>
          <button
            onClick={() => setFilterSla("breached")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
              filterSla === "breached" ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            SLA Breached
          </button>
        </div>
      </div>

      {/* Ticket Report Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Ticket #</th>
                <th className="py-3 px-4">Queue</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Wait Time</th>
                <th className="py-3 px-4">Service Time</th>
                <th className="py-3 px-4">Counter</th>
                <th className="py-3 px-4">SLA Compliance</th>
                <th className="py-3 px-4 text-right">Completed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredLogs.map((log) => (
                <tr key={log.ticketNumber} className="hover:bg-slate-50 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-amber-600">#{log.ticketNumber}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">{log.queueCode}</td>
                  <td className="py-3.5 px-4">{log.customerName}</td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                      {log.priority}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono">{log.waitTimeMins} mins</td>
                  <td className="py-3.5 px-4 font-mono">{log.serviceTimeMins} mins</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">{log.counterId}</td>
                  <td className="py-3.5 px-4">
                    {log.slaBreached ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        <AlertTriangle className="h-3 w-3" /> SLA Breached (&gt;15m)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="h-3 w-3" /> Target Met
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500">{log.completedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
