import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Users,
  Smartphone,
  Tv,
  Ticket,
  Maximize2,
  Settings,
  Layers,
  Search,
  Bell,
  ArrowRight,
  CheckCircle2,
  Activity,
  LayoutDashboard,
  Sliders,
} from "lucide-react";
import { UserContext } from "./types/queue";
import { AdminLayout } from "./layouts/AdminLayout";
import { StaffLayout } from "./layouts/StaffLayout";
import { CustomerLayout } from "./layouts/CustomerLayout";
import { DisplayLayout } from "./layouts/DisplayLayout";
import { KioskLayout } from "./layouts/KioskLayout";

export type PortalType = "overview" | "admin" | "staff" | "customer" | "display" | "kiosk";

export const App: React.FC = () => {
  // Determine initial portal from URL hash or path
  const getInitialPortal = (): PortalType => {
    const hash = window.location.hash.replace("#", "").toLowerCase();
    const path = window.location.pathname.replace("/", "").toLowerCase();

    if (hash.startsWith("admin") || path.startsWith("admin")) return "admin";
    if (hash.startsWith("staff") || path.startsWith("staff")) return "staff";
    if (hash.startsWith("customer") || path.startsWith("customer")) return "customer";
    if (hash.startsWith("display") || path.startsWith("display")) return "display";
    if (hash.startsWith("kiosk") || path.startsWith("kiosk")) return "kiosk";
    return "overview";
  };

  const [activePortal, setActivePortal] = useState<PortalType>(getInitialPortal);
  const [selectedQueueId, setSelectedQueueId] = useState<string | undefined>(undefined);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(false);

  // Sync portal changes with URL hash for deep linking
  const handlePortalChange = (portal: PortalType) => {
    setActivePortal(portal);
    window.location.hash = `#${portal}`;
  };

  // Sync state if user navigates back/forward in browser
  useEffect(() => {
    const handleHashChange = () => {
      setActivePortal(getInitialPortal());
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const userContext: UserContext = {
    tenantId: "tenant-001",
    userId: "user-owner-01",
    role: "OWNER",
  };

  const handleNavigateToStaff = (queueId?: string) => {
    if (queueId) setSelectedQueueId(queueId);
    handlePortalChange("staff");
  };

  const handleNavigateToDisplay = (queueId?: string) => {
    if (queueId) setSelectedQueueId(queueId);
    handlePortalChange("display");
  };

  // Auto-collapse header for TV Display and Kiosk modes to simulate true full-screen lobby/touchscreen experience
  const isDedicatedScreen = activePortal === "display" || activePortal === "kiosk";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans">
      {/* Universal Top App Shell Header & Role-Based Navigation */}
      {(!isHeaderCollapsed || !isDedicatedScreen) && (
        <header className="bg-slate-900 text-slate-100 border-b border-slate-800 sticky top-0 z-50 shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-2.5">
            {/* Branding & Enterprise Search */}
            <div className="flex flex-wrap items-center gap-4">
              <div
                onClick={() => handlePortalChange("overview")}
                className="flex items-center gap-2.5 cursor-pointer group"
                title="Return to Operations Hub"
              >
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-extrabold text-white shadow-sm ring-1 ring-indigo-400/30 group-hover:bg-indigo-500 transition">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-base tracking-tight text-white group-hover:text-indigo-200 transition">
                      Klerion Administrative Operations Platform
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded">
                      Queue Operations
                    </span>
                  </div>
                </div>
              </div>

              {/* Enterprise Search Placeholder */}
              <div className="relative hidden md:flex items-center">
                <Search className="absolute left-3 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search queues, tickets, customers..."
                  readOnly
                  className="bg-slate-800/90 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48 lg:w-56"
                />
              </div>
            </div>

            {/* Navigation Controls: Hub + Portals + Display Modes */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Operations Hub Button */}
              <button
                onClick={() => handlePortalChange("overview")}
                aria-label="Operations Hub"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  activePortal === "overview"
                    ? "bg-slate-700 text-white border border-slate-600 shadow-sm font-bold"
                    : "text-slate-300 hover:text-white hover:bg-slate-800"
                }`}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>Operations Hub</span>
              </button>

              <div className="w-px h-6 bg-slate-800 mx-1 hidden sm:block" />

              {/* User Portals Navigation (No "PORTALS" Label) */}
              <nav aria-label="User Portals" className="flex items-center gap-1">
                <button
                  onClick={() => handlePortalChange("admin")}
                  aria-label="Admin Portal"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    activePortal === "admin"
                      ? "bg-indigo-600 text-white shadow-sm font-bold"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Admin</span>
                </button>

                <button
                  onClick={() => handlePortalChange("staff")}
                  aria-label="Staff Portal"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    activePortal === "staff"
                      ? "bg-indigo-600 text-white shadow-sm font-bold"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Staff</span>
                </button>

                <button
                  onClick={() => handlePortalChange("customer")}
                  aria-label="Customer Portal"
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    activePortal === "customer"
                      ? "bg-indigo-600 text-white shadow-sm font-bold"
                      : "text-slate-300 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Customer</span>
                </button>
              </nav>

              <div className="w-px h-6 bg-slate-800 mx-1 hidden sm:block" />

              {/* DISPLAY MODES GROUP */}
              <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300 bg-amber-950/70 border border-amber-500/30 rounded select-none hidden xl:inline-block">
                  Display Modes
                </span>

                <nav aria-label="Display Modes" className="flex items-center gap-1">
                  <button
                    onClick={() => handlePortalChange("display")}
                    aria-label="TV Display"
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      activePortal === "display"
                        ? "bg-amber-600 text-white shadow-sm font-bold"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/80"
                    }`}
                  >
                    <Tv className="h-3.5 w-3.5" />
                    <span>TV Display</span>
                  </button>

                  <button
                    onClick={() => handlePortalChange("kiosk")}
                    aria-label="Walk-In Kiosk"
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      activePortal === "kiosk"
                        ? "bg-amber-600 text-white shadow-sm font-bold"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/80"
                    }`}
                  >
                    <Ticket className="h-3.5 w-3.5" />
                    <span>Walk-In Kiosk</span>
                  </button>
                </nav>
              </div>

              {/* Enterprise System Action Indicators & Profile Placeholder */}
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                {isDedicatedScreen && (
                  <button
                    onClick={() => setIsHeaderCollapsed(true)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Hide navigation header for full screen mode"
                    aria-label="Fullscreen mode"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Fullscreen</span>
                  </button>
                )}

                <button
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg relative cursor-pointer"
                  title="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full ring-2 ring-slate-900" />
                </button>

                <button
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                  title="Settings"
                >
                  <Sliders className="h-4 w-4" />
                </button>

                {/* User Avatar Placeholder */}
                <div className="flex items-center gap-2 ml-1">
                  <div className="w-7 h-7 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-400/30 flex items-center justify-center font-bold text-xs uppercase">
                    OP
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Floating Header Restore Toggle for TV Display and Kiosk Fullscreen Mode */}
      {isHeaderCollapsed && isDedicatedScreen && (
        <button
          onClick={() => setIsHeaderCollapsed(false)}
          aria-label="Show Navigation Controls"
          className="fixed top-3 right-3 z-50 bg-slate-900/90 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold shadow-lg backdrop-blur-sm transition flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>Show Nav Controls</span>
        </button>
      )}

      {/* Main Container */}
      <main className={activePortal === "display" || activePortal === "kiosk" ? "w-full" : "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"}>
        {/* Operations Hub Overview Dashboard */}
        {activePortal === "overview" && (
          <div className="space-y-8">
            {/* Header Banner */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded">
                    <Activity className="h-3 w-3" />
                    Enterprise Operations Hub
                  </span>
                  <span className="text-xs text-slate-400 font-mono">Tenant: {userContext.tenantId}</span>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
                  Queue Operations & Service Management
                </h1>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                  Select a role-based workspace or launch lobby display hardware. Real-time telemetry, counter dispatching, customer tracking, and automated multi-channel notifications.
                </p>
              </div>

              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-600">
                <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                <div>
                  <div className="font-semibold text-slate-800">SSE Realtime Engine</div>
                  <div className="text-[11px] text-slate-500">Connected to tenant event stream</div>
                </div>
              </div>
            </div>

            {/* Enterprise Workspace Cards (NO "PORTALS" HEADING) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Admin Card */}
              <div className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                      <ShieldCheck className="h-6 w-6" />
                    </div>
                    <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      System Normal
                    </span>
                  </div>

                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Admin Portal</h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      System & branch administration, queue configuration, telemetry, and notification management.
                    </p>
                  </div>

                  {/* Metrics List */}
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Queue Health</span>
                      <span className="font-mono font-bold text-emerald-600">98%</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Active Queues</span>
                      <span className="font-mono font-bold text-slate-800">12</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Today's Customers</span>
                      <span className="font-mono font-bold text-slate-800">247</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Notifications Pending</span>
                      <span className="font-mono font-bold text-indigo-600">5</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handlePortalChange("admin")}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Staff Card */}
              <div className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                      <Users className="h-6 w-6" />
                    </div>
                    <span className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full flex items-center gap-1">
                      <Activity className="h-3 w-3 text-indigo-600" />
                      Counter Ready
                    </span>
                  </div>

                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Staff Portal</h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Counter operations workspace for calling, recalling, skipping, completing, and transferring tickets.
                    </p>
                  </div>

                  {/* Metrics List */}
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Current Counter</span>
                      <span className="font-mono font-bold text-indigo-600">Counter 3</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Customers Waiting</span>
                      <span className="font-mono font-bold text-amber-600">18</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Serving</span>
                      <span className="font-mono font-bold text-emerald-600">A-104</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Completed Today</span>
                      <span className="font-mono font-bold text-slate-800">43</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handlePortalChange("staff")}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Customer Card */}
              <div className="bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                      <Smartphone className="h-6 w-6" />
                    </div>
                    <span className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      Pass Active
                    </span>
                  </div>

                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Customer Portal</h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Self-service portal for remote check-in, real-time ticket tracking, and wait time estimates.
                    </p>
                  </div>

                  {/* Metrics List */}
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">My Queue Status</span>
                      <span className="font-mono font-bold text-emerald-600">Ready</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Estimated Wait</span>
                      <span className="font-mono font-bold text-slate-800">12–18 mins</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Upcoming Appointment</span>
                      <span className="font-mono font-bold text-slate-800">Today</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-500 font-medium">Notifications</span>
                      <span className="font-mono font-bold text-indigo-600">Enabled</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handlePortalChange("customer")}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* DISPLAY MODES SECTION */}
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center">
                    <Tv className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Display Modes</h3>
                    <p className="text-xs text-slate-500">
                      Dedicated hardware interfaces for lobby TV monitors and touchscreen self-service kiosks.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded-md">
                  Deployment Interfaces
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* TV Display Card */}
                <div className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                        <Tv className="h-5 w-5" />
                      </div>
                      <span className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                        Lobby TV Board
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-slate-900">TV Display</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Full-screen public lobby display board showing Now Serving, upcoming tickets, active counters, and real-time SSE stream updates.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handlePortalChange("display")}
                    className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <span>Launch TV Display</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Walk-In Kiosk Card */}
                <div className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                        <Ticket className="h-5 w-5" />
                      </div>
                      <span className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                        Touchscreen Self-Service
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-slate-900">Walk-In Kiosk</h4>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        Touch-optimized self-service interface for walk-in registration, service selection, appointment lookup, and slip receipt printing.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handlePortalChange("kiosk")}
                    className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <span>Launch Walk-In Kiosk</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Individual Role Portals & Deployment Modes */}
        {activePortal === "admin" && (
          <AdminLayout
            userContext={userContext}
            onNavigateToStaff={handleNavigateToStaff}
            onNavigateToDisplay={handleNavigateToDisplay}
          />
        )}

        {activePortal === "staff" && (
          <StaffLayout
            userContext={userContext}
            initialQueueId={selectedQueueId}
          />
        )}

        {activePortal === "customer" && (
          <CustomerLayout userContext={userContext} />
        )}

        {activePortal === "display" && (
          <DisplayLayout
            userContext={userContext}
            initialQueueId={selectedQueueId}
          />
        )}

        {activePortal === "kiosk" && (
          <KioskLayout userContext={userContext} />
        )}
      </main>
    </div>
  );
};

