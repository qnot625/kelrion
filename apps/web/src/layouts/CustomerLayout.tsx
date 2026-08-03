import React, { useState } from "react";
import { Smartphone, Ticket as TicketIcon, UserPlus, Bell, History } from "lucide-react";
import { UserContext, Ticket } from "../types/queue";
import { RemoteCheckInView } from "../views/RemoteCheckInView";
import { CustomerTicketPassView } from "../views/CustomerTicketPassView";
import { CustomerPreferencesView } from "../views/CustomerPreferencesView";
import { CustomerQueueHistoryView } from "../views/CustomerQueueHistoryView";

interface CustomerLayoutProps {
  userContext: UserContext;
}

export type CustomerTab = "join" | "ticket" | "preferences" | "history";

export const CustomerLayout: React.FC<CustomerLayoutProps> = ({ userContext }) => {
  const [activeTab, setActiveTab] = useState<CustomerTab>("join");
  const [currentTicket, setCurrentTicket] = useState<Ticket | null>(null);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Customer Portal Banner & Navigation */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-md border border-indigo-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 rounded-full">
              <Smartphone className="h-3 w-3" />
              Mobile Customer Portal
            </span>
            <span className="text-xs text-indigo-300 font-mono">Tenant: {userContext.tenantId}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Branch Mobile Queue Portal</h1>
          <p className="text-xs text-indigo-200 mt-1">
            Join the queue remotely, track your live queue position, view estimated wait times, and receive SMS alerts.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700">
          <button
            onClick={() => setActiveTab("join")}
            aria-label="Join Queue"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              activeTab === "join"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-indigo-200 hover:text-white hover:bg-slate-700"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Join Queue</span>
          </button>

          <button
            onClick={() => setActiveTab("ticket")}
            aria-label="My Ticket Pass"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              activeTab === "ticket"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-indigo-200 hover:text-white hover:bg-slate-700"
            }`}
          >
            <TicketIcon className="h-3.5 w-3.5" />
            <span>My Ticket</span>
          </button>

          <button
            onClick={() => setActiveTab("preferences")}
            aria-label="Alert Preferences"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              activeTab === "preferences"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-indigo-200 hover:text-white hover:bg-slate-700"
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Preferences</span>
          </button>

          <button
            onClick={() => setActiveTab("history")}
            aria-label="Visit History"
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              activeTab === "history"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-indigo-200 hover:text-white hover:bg-slate-700"
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Queue History</span>
          </button>
        </div>
      </div>

      {/* Embedded Views */}
      {activeTab === "join" && (
        <RemoteCheckInView
          userContext={userContext}
          onTicketGenerated={(t) => {
            setCurrentTicket(t);
            setActiveTab("ticket");
          }}
        />
      )}

      {activeTab === "ticket" && (
        <CustomerTicketPassView
          userContext={userContext}
          currentTicket={currentTicket}
          onCancelTicket={() => setCurrentTicket(null)}
        />
      )}

      {activeTab === "preferences" && (
        <CustomerPreferencesView userContext={userContext} />
      )}

      {activeTab === "history" && (
        <CustomerQueueHistoryView userContext={userContext} />
      )}
    </div>
  );
};

