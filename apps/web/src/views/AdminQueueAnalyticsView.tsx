import React, { useState } from "react";
import { BarChart3, TrendingUp, Clock, Users, Zap, ShieldCheck } from "lucide-react";
import { UserContext } from "../types/queue";

interface AdminQueueAnalyticsViewProps {
  userContext: UserContext;
}

export const AdminQueueAnalyticsView: React.FC<AdminQueueAnalyticsViewProps> = () => {
  const [timeRange, setTimeRange] = useState<"today" | "week" | "month">("today");

  return (
    <div className="space-y-6">
      {/* Analytics Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <BarChart3 className="h-3 w-3" />
              Queue Telemetry & Analytics
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Operational Intelligence & Throughput
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Monitor queue volume velocity, counter utilization efficiency, peak bottleneck hours, and wait time SLAs.
          </p>
        </div>

        {/* Time Filter Buttons */}
        <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setTimeRange("today")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              timeRange === "today" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setTimeRange("week")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              timeRange === "week" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            This Week
          </button>
          <button
            onClick={() => setTimeRange("month")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer ${
              timeRange === "month" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            This Month
          </button>
        </div>
      </div>

      {/* Primary Telemetry Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Average Wait Time</span>
          <div className="text-3xl font-black text-indigo-600 mt-1">4.2 mins</div>
          <div className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" /> 12% faster than target SLA
          </div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Average Service Duration</span>
          <div className="text-3xl font-black text-slate-800 mt-1">3.8 mins</div>
          <div className="text-xs text-slate-500 mt-2">Optimal counter turnaround rate</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Counter Efficiency</span>
          <div className="text-3xl font-black text-emerald-600 mt-1">94.6%</div>
          <div className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" /> 4 active service counters
          </div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">SLA Target Compliance</span>
          <div className="text-3xl font-black text-amber-600 mt-1">98.9%</div>
          <div className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Zero SLA breaches today
          </div>
        </div>
      </div>

      {/* Hourly Customer Volume Chart Visualization */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Hourly Customer Traffic & Counter Load</h3>
            <p className="text-xs text-slate-500 mt-0.5">Distribution of served vs waiting tickets across operating hours.</p>
          </div>
          <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded text-slate-700">Peak: 11:00 AM - 1:00 PM</span>
        </div>

        {/* Visual Bar Chart */}
        <div className="space-y-3 pt-2">
          {[
            { hour: "08:00 AM", count: 12, max: 40, label: "Low traffic" },
            { hour: "09:00 AM", count: 24, max: 40, label: "Moderate" },
            { hour: "10:00 AM", count: 32, max: 40, label: "Busy" },
            { hour: "11:00 AM", count: 38, max: 40, label: "Peak Load" },
            { hour: "12:00 PM", count: 35, max: 40, label: "High traffic" },
            { hour: "01:00 PM", count: 28, max: 40, label: "Moderate" },
            { hour: "02:00 PM", count: 19, max: 40, label: "Steady" },
            { hour: "03:00 PM", count: 15, max: 40, label: "Light" },
          ].map((item) => (
            <div key={item.hour} className="flex items-center gap-3 text-xs">
              <span className="w-16 font-mono text-slate-600 font-semibold">{item.hour}</span>
              <div className="flex-1 bg-slate-100 h-6 rounded-lg overflow-hidden relative flex items-center">
                <div
                  className={`h-full transition-all duration-500 ${
                    item.count > 30 ? "bg-amber-500" : "bg-indigo-600"
                  }`}
                  style={{ width: `${(item.count / item.max) * 100}%` }}
                />
                <span className="absolute left-3 text-[11px] font-extrabold text-slate-800 drop-shadow-sm">
                  {item.count} tickets ({item.label})
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Distribution & Service Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Priority Class Distribution</h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-600" />
                <span className="font-semibold text-slate-800">STANDARD Priority</span>
              </div>
              <strong className="font-mono text-slate-900">184 tickets (74.5%)</strong>
            </div>

            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-100">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="font-semibold text-amber-900">VIP Priority</span>
              </div>
              <strong className="font-mono text-amber-900">38 tickets (15.4%)</strong>
            </div>

            <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-indigo-500" />
                <span className="font-semibold text-indigo-900">APPOINTMENT Scheduled</span>
              </div>
              <strong className="font-mono text-indigo-900">21 tickets (8.5%)</strong>
            </div>

            <div className="flex items-center justify-between p-3 bg-rose-50 rounded-lg border border-rose-100">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-600" />
                <span className="font-semibold text-rose-900">EMERGENCY Direct Jump</span>
              </div>
              <strong className="font-mono text-rose-900">4 tickets (1.6%)</strong>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Counter Performance Breakdown</h3>
          <div className="space-y-3 text-xs">
            {[
              { counter: "Counter 1 (General)", operator: "Staff Ops #01", tickets: 68, avgTime: "3.4m" },
              { counter: "Counter 2 (Teller)", operator: "Staff Ops #02", tickets: 74, avgTime: "3.9m" },
              { counter: "Counter 3 (Express)", operator: "Staff Ops #03", tickets: 82, avgTime: "2.8m" },
              { counter: "Counter 4 (VIP Desk)", operator: "Staff Ops #04", tickets: 23, avgTime: "5.1m" },
            ].map((c) => (
              <div key={c.counter} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                <div>
                  <strong className="text-slate-900 font-bold block">{c.counter}</strong>
                  <span className="text-slate-500 text-[10px]">{c.operator}</span>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold text-indigo-600">{c.tickets} tickets</div>
                  <div className="text-slate-500 text-[10px]">Avg: {c.avgTime}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
