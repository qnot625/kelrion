import React, { useState } from "react";
import {
  ServiceTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "../../../../modules/domains/internal-services/src/index.js";
import {
  fetchMyRequests,
  fetchRequestById,
  createServiceRequest,
  saveDraftRequest,
  submitDraftRequest,
  addPublicComment,
  addRequestAttachment,
  cancelServiceRequest,
  useMyRequests,
} from "./api.js";
import {
  Laptop,
  Users,
  Building2,
  CreditCard,
  KeyRound,
  HelpCircle,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Send,
  Paperclip,
  ArrowLeft,
  Filter,
  RefreshCw,
} from "lucide-react";

interface CategoryMeta {
  key: TicketCategory;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    key: "IT_SUPPORT",
    label: "IT Support & Hardware",
    description: "Laptops, monitors, software installation, Wi-Fi, peripherals",
    icon: Laptop,
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  },
  {
    key: "HR_REQUEST",
    label: "HR & Onboarding",
    description: "Benefits, payroll inquiries, leave requests, employee policy",
    icon: Users,
    color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800",
  },
  {
    key: "FACILITIES",
    label: "Facilities & Office",
    description: "Desk allocation, badge keycards, repairs, HVAC, physical security",
    icon: Building2,
    color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
  {
    key: "FINANCE",
    label: "Finance & Expenses",
    description: "Corporate cards, reimbursements, purchase orders, budget queries",
    icon: CreditCard,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  {
    key: "ACCESS_CONTROL",
    label: "Access & Security",
    description: "VPN access, database permissions, system roles, SSO login issues",
    icon: KeyRound,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  },
  {
    key: "GENERAL",
    label: "General Inquiry",
    description: "Other administrative requests, feedback, or general questions",
    icon: HelpCircle,
    color: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800",
  },
];

export function ServicePortal() {
  const [activeTab, setActiveTab] = useState<"catalog" | "my_requests" | "wizard">("catalog");
  const [selectedCategory, setSelectedCategory] = useState<TicketCategory | null>(null);

  // Filter state for My Requests
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "">("");

  // Hook for requests list
  const { requests, total, loading, error, reload } = useMyRequests({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    search: searchQuery || undefined,
  });

  // Wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [wizardTitle, setWizardTitle] = useState("");
  const [wizardDesc, setWizardDesc] = useState("");
  const [wizardPriority, setWizardPriority] = useState<TicketPriority>("MEDIUM");
  const [wizardCategory, setWizardCategory] = useState<TicketCategory>("IT_SUPPORT");
  const [wizardCustomField, setWizardCustomField] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // Request detail modal state
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [fileNameInput, setFileNameInput] = useState("");
  const [fileUrlInput, setFileUrlInput] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Start new request wizard
  const startWizard = (cat?: TicketCategory) => {
    setWizardCategory(cat || "IT_SUPPORT");
    setWizardTitle("");
    setWizardDesc("");
    setWizardPriority("MEDIUM");
    setWizardCustomField("");
    setWizardStep(1);
    setWizardError(null);
    setActiveTab("wizard");
  };

  // Submit new request
  const handleWizardSubmit = async (isDraft: boolean) => {
    if (!wizardTitle.trim()) {
      setWizardError("Title is required");
      return;
    }
    setIsSubmitting(true);
    setWizardError(null);
    try {
      if (isDraft) {
        await saveDraftRequest({
          title: wizardTitle,
          description: wizardDesc,
          category: wizardCategory,
          priority: wizardPriority,
        });
      } else {
        await createServiceRequest({
          title: wizardTitle,
          description: wizardDesc,
          category: wizardCategory,
          priority: wizardPriority,
          customFields: wizardCustomField ? { additionalContext: wizardCustomField } : undefined,
        });
      }
      await reload();
      setActiveTab("my_requests");
    } catch (err: any) {
      setWizardError(err.message || "Failed to process request");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open ticket detail
  const handleOpenTicketDetail = async (ticketId: string) => {
    setDetailLoading(true);
    try {
      const fullTicket = await fetchRequestById(ticketId);
      setSelectedTicket(fullTicket);
    } catch (err: any) {
      alert(`Error loading ticket: ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  // Add comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentInput.trim()) return;
    try {
      const updated = await addPublicComment(selectedTicket.id, commentInput);
      setSelectedTicket(updated);
      setCommentInput("");
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Add attachment
  const handleAddAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !fileNameInput.trim() || !fileUrlInput.trim()) return;
    try {
      const updated = await addRequestAttachment(selectedTicket.id, fileNameInput, fileUrlInput, 2048);
      setSelectedTicket(updated);
      setFileNameInput("");
      setFileUrlInput("");
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Submit draft ticket from detail view
  const handleSubmitDraft = async (ticketId: string) => {
    try {
      const updated = await submitDraftRequest(ticketId);
      setSelectedTicket(updated);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Cancel request
  const handleCancelRequest = async () => {
    if (!selectedTicket) return;
    try {
      const updated = await cancelServiceRequest(selectedTicket.id, cancelReason || "Cancelled by employee");
      setSelectedTicket(updated);
      setShowCancelModal(false);
      setCancelReason("");
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status: TicketStatus) => {
    switch (status) {
      case "DRAFT":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"><Clock className="w-3 h-3" /> Draft</span>;
      case "NEW":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200"><AlertCircle className="w-3 h-3" /> Submitted</span>;
      case "OPEN":
      case "IN_PROGRESS":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"><Clock className="w-3 h-3" /> In Progress</span>;
      case "PENDING_USER":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200"><AlertCircle className="w-3 h-3" /> Action Needed</span>;
      case "RESOLVED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"><CheckCircle2 className="w-3 h-3" /> Resolved</span>;
      case "CLOSED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"><CheckCircle2 className="w-3 h-3" /> Closed</span>;
      case "CANCELLED":
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200"><XCircle className="w-3 h-3" /> Cancelled</span>;
      default:
        return null;
    }
  };

  // Render Priority Badge
  const renderPriorityBadge = (priority: TicketPriority) => {
    switch (priority) {
      case "URGENT":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800">URGENT</span>;
      case "HIGH":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800">HIGH</span>;
      case "MEDIUM":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800">MEDIUM</span>;
      case "LOW":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400">LOW</span>;
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <HelpCircle className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Employee Service Portal
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Submit IT support requests, HR inquiries, equipment orders & track ticket status in real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => startWizard()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "catalog"
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          Service Catalog
        </button>
        <button
          onClick={() => setActiveTab("my_requests")}
          className={`pb-3 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === "my_requests"
              ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
              : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          My Requests
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {total}
          </span>
        </button>
        {activeTab === "wizard" && (
          <button
            onClick={() => setActiveTab("wizard")}
            className="pb-3 text-sm font-medium border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400"
          >
            Request Creation Wizard
          </button>
        )}
      </div>

      {/* TAB 1: SERVICE CATALOG */}
      {activeTab === "catalog" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-slate-900 dark:to-indigo-950/40 p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">How can we help you today?</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Select a service category below to start a formal request. Automated SLA timelines and agent routing will be applied automatically.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CATEGORIES.map((cat) => {
              const IconComp = cat.icon;
              return (
                <div
                  key={cat.key}
                  onClick={() => startWizard(cat.key)}
                  className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center border ${cat.color}`}>
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {cat.label}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                        {cat.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                    Create Request &rarr;
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: MY REQUESTS */}
      {activeTab === "my_requests" && (
        <div className="space-y-5">
          {/* SEARCH & FILTERS BAR */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-3 justify-between items-center shadow-sm">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search requests by title or number..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <Filter className="w-3.5 h-3.5" /> Filters:
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TicketStatus | "")}
                className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="NEW">Submitted</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PENDING_USER">Pending User</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as TicketCategory | "")}
                className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => reload()}
                className="p-1.5 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                title="Refresh requests"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* REQUESTS LIST / STATES */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
              Loading your requests...
            </div>
          ) : error ? (
            <div className="p-6 text-center text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl">
              <AlertCircle className="w-6 h-6 mx-auto mb-2" />
              {error}
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <FileText className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">No requests found</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                You haven't created any service requests yet or no requests match your search criteria.
              </p>
              <button
                onClick={() => startWizard()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> Create Request
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => handleOpenTicketDetail(ticket.id)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 p-4 rounded-xl shadow-sm transition-all cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                        {ticket.ticketNumber}
                      </span>
                      {renderStatusBadge(ticket.status)}
                      {renderPriorityBadge(ticket.priority)}
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                        {ticket.category.replace("_", " ")}
                      </span>
                    </div>

                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                      {ticket.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                      {ticket.description || "No description provided."}
                    </p>
                  </div>

                  <div className="text-right flex md:flex-col items-center md:items-end justify-between w-full md:w-auto text-xs text-slate-500 dark:text-slate-400 border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 dark:border-slate-800">
                    <div>
                      Created: {new Date(ticket.createdAt).toLocaleDateString()}
                    </div>
                    {ticket.dueAt && (
                      <div className="text-indigo-600 dark:text-indigo-400 font-medium">
                        SLA Due: {new Date(ticket.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REQUEST CREATION WIZARD */}
      {activeTab === "wizard" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Request Creation Wizard</h2>
              <p className="text-xs text-slate-500 mt-0.5">Step {wizardStep} of 3</p>
            </div>
            <button
              onClick={() => setActiveTab("catalog")}
              className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Catalog
            </button>
          </div>

          {/* STEP INDICATOR */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`h-2 rounded-full ${wizardStep >= 1 ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-800"}`} />
            <div className={`h-2 rounded-full ${wizardStep >= 2 ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-800"}`} />
            <div className={`h-2 rounded-full ${wizardStep >= 3 ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-800"}`} />
          </div>

          {wizardError && (
            <div className="p-3 text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg">
              {wizardError}
            </div>
          )}

          {/* STEP 1: CATEGORY & TITLE */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Service Category
                </label>
                <select
                  value={wizardCategory}
                  onChange={(e) => setWizardCategory(e.target.value as TicketCategory)}
                  className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Request Summary / Title *
                </label>
                <input
                  type="text"
                  value={wizardTitle}
                  onChange={(e) => setWizardTitle(e.target.value)}
                  placeholder="e.g., Replacement developer laptop charger"
                  className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Urgency / Priority
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(["LOW", "MEDIUM", "HIGH", "URGENT"] as TicketPriority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setWizardPriority(p)}
                      className={`p-2.5 text-xs font-semibold rounded-lg border text-center transition-all ${
                        wizardPriority === p
                          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shadow-sm"
                          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: DETAILED DESCRIPTION */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Detailed Description & Steps to Reproduce
                </label>
                <textarea
                  rows={5}
                  value={wizardDesc}
                  onChange={(e) => setWizardDesc(e.target.value)}
                  placeholder="Provide complete details, exact error messages, hardware serial numbers, or impact..."
                  className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Additional Notes / Department Code
                </label>
                <input
                  type="text"
                  value={wizardCustomField}
                  onChange={(e) => setWizardCustomField(e.target.value)}
                  placeholder="Cost center or department context..."
                  className="w-full p-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & CONFIRM */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 text-sm">
                <h3 className="font-semibold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2">
                  Review Request Summary
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-slate-500">Category:</span> {wizardCategory}</div>
                  <div><span className="text-slate-500">Priority:</span> {wizardPriority}</div>
                  <div className="col-span-2"><span className="text-slate-500">Title:</span> {wizardTitle}</div>
                  <div className="col-span-2"><span className="text-slate-500">Description:</span> {wizardDesc || "N/A"}</div>
                </div>
              </div>
            </div>
          )}

          {/* WIZARD ACTIONS */}
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
            <div>
              {wizardStep > 1 && (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => (s - 1) as any)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200"
                >
                  Previous
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleWizardSubmit(true)}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Save as Draft
              </button>

              {wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!wizardTitle.trim()) {
                      setWizardError("Title is required before proceeding");
                      return;
                    }
                    setWizardError(null);
                    setWizardStep((s) => (s + 1) as any);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                >
                  Next Step &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleWizardSubmit(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Submit Request
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REQUEST DETAIL MODAL / DRAWER */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            {/* MODAL HEADER */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {selectedTicket.ticketNumber}
                  </span>
                  {renderStatusBadge(selectedTicket.status)}
                  {renderPriorityBadge(selectedTicket.priority)}
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedTicket.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                &times;
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* DETAILS SUMMARY */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Category: <strong className="text-slate-900 dark:text-white">{selectedTicket.category}</strong></span>
                  <span>Submitted: <strong className="text-slate-900 dark:text-white">{new Date(selectedTicket.createdAt).toLocaleString()}</strong></span>
                </div>
                <div className="pt-2 text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
                  {selectedTicket.description || "No description specified."}
                </div>
                {selectedTicket.status === "DRAFT" && (
                  <div className="pt-3 flex justify-end">
                    <button
                      onClick={() => handleSubmitDraft(selectedTicket.id)}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700"
                    >
                      Submit Draft Now
                    </button>
                  </div>
                )}
              </div>

              {/* PUBLIC COMMENTS FEED */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Activity & Communication
                </h3>

                <div className="space-y-3">
                  {selectedTicket.comments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No comments recorded yet.</p>
                  ) : (
                    selectedTicket.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs space-y-1"
                      >
                        <div className="flex justify-between items-center text-slate-500 font-medium">
                          <span>{comment.authorName || comment.authorUserId} ({comment.authorRole || "User"})</span>
                          <span>{new Date(comment.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200">{comment.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* ADD COMMENT FORM */}
                {selectedTicket.status !== "CLOSED" && selectedTicket.status !== "CANCELLED" && (
                  <form onSubmit={handleAddComment} className="flex gap-2">
                    <input
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Type a response to support team..."
                      className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" /> Send
                    </button>
                  </form>
                )}
              </div>

              {/* ATTACHMENTS LIST & FORM */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Attachments ({selectedTicket.attachments.length})
                </h3>

                <div className="space-y-2">
                  {selectedTicket.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-xs border border-slate-200 dark:border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-medium text-slate-800 dark:text-slate-200">{att.fileName}</span>
                      </div>
                      <a
                        href={att.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline"
                      >
                        View File
                      </a>
                    </div>
                  ))}
                </div>

                {selectedTicket.status !== "CLOSED" && selectedTicket.status !== "CANCELLED" && (
                  <form onSubmit={handleAddAttachment} className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                    <input
                      type="text"
                      value={fileNameInput}
                      onChange={(e) => setFileNameInput(e.target.value)}
                      placeholder="File Name (e.g. screenshot.png)"
                      className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                    <input
                      type="text"
                      value={fileUrlInput}
                      onChange={(e) => setFileUrlInput(e.target.value)}
                      placeholder="File URL (https://...)"
                      className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                    >
                      Upload File
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
              {selectedTicket.status !== "CLOSED" && selectedTicket.status !== "CANCELLED" ? (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                >
                  Cancel Request
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg hover:bg-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Cancel Request?</h3>
            <p className="text-xs text-slate-500">
              Please provide a brief reason for cancelling this service request.
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g., Issue resolved independently..."
              className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg"
              >
                Keep Open
              </button>
              <button
                onClick={handleCancelRequest}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
