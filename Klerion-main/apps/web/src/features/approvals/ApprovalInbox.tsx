import React, { useState } from "react";
import {
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  HelpCircle,
  RefreshCw,
  Search,
  Filter,
  Shield,
  FileText,
  UserPlus,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  X,
  Plus,
  MessageSquare,
  History,
  CornerUpLeft,
} from "lucide-react";

import {
  useApprovalInbox,
  useApproval,
  useApprovalHistory,
  useApprove,
  useReject,
  useDelegate,
  useRequestInfo,
  useResume,
  useCancel,
  approvalsApi,
  ApprovalStatusJSON,
  ApprovalRequestJSON,
} from "./api.js";

export function ApprovalInbox() {
  const [selectedStatus, setSelectedStatus] = useState<ApprovalStatusJSON | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [onlyInbox, setOnlyInbox] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);

  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);

  // Form states for actions inside drawer
  const [actionComment, setActionComment] = useState<string>("");
  const [actionReason, setActionReason] = useState<string>("");
  const [delegateUser, setDelegateUser] = useState<string>("");
  const [infoQuestion, setInfoQuestion] = useState<string>("");
  const [activeAction, setActiveAction] = useState<"APPROVE" | "REJECT" | "DELEGATE" | "REQUEST_INFO" | "RESUME" | "CANCEL" | null>(null);

  // Form state for creation modal
  const [newTitle, setNewTitle] = useState<string>("");
  const [newDescription, setNewDescription] = useState<string>("");
  const [newAssignee, setNewAssignee] = useState<string>("bob");

  // Fetch inbox data
  const { data, loading, error, refetch } = useApprovalInbox({
    status: selectedStatus === "ALL" ? undefined : selectedStatus,
    search: searchQuery,
    inbox: onlyInbox,
    page,
    limit: pageSize,
  });

  // Fetch selected approval details & history
  const { approval, loading: loadingApproval, refetch: refetchApproval } = useApproval(selectedApprovalId);
  const { history, loading: loadingHistory, refetch: refetchHistory } = useApprovalHistory(selectedApprovalId);

  // Action hooks
  const { execute: approveReq, loading: approving } = useApprove();
  const { execute: rejectReq, loading: rejecting } = useReject();
  const { execute: delegateReq, loading: delegating } = useDelegate();
  const { execute: requestInfoReq, loading: requestingInfo } = useRequestInfo();
  const { execute: resumeReq, loading: resuming } = useResume();
  const { execute: cancelReq, loading: cancelling } = useCancel();

  const handleCreateApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await approvalsApi.createApproval({
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        steps: [
          {
            name: "Initial Review Gate",
            assignedUserIds: [newAssignee.trim() || "user-1"],
            requiredApproversCount: 1,
          },
        ],
      });
      setShowCreateModal(false);
      setNewTitle("");
      setNewDescription("");
      refetch();
    } catch (err) {
      alert((err as Error).message || "Failed to create approval request");
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedApprovalId || !activeAction) return;

    try {
      if (activeAction === "APPROVE") {
        await approveReq(selectedApprovalId, { comment: actionComment });
      } else if (activeAction === "REJECT") {
        await rejectReq(selectedApprovalId, { comment: actionComment, reason: actionReason });
      } else if (activeAction === "DELEGATE") {
        await delegateReq(selectedApprovalId, { targetUserId: delegateUser, comment: actionComment });
      } else if (activeAction === "REQUEST_INFO") {
        await requestInfoReq(selectedApprovalId, { question: infoQuestion, targetUserId: delegateUser || undefined });
      } else if (activeAction === "RESUME") {
        await resumeReq(selectedApprovalId, { comment: actionComment });
      } else if (activeAction === "CANCEL") {
        await cancelReq(selectedApprovalId, { reason: actionReason });
      }

      // Reset action modal state & refetch
      setActiveAction(null);
      setActionComment("");
      setActionReason("");
      setDelegateUser("");
      setInfoQuestion("");
      refetch();
      refetchApproval();
      refetchHistory();
    } catch (err) {
      alert((err as Error).message || "Action failed");
    }
  };

  const getStatusBadge = (status: ApprovalStatusJSON) => {
    switch (status) {
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <CheckCircle className="w-3.5 h-3.5" /> Approved
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-800/60">
            <XCircle className="w-3.5 h-3.5" /> Rejected
          </span>
        );
      case "IN_PROGRESS":
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60">
            <Clock className="w-3.5 h-3.5" /> Pending
          </span>
        );
      case "DELEGATED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-400 border border-purple-800/60">
            <UserCheck className="w-3.5 h-3.5" /> Delegated
          </span>
        );
      case "MORE_INFO_REQUESTED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
            <HelpCircle className="w-3.5 h-3.5" /> More Info Requested
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <X className="w-3.5 h-3.5" /> Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div id="unified-approval-inbox" className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl">
        <div>
          <h2 id="approval-inbox-title" className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" /> Unified Approval Inbox
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage multi-step human task approvals, delegation gates, and enterprise workflow governance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="btn-refresh-inbox"
            onClick={() => refetch()}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            id="btn-create-approval"
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-colors"
          >
            <Plus className="w-4 h-4" /> New Approval Request
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              id="input-approval-search"
              type="text"
              placeholder="Search by request title or description..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Toggle Inbox Scope */}
          <div className="flex items-center gap-2">
            <button
              id="btn-toggle-my-inbox"
              onClick={() => {
                setOnlyInbox(true);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                onlyInbox
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
              }`}
            >
              My Assigned Inbox
            </button>
            <button
              id="btn-toggle-all-requests"
              onClick={() => {
                setOnlyInbox(false);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !onlyInbox
                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40"
                  : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-white"
              }`}
            >
              All Tenant Requests
            </button>
          </div>
        </div>

        {/* Status Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 border-t border-slate-800/80">
          <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Status:
          </span>
          {(["ALL", "IN_PROGRESS", "APPROVED", "REJECTED", "MORE_INFO_REQUESTED", "DELEGATED", "CANCELLED"] as const).map((st) => (
            <button
              key={st}
              id={`filter-status-${st}`}
              onClick={() => {
                setSelectedStatus(st);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedStatus === st
                  ? "bg-slate-700 text-white border border-slate-600"
                  : "bg-slate-950 text-slate-400 border border-slate-800/80 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {st === "ALL" ? "All Requests" : st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table / Mobile Cards View */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 space-y-4">
            <div className="h-4 bg-slate-800 rounded animate-pulse w-1/3"></div>
            <div className="h-10 bg-slate-800/60 rounded animate-pulse"></div>
            <div className="h-10 bg-slate-800/60 rounded animate-pulse"></div>
            <div className="h-10 bg-slate-800/60 rounded animate-pulse"></div>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm text-rose-300 font-medium">{error}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-1.5 rounded-lg bg-slate-800 text-xs text-white border border-slate-700"
            >
              Retry
            </button>
          </div>
        ) : !data || data.approvals.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <FileText className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-base font-semibold text-slate-300">No approval requests found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery
                ? `No requests match "${searchQuery}". Try clearing your search query.`
                : "There are no pending or historic approval tasks in this scope."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Title & Description</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Current Step</th>
                    <th className="py-3.5 px-4">Requester</th>
                    <th className="py-3.5 px-4">Created</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                  {data.approvals.map((req) => {
                    const currentStep = req.steps[req.currentStepIndex] || req.steps[req.steps.length - 1];
                    return (
                      <tr
                        key={req.id}
                        id={`approval-row-${req.id}`}
                        className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                          selectedApprovalId === req.id ? "bg-indigo-950/20" : ""
                        }`}
                        onClick={() => setSelectedApprovalId(req.id)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-white">{req.title}</div>
                          {req.description && (
                            <div className="text-[11px] text-slate-400 line-clamp-1">{req.description}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">{getStatusBadge(req.status)}</td>
                        <td className="py-3.5 px-4">
                          <span className="font-medium text-slate-200">
                            {currentStep ? currentStep.name : "N/A"}
                          </span>
                          <div className="text-[10px] text-slate-500">
                            Step {req.currentStepIndex + 1} of {req.steps.length}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                          {req.requesterUserId}
                        </td>
                        <td className="py-3.5 px-4 text-[11px] text-slate-400">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            id={`btn-inspect-${req.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApprovalId(req.id);
                            }}
                            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[11px] font-medium border border-slate-700 inline-flex items-center gap-1"
                          >
                            Details <ChevronRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-800/60">
              {data.approvals.map((req) => (
                <div
                  key={req.id}
                  id={`mobile-card-${req.id}`}
                  onClick={() => setSelectedApprovalId(req.id)}
                  className="p-4 space-y-3 hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-white text-sm">{req.title}</div>
                    {getStatusBadge(req.status)}
                  </div>
                  {req.description && (
                    <p className="text-xs text-slate-400 line-clamp-2">{req.description}</p>
                  )}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                    <span>Req: {req.requesterUserId}</span>
                    <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Showing <span className="font-semibold text-white">{data.approvals.length}</span> of{" "}
                <span className="font-semibold text-white">{data.total}</span> requests
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="btn-prev-page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-medium text-slate-300">
                  Page {data.page} of {data.totalPages}
                </span>
                <button
                  id="btn-next-page"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  className="p-1.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Approval Details Drawer */}
      {selectedApprovalId && (
        <div id="approval-details-drawer" className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-500">{selectedApprovalId}</span>
                  {approval && getStatusBadge(approval.status)}
                </div>
                <h3 className="text-lg font-bold text-white">{approval?.title || "Approval Details"}</h3>
              </div>
              <button
                id="btn-close-drawer"
                onClick={() => setSelectedApprovalId(null)}
                className="p-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingApproval ? (
                <div className="p-8 space-y-3">
                  <div className="h-6 bg-slate-800 rounded animate-pulse w-1/2"></div>
                  <div className="h-20 bg-slate-800/60 rounded animate-pulse"></div>
                </div>
              ) : approval ? (
                <>
                  {/* Summary Box */}
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Request Overview</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {approval.description || "No description provided."}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800/80">
                      <div>
                        <span className="text-slate-500">Requester:</span>{" "}
                        <span className="font-mono text-slate-200">{approval.requesterUserId}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Workflow Instance:</span>{" "}
                        <span className="font-mono text-slate-200">{approval.workflowInstanceId || "Independent"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Multi-Step Chain Visualizer */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-indigo-400" /> Approval Chain Pipeline
                    </h4>
                    <div className="space-y-3">
                      {approval.steps.map((step, idx) => {
                        const isCurrent = idx === approval.currentStepIndex && approval.status === "IN_PROGRESS";
                        return (
                          <div
                            key={step.id || idx}
                            className={`p-4 rounded-xl border transition-all ${
                              isCurrent
                                ? "bg-indigo-950/20 border-indigo-500/50 shadow-md shadow-indigo-500/10"
                                : "bg-slate-950 border-slate-800"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-bold text-white flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-300">
                                  {idx + 1}
                                </span>
                                {step.name}
                              </span>
                              {getStatusBadge(step.status)}
                            </div>
                            <div className="text-[11px] text-slate-400 space-y-1 pl-7">
                              <div>
                                Assigned Approvers:{" "}
                                <span className="font-mono text-slate-300">
                                  {step.assignedUserIds?.join(", ") || "Unassigned"}
                                </span>
                              </div>
                              {step.decisions && step.decisions.length > 0 && (
                                <div className="pt-2 border-t border-slate-800/60 space-y-1">
                                  <span className="text-slate-500 font-semibold">Decisions logged:</span>
                                  {step.decisions.map((dec) => (
                                    <div key={dec.id} className="bg-slate-900/80 p-2 rounded border border-slate-800 text-[11px]">
                                      <div className="flex items-center justify-between text-slate-300 font-medium">
                                        <span>
                                          {dec.actorUserId} ({dec.action})
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                          {new Date(dec.decidedAt).toLocaleTimeString()}
                                        </span>
                                      </div>
                                      {dec.comment && <p className="text-slate-400 mt-0.5 font-sans">"{dec.comment}"</p>}
                                      {dec.question && <p className="text-cyan-400 mt-0.5">Q: {dec.question}</p>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Audit Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-cyan-400" /> Audit Lineage Timeline
                    </h4>
                    {loadingHistory ? (
                      <div className="h-12 bg-slate-950 rounded animate-pulse"></div>
                    ) : history && history.auditTimeline ? (
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                        {history.auditTimeline.length === 0 ? (
                          <div className="text-xs text-slate-500">No audit events recorded yet.</div>
                        ) : (
                          history.auditTimeline.map((log) => (
                            <div key={log.id} className="flex items-start gap-2 text-xs">
                              <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5"></span>
                              <div>
                                <div className="font-mono text-slate-300 font-semibold">{log.action}</div>
                                <div className="text-[10px] text-slate-500">
                                  {new Date(log.timestamp).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            {/* Drawer Action Bar */}
            {approval && (
              <div className="p-5 border-t border-slate-800 bg-slate-950 space-y-3">
                {activeAction ? (
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between font-bold text-xs text-white">
                      <span>Action: {activeAction.replace("_", " ")}</span>
                      <button onClick={() => setActiveAction(null)} className="text-slate-400 hover:text-white">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {(activeAction === "APPROVE" || activeAction === "REJECT" || activeAction === "DELEGATE" || activeAction === "RESUME") && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Comment</label>
                        <input
                          type="text"
                          placeholder="Add optional comment..."
                          value={actionComment}
                          onChange={(e) => setActionComment(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-white focus:outline-none"
                        />
                      </div>
                    )}

                    {(activeAction === "REJECT" || activeAction === "CANCEL") && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Reason</label>
                        <input
                          type="text"
                          placeholder="Provide specific reason..."
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-white focus:outline-none"
                        />
                      </div>
                    )}

                    {activeAction === "DELEGATE" && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Target User ID</label>
                        <input
                          type="text"
                          placeholder="Target user ID (e.g. david)..."
                          value={delegateUser}
                          onChange={(e) => setDelegateUser(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-white focus:outline-none"
                        />
                      </div>
                    )}

                    {activeAction === "REQUEST_INFO" && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Question / Detail Requested</label>
                        <textarea
                          rows={2}
                          placeholder="What additional info is needed?"
                          value={infoQuestion}
                          onChange={(e) => setInfoQuestion(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded text-white focus:outline-none"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => setActiveAction(null)}
                        className="px-3 py-1 rounded text-xs bg-slate-800 text-slate-300"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleExecuteAction}
                        disabled={approving || rejecting || delegating || requestingInfo || resuming || cancelling}
                        className="px-4 py-1.5 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow"
                      >
                        Submit Action
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {approval.status === "IN_PROGRESS" || approval.status === "PENDING" ? (
                      <>
                        <button
                          id="btn-drawer-approve"
                          onClick={() => setActiveAction("APPROVE")}
                          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
                        >
                          <CheckCircle className="w-4 h-4" /> Approve
                        </button>
                        <button
                          id="btn-drawer-reject"
                          onClick={() => setActiveAction("REJECT")}
                          className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
                        >
                          <XCircle className="w-4 h-4" /> Reject
                        </button>
                        <button
                          id="btn-drawer-delegate"
                          onClick={() => setActiveAction("DELEGATE")}
                          className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <UserPlus className="w-4 h-4" /> Delegate
                        </button>
                        <button
                          id="btn-drawer-request-info"
                          onClick={() => setActiveAction("REQUEST_INFO")}
                          className="px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-semibold flex items-center gap-1.5"
                        >
                          <MessageSquare className="w-4 h-4" /> Request Info
                        </button>
                      </>
                    ) : null}

                    {approval.status === "MORE_INFO_REQUESTED" && (
                      <button
                        id="btn-drawer-resume"
                        onClick={() => setActiveAction("RESUME")}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <CornerUpLeft className="w-4 h-4" /> Respond & Resume
                      </button>
                    )}

                    {approval.status !== "CANCELLED" && approval.status !== "APPROVED" && approval.status !== "REJECTED" && (
                      <button
                        id="btn-drawer-cancel"
                        onClick={() => setActiveAction("CANCEL")}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Create Approval Request */}
      {showCreateModal && (
        <div id="modal-create-approval" className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" /> New Approval Request
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateApproval} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Title *</label>
                <input
                  id="input-create-approval-title"
                  type="text"
                  required
                  placeholder="e.g. AWS Cloud Infrastructure Expansion"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  id="input-create-approval-description"
                  rows={3}
                  placeholder="Details regarding budget, rationale, or impact..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Assignee User ID</label>
                <input
                  id="input-create-approval-assignee"
                  type="text"
                  placeholder="e.g. bob"
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-create-approval"
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30"
                >
                  Create Approval Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
