import React from "react";
import { History, CheckCircle2, Clock, MapPin } from "lucide-react";
import { UserContext } from "../types/queue";

interface CustomerQueueHistoryViewProps {
  userContext: UserContext;
}

export const CustomerQueueHistoryView: React.FC<CustomerQueueHistoryViewProps> = () => {
  const historyItems = [
    {
      id: "hist_1",
      ticketNumber: "A-102",
      branchName: "Central Financial Hub",
      service: "General Services",
      date: "2026-08-01 11:20 AM",
      durationMins: "4.2 mins",
      status: "COMPLETED",
    },
    {
      id: "hist_2",
      ticketNumber: "T-304",
      branchName: "Downtown Service Center",
      service: "Teller & Cashier Desk",
      date: "2026-07-28 02:45 PM",
      durationMins: "3.5 mins",
      status: "COMPLETED",
    },
    {
      id: "hist_3",
      ticketNumber: "E-101",
      branchName: "Westside Express Desk",
      service: "Express Consultation",
      date: "2026-07-15 09:10 AM",
      durationMins: "2.1 mins",
      status: "COMPLETED",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <History className="h-3 w-3" />
              Visit Receipts & History
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            My Service History & Past Visits
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Log of completed branch visits, service durations, and historical ticket receipts.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Ticket #</th>
                <th className="py-3 px-4">Branch Location</th>
                <th className="py-3 px-4">Service Category</th>
                <th className="py-3 px-4">Service Duration</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {historyItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 text-sm">#{item.ticketNumber}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" /> {item.branchName}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">{item.service}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-800 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" /> {item.durationMins}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" /> {item.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-500">{item.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
