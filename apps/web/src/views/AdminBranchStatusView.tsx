import React from "react";
import { Building2, Users, Clock, Radio, ShieldCheck, MapPin } from "lucide-react";
import { UserContext } from "../types/queue";

interface AdminBranchStatusViewProps {
  userContext: UserContext;
}

export const AdminBranchStatusView: React.FC<AdminBranchStatusViewProps> = () => {
  const branches = [
    {
      id: "branch-main",
      name: "Central Financial Hub (Main Branch)",
      address: "100 Enterprise Way, Financial District",
      activeQueues: 4,
      waitingTotal: 18,
      servingTotal: 4,
      activeCounters: 5,
      status: "OPERATIONAL",
    },
    {
      id: "branch-downtown",
      name: "Downtown Customer Service Center",
      address: "45 Market Street, Commerce Tower",
      activeQueues: 2,
      waitingTotal: 8,
      servingTotal: 2,
      activeCounters: 3,
      status: "OPERATIONAL",
    },
    {
      id: "branch-westside",
      name: "Westside Express Desk",
      address: "880 Boulevard West, Suite 12",
      activeQueues: 1,
      waitingTotal: 2,
      servingTotal: 1,
      activeCounters: 1,
      status: "LIGHT_TRAFFIC",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <Building2 className="h-3 w-3" />
              Multi-Branch Queue Operations
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Enterprise Branch Queue Network Health
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor queue traffic, counter utilization, and customer wait volume across all physical branch locations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold">
            <Radio className="h-3.5 w-3.5 text-emerald-600 animate-pulse" />
            3 Branches Live Stream Sync
          </span>
        </div>
      </div>

      {/* Branch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {branches.map((b) => (
          <div key={b.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase text-indigo-600 tracking-wider font-mono">
                  {b.id}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-0.5">{b.name}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3 text-slate-400" /> {b.address}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold">Waiting</div>
                <div className="text-xl font-black text-amber-600">{b.waitingTotal}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold">Serving</div>
                <div className="text-xl font-black text-emerald-600">{b.servingTotal}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold">Counters</div>
                <div className="text-xl font-black text-slate-800">{b.activeCounters}</div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">{b.activeQueues} Active Queues</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ShieldCheck className="h-3 w-3" /> Normal Operations
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
