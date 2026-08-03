import React, { useState } from "react";
import { UserCheck, Calendar, Users, ListOrdered, UserPlus, FileText } from "lucide-react";
import { UserContext, Ticket } from "../types/queue";
import { QueueCounterView } from "../views/QueueCounterView";
import { AppointmentCheckInView } from "../views/AppointmentCheckInView";
import { StaffCurrentCustomerView } from "../views/StaffCurrentCustomerView";
import { StaffQueueListView } from "../views/StaffQueueListView";
import { StaffWalkInDeskView } from "../views/StaffWalkInDeskView";

interface StaffLayoutProps {
  userContext: UserContext;
  initialQueueId?: string;
}

export type StaffTab = "counter" | "customer" | "queue_list" | "appointment" | "walkin";

export const StaffLayout: React.FC<StaffLayoutProps> = ({
  userContext,
  initialQueueId,
}) => {
  const [activeTab, setActiveTab] = useState<StaffTab>("counter");
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  return (
    <div className="space-y-6">
      {/* Staff Portal Header & Navigation */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded">
              <Users className="h-3 w-3" />
              Staff Workspace Portal
            </span>
            <span className="text-xs text-slate-400 font-mono">Operator ID: {userContext.userId}</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
            Counter Operations & Reception Desk
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Call waiting customers, recall/skip tickets, execute queue transfers, and check in scheduled appointments.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab("counter")}
            aria-label="My Counter"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "counter"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            <span>My Counter</span>
          </button>

          <button
            onClick={() => setActiveTab("customer")}
            aria-label="Current Customer"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "customer"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Current Customer</span>
          </button>

          <button
            onClick={() => setActiveTab("queue_list")}
            aria-label="Queue Directory"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "queue_list"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <ListOrdered className="h-3.5 w-3.5" />
            <span>Queue List</span>
          </button>

          <button
            onClick={() => setActiveTab("appointment")}
            aria-label="Appointment Check-In"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "appointment"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            <span>Appointment Check-In</span>
          </button>

          <button
            onClick={() => setActiveTab("walkin")}
            aria-label="Walk-In Desk"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              activeTab === "walkin"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Walk-In Desk</span>
          </button>
        </div>
      </div>

      {/* Main View Display */}
      {activeTab === "counter" && (
        <QueueCounterView
          userContext={userContext}
          initialQueueId={initialQueueId}
        />
      )}

      {activeTab === "customer" && (
        <StaffCurrentCustomerView
          userContext={userContext}
          currentTicket={activeTicket}
          onCallNext={() => setActiveTab("queue_list")}
          onComplete={() => setActiveTicket(null)}
          onSkip={() => setActiveTicket(null)}
        />
      )}

      {activeTab === "queue_list" && (
        <StaffQueueListView
          userContext={userContext}
          onCallTicket={(ticket) => {
            setActiveTicket(ticket);
            setActiveTab("customer");
          }}
        />
      )}

      {activeTab === "appointment" && (
        <AppointmentCheckInView
          userContext={userContext}
          onCheckInSuccess={(ticket) => {
            setActiveTicket(ticket);
            setActiveTab("customer");
          }}
        />
      )}

      {activeTab === "walkin" && (
        <StaffWalkInDeskView userContext={userContext} />
      )}
    </div>
  );
};
