import React, { useState } from "react";
import {
  ServiceTicket,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  SLAStatus,
} from "../../../../modules/domains/internal-services/src/index.js";
import {
  fetchTicketDetail,
  assignTicket,
  updateTicketStatus,
  updateTicketPriority,
  addAgentComment,
  triggerSLACheck,
  useAgentWorkspace,
} from "./api.js";
import {
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Search,
  Filter,
  RefreshCw,
  User,
  MessageSquare,
  Lock,
  Tag,
  ArrowUpDown,
  Send,
  Zap,
} from "lucide-react";

export function AgentWorkspace() {
  // Filters state
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "">("");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "">("");
  const [slaFilter, setSlaFilter] = useState<SLAStatus | "">("");
  const [searchQuery, setSearchQuery] = useState("");

  const { tickets, metrics, loading, error, reload } = useAgentWorkspace({
    status: statusFilter || undefined,
    priority: priorityFilter || undefined,
    search: searchQuery || undefined,
  });

  // Active Ticket Drawer state
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assigneeInput, setAssigneeInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [resolutionInput, setResolutionInput] = useState("");
  const [showResolveModal, setShowResolveModal] = useState(false);

  // Open ticket detail drawer
  const handleOpenDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const ticket = await fetchTicketDetail(id);
      setSelectedTicket(ticket);
      setAssigneeInput(ticket.assignedUserId || "");
      setTeamInput(ticket.assignedTeamId || "");
    } catch (err: any) {
      alert(`Failed to load ticket detail: ${err.message}`);
    } finally {
      setDetailLoading(false);
    }
  };

  // Assign to Me / Reassign
  const handleAssign = async (assignee?: string, team?: string) => {
    if (!selectedTicket) return;
    try {
      const updated = await assignTicket(selectedTicket.id, assignee || "agent-smith-1", team);
      setSelectedTicket(updated);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Update Status
  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!selectedTicket) return;
    if (newStatus === "RESOLVED") {
      setShowResolveModal(true);
      return;
    }
    try {
      const updated = await updateTicketStatus(selectedTicket.id, newStatus);
      setSelectedTicket(updated);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Confirm Resolve
  const handleConfirmResolve = async () => {
    if (!selectedTicket || !resolutionInput.trim()) return;
    try {
      const updated = await updateTicketStatus(selectedTicket.id, "RESOLVED", undefined, resolutionInput);
      setSelectedTicket(updated);
      setShowResolveModal(false);
      setResolutionInput("");
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Priority Change
  const handlePriorityChange = async (newPriority: TicketPriority) => {
    if (!selectedTicket) return;
    try {
      const updated = await updateTicketPriority(selectedTicket.id, newPriority, "Updated by Agent");
      setSelectedTicket(updated);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Add Comment / Internal Note
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentInput.trim()) return;
    try {
      const updated = await addAgentComment(selectedTicket.id, commentInput, isInternalNote);
      setSelectedTicket(updated);
      setCommentInput("");
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // SLA Expiration Check
  const handleRunSLACheck = async () => {
    try {
      const result = await triggerSLACheck();
      alert(`SLA Evaluation Complete: ${result.warningCount} warning(s), ${result.breachedCount} breach(es) detected.`);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            Agent Service Desk Workspace
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Manage incoming IT, HR, and Operations ticket queues, enforce SLA resolution windows & track escalations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunSLACheck}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-700 transition-colors"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            Run SLA Evaluation
          </button>
          <button
            onClick={() => reload()}
            className="p-2 text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 border border-slate-200 dark:border-slate-800 rounded-lg"
            title="Refresh workspace"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* DASHBOARD METRICS SUMMARY CARDS */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
            <div className="text-xs text-slate-500 font-medium">Total Tickets</div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              {metrics.totalTickets}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> Open / New
            </div>
            <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              {metrics.openTickets}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
            <div className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Unassigned
            </div>
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              {metrics.unassignedTickets}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
            <div className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> SLA At Risk
            </div>
            <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
              {metrics.slaBreachedTickets + metrics.slaWarningTickets}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
            <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Urgent Priority</div>
            <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
              {metrics.urgentTickets}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
            <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Resolved
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
              {metrics.resolvedTickets}
            </div>
          </div>
        </div>
      )}

      {/* FILTER & SEARCH CONTROL BAR */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-3 justify-between items-center shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by title, requester, or number..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Triage Filters:
          </span>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TicketStatus | "")}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
          >
            <option value="">All Statuses</option>
            <option value="NEW">New</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING_USER">Pending User</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | "")}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
          >
            <option value="">All Priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as TicketCategory | "")}
            className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
          >
            <option value="">All Categories</option>
            <option value="IT_SUPPORT">IT Support</option>
            <option value="HR_REQUEST">HR</option>
            <option value="FACILITIES">Facilities</option>
            <option value="FINANCE">Finance</option>
            <option value="ACCESS_CONTROL">Access Control</option>
            <option value="GENERAL">General</option>
          </select>
        </div>
      </div>

      {/* TICKET QUEUE TABLE */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
          Loading Service Desk Queue...
        </div>
      ) : error ? (
        <div className="p-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl">
          {error}
        </div>
      ) : tickets.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 space-y-2">
          <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto" />
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Queue is empty</div>
          <p className="text-xs">No service tickets match your active filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="p-3.5">Ticket #</th>
                  <th className="p-3.5">Requester</th>
                  <th className="p-3.5">Title & Category</th>
                  <th className="p-3.5">Priority</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Assignee</th>
                  <th className="p-3.5">SLA Window</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => handleOpenDetail(t.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      {t.ticketNumber}
                    </td>

                    <td className="p-3.5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {t.requesterName || t.requesterUserId}
                      </div>
                      <div className="text-[11px] text-slate-400">{t.requesterUserId}</div>
                    </td>

                    <td className="p-3.5 max-w-xs">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">
                        {t.title}
                      </div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {t.category.replace("_", " ")}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          t.priority === "URGENT"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                            : t.priority === "HIGH"
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        }`}
                      >
                        {t.priority}
                      </span>
                    </td>

                    <td className="p-3.5 font-medium">{t.status}</td>

                    <td className="p-3.5">
                      {t.assignedUserId ? (
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{t.assignedUserId}</span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold italic">Unassigned</span>
                      )}
                    </td>

                    <td className="p-3.5">
                      {t.slaStatus === "BREACHED" ? (
                        <span className="text-rose-600 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> SLA Breached
                        </span>
                      ) : t.slaStatus === "WARNING" ? (
                        <span className="text-amber-600 font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3" /> SLA Warning
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-medium">On Track</span>
                      )}
                    </td>

                    <td className="p-3.5 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDetail(t.id);
                        }}
                        className="px-2.5 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 rounded text-xs font-semibold"
                      >
                        Triage &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TICKET DETAIL AGENT DRAWER */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end p-0 sm:p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-3xl h-full sm:h-auto sm:max-h-[95vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            {/* DRAWER HEADER */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-sm text-indigo-600 dark:text-indigo-400">
                    {selectedTicket.ticketNumber}
                  </span>
                  <span className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-bold text-slate-800 dark:text-white">
                    {selectedTicket.status}
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded text-xs font-semibold">
                    {selectedTicket.category}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedTicket.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg text-lg"
              >
                &times;
              </button>
            </div>

            {/* DRAWER BODY */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* CONTROL TOOLBAR: Assignment, Status, Priority */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* ASSIGNMENT */}
                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Assigned Agent</label>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleAssign("agent-smith-1")}
                        className="px-2.5 py-1.5 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700 text-xs"
                      >
                        Assign to Me
                      </button>
                    </div>
                  </div>

                  {/* STATUS */}
                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Status Transition</label>
                    <select
                      value={selectedTicket.status}
                      onChange={(e) => handleStatusChange(e.target.value as TicketStatus)}
                      className="w-full p-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="NEW">NEW</option>
                      <option value="OPEN">OPEN</option>
                      <option value="IN_PROGRESS">IN PROGRESS</option>
                      <option value="PENDING_USER">PENDING USER</option>
                      <option value="RESOLVED">RESOLVED</option>
                      <option value="CLOSED">CLOSED</option>
                    </select>
                  </div>

                  {/* PRIORITY */}
                  <div>
                    <label className="block text-slate-500 font-semibold mb-1">Priority Level</label>
                    <select
                      value={selectedTicket.priority}
                      onChange={(e) => handlePriorityChange(e.target.value as TicketPriority)}
                      className="w-full p-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* TICKET DESCRIPTION & REQUESTER Context */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500 border-b border-slate-100 dark:border-slate-800 pb-2">
                  <span>Requester: <strong className="text-slate-900 dark:text-white">{selectedTicket.requesterName || selectedTicket.requesterUserId}</strong></span>
                  <span>Created: <strong className="text-slate-900 dark:text-white">{new Date(selectedTicket.createdAt).toLocaleString()}</strong></span>
                </div>
                <div className="text-slate-800 dark:text-slate-200 text-sm leading-relaxed pt-1">
                  {selectedTicket.description || "No description provided."}
                </div>
              </div>

              {/* COMMENTS & INTERNAL AGENT NOTES FEED */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Communication Feed ({selectedTicket.comments.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(false)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold ${
                        !isInternalNote
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Public Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInternalNote(true)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1 ${
                        isInternalNote
                          ? "bg-amber-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <Lock className="w-3 h-3" /> Internal Note
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedTicket.comments.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No notes or comments yet.</p>
                  ) : (
                    selectedTicket.comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`p-3 rounded-lg border text-xs space-y-1 ${
                          comment.isInternal
                            ? "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200"
                            : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        }`}
                      >
                        <div className="flex justify-between items-center text-[11px] opacity-75 font-semibold">
                          <span>
                            {comment.authorName || comment.authorUserId}{" "}
                            {comment.isInternal ? "(Internal Note)" : "(Public Reply)"}
                          </span>
                          <span>{new Date(comment.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p>{comment.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* ADD COMMENT FORM */}
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder={
                      isInternalNote
                        ? "Write internal agent note (hidden from employee)..."
                        : "Type public response to employee..."
                    }
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="submit"
                    className={`px-3 py-2 text-white rounded-lg text-xs font-semibold flex items-center gap-1 ${
                      isInternalNote ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" /> {isInternalNote ? "Add Note" : "Send Reply"}
                  </button>
                </form>
              </div>

              {/* AUDIT TIMELINE */}
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Audit History Timeline ({selectedTicket.timeline.length})
                </h3>
                <div className="space-y-2">
                  {selectedTicket.timeline.map((evt) => (
                    <div key={evt.id} className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{evt.eventType}: </span>
                        {evt.description}
                        <span className="text-[10px] text-slate-400 ml-2">
                          ({new Date(evt.timestamp).toLocaleTimeString()})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* DRAWER FOOTER */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
              <button
                onClick={() => setSelectedTicket(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white rounded-lg hover:bg-slate-300"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESOLVE REASON MODAL */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Resolve Ticket</h3>
            <p className="text-xs text-slate-500">
              Provide mandatory resolution notes detailing how the request was fulfilled.
            </p>
            <textarea
              rows={3}
              value={resolutionInput}
              onChange={(e) => setResolutionInput(e.target.value)}
              placeholder="e.g. Configured new VPN account and verified login..."
              className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowResolveModal(false)}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResolve}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Confirm Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
