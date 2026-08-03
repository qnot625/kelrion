import React, { useEffect, useState, useCallback } from "react";
import {
  RefreshCw,
  Send,
  Search,
  Mail,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Info,
  Inbox,
  Loader2,
} from "lucide-react";
import {
  NotificationLog,
  NotificationStatus,
  NotificationChannel,
  UserContext,
} from "../types/queue";
import {
  fetchNotifications,
  sendTestNotification,
  retryNotification,
} from "../api/client";
import { Alert } from "../components/Alert";
import { Modal } from "../components/Modal";

interface NotificationLogsViewProps {
  userContext: UserContext;
}

export const NotificationLogsView: React.FC<NotificationLogsViewProps> = ({ userContext }) => {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pagination & Filtering state
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"createdAt" | "status" | "recipient">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Selected Log detail modal
  const [selectedAuditLog, setSelectedAuditLog] = useState<NotificationLog | null>(null);

  // Send Test modal state
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [testRecipient, setTestRecipient] = useState<string>("");
  const [testChannel, setTestChannel] = useState<NotificationChannel>("email");
  const [testTemplateId, setTestTemplateId] = useState<string>("test_email_template");
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);

  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetchNotifications(userContext, {
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        limit,
        offset: (page - 1) * limit,
      });
      setLogs(res.notifications as NotificationLog[]);
      setTotalCount(res.total);
    } catch (err: any) {
      setError(err.message || "Failed to fetch notification logs");
    } finally {
      setIsLoading(false);
    }
  }, [userContext, page, limit, statusFilter]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleRetry = async (notificationId: string) => {
    try {
      setRetryingId(notificationId);
      setError(null);
      setSuccessMessage(null);
      const updated = await retryNotification(notificationId, userContext);
      setSuccessMessage(`Retry dispatched for Notification #${notificationId.slice(0, 8)}.`);
      setLogs((prev) =>
        prev.map((l) => (l.notificationId === notificationId ? updated : l))
      );
    } catch (err: any) {
      setError(err.message || "Failed to retry notification");
    } finally {
      setRetryingId(null);
    }
  };

  const handleSendTestNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testRecipient.trim()) return;

    try {
      setIsSendingTest(true);
      setError(null);
      setSuccessMessage(null);

      const result = await sendTestNotification(userContext, {
        recipient: testRecipient.trim(),
        channel: testChannel,
        templateId: testTemplateId || undefined,
      });

      setSuccessMessage(`Test notification sent successfully to ${testRecipient}! ID: ${result.notificationId}`);
      setIsTestModalOpen(false);
      setTestRecipient("");
      await loadNotifications();
    } catch (err: any) {
      setError(err.message || "Failed to send test notification");
    } finally {
      setIsSendingTest(false);
    }
  };

  // Local filter & search & sort logic
  const filteredLogs = logs
    .filter((log) => {
      if (channelFilter !== "ALL" && log.channel.toUpperCase() !== channelFilter.toUpperCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const recipientMatch = log.recipient?.toLowerCase().includes(q);
        const templateMatch = log.templateId?.toLowerCase().includes(q);
        const errorMatch = log.lastError?.toLowerCase().includes(q);
        const idMatch = log.notificationId?.toLowerCase().includes(q);
        return recipientMatch || templateMatch || errorMatch || idMatch;
      }
      return true;
    })
    .sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];
      if (sortBy === "createdAt") {
        valA = new Date(a.createdAt).getTime();
        valB = new Date(b.createdAt).getTime();
      }
      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const getStatusBadge = (status: NotificationStatus) => {
    const s = (status || "").toLowerCase();
    switch (s) {
      case "delivered":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Delivered
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800 rounded-full border border-rose-200">
            <XCircle className="h-3 w-3 text-rose-600" />
            Failed
          </span>
        );
      case "retrying":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full border border-amber-200 animate-pulse">
            <RefreshCw className="h-3 w-3 text-amber-600 animate-spin" />
            Retrying
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
            <Clock className="h-3 w-3 text-slate-500" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
            Omnichannel Telemetry & Monitoring
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Notification Delivery Logs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time delivery status, exponential backoff retries, and audit trails across Email & SMS channels.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadNotifications()}
            disabled={isLoading}
            aria-label="Refresh Logs"
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Logs
          </button>

          <button
            onClick={() => setIsTestModalOpen(true)}
            aria-label="Send Test Notification"
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition shadow cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Send className="h-3.5 w-3.5" />
            Send Test Notification
          </button>
        </div>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}
      {successMessage && (
        <Alert
          type="success"
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />
      )}

      {/* Control Bar: Filters, Search & Sorting */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="w-full lg:w-72 relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search recipient, template, error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search Notification Logs"
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filters & Sorting */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Status Filter */}
          <div className="flex items-center gap-1">
            <label htmlFor="status-filter-select" className="text-xs font-bold text-slate-500 uppercase">Status:</label>
            <select
              id="status-filter-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed</option>
              <option value="RETRYING">Retrying</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Channel Filter */}
          <div className="flex items-center gap-1">
            <label htmlFor="channel-filter-select" className="text-xs font-bold text-slate-500 uppercase">Channel:</label>
            <select
              id="channel-filter-select"
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">All Channels</option>
              <option value="EMAIL">Email Only</option>
              <option value="SMS">SMS Only</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1">
            <label htmlFor="sort-by-select" className="text-xs font-bold text-slate-500 uppercase">Sort:</label>
            <select
              id="sort-by-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="p-2 text-xs border border-slate-300 rounded-lg bg-slate-50 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="createdAt">Created Date</option>
              <option value="status">Status</option>
              <option value="recipient">Recipient</option>
            </select>
            <button
              onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
              aria-label="Toggle Sort Order"
              className="p-2 text-xs border border-slate-300 rounded-lg bg-slate-100 font-bold hover:bg-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-400 font-medium space-y-3">
            <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
            <div>Loading notification history...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <Inbox className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">No Notification Logs Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No notifications match your current filter criteria or tenant history is empty. Try clearing search or sending a test notification.
            </p>
            <button
              onClick={() => {
                setStatusFilter("ALL");
                setChannelFilter("ALL");
                setSearchQuery("");
              }}
              className="px-4 py-2 bg-slate-800 text-white font-bold text-xs rounded-xl hover:bg-slate-700 transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-bold tracking-wider border-b border-slate-200">
                  <th className="p-4">Notification ID & Date</th>
                  <th className="p-4">Recipient</th>
                  <th className="p-4">Channel</th>
                  <th className="p-4">Template ID</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Retries</th>
                  <th className="p-4">Error Report</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 font-medium">
                {filteredLogs.map((log) => {
                  const isFailed = log.status?.toLowerCase() === "failed";
                  return (
                    <tr key={log.notificationId} className="hover:bg-slate-50/80 transition">
                      <td className="p-4 font-mono">
                        <span className="font-bold text-indigo-600 block">
                          #{log.notificationId.slice(0, 12)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.createdAt).toLocaleString()}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="font-bold text-slate-900 block">{log.recipient}</span>
                        {log.sentAt && (
                          <span className="text-[10px] text-emerald-600 font-medium">
                            Sent: {new Date(log.sentAt).toLocaleTimeString()}
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border ${
                            log.channel?.toUpperCase() === "SMS"
                              ? "bg-purple-100 text-purple-800 border-purple-200"
                              : "bg-blue-100 text-blue-800 border-blue-200"
                          }`}
                        >
                          {log.channel?.toUpperCase() === "SMS" ? (
                            <>
                              <MessageSquare className="h-3 w-3" />
                              SMS
                            </>
                          ) : (
                            <>
                              <Mail className="h-3 w-3" />
                              Email
                            </>
                          )}
                        </span>
                      </td>

                      <td className="p-4 font-mono text-slate-700">{log.templateId || "inline_raw"}</td>

                      <td className="p-4">{getStatusBadge(log.status)}</td>

                      <td className="p-4">
                        <span className="px-2 py-0.5 bg-slate-100 font-bold rounded text-slate-700">
                          {log.retryCount || 0}
                        </span>
                      </td>

                      <td className="p-4 max-w-xs truncate">
                        {log.lastError ? (
                          <span className="text-rose-600 text-[11px] font-mono bg-rose-50 p-1 rounded border border-rose-100 truncate flex items-center gap-1" title={log.lastError}>
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            <span className="truncate">{log.lastError}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">—</span>
                        )}
                      </td>

                      <td className="p-4 text-right space-x-2">
                        <button
                          onClick={() => setSelectedAuditLog(log)}
                          aria-label={`View details for notification ${log.notificationId}`}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition cursor-pointer inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <Info className="h-3 w-3" />
                          Details
                        </button>

                        {isFailed && (
                          <button
                            onClick={() => handleRetry(log.notificationId)}
                            disabled={retryingId === log.notificationId}
                            aria-label={`Retry notification ${log.notificationId}`}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-semibold rounded-lg transition shadow cursor-pointer inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          >
                            <RefreshCw className={`h-3 w-3 ${retryingId === log.notificationId ? "animate-spin" : ""}`} />
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Pagination */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 font-medium">
          <div>
            Showing <strong>{filteredLogs.length}</strong> of <strong>{totalCount}</strong> logs
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <label htmlFor="items-per-page-select">Per Page:</label>
              <select
                id="items-per-page-select"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="p-1 bg-white border border-slate-300 rounded font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Previous Page"
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded font-bold cursor-pointer inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="px-2 font-bold">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                aria-label="Next Page"
                className="px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 rounded font-bold cursor-pointer inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Audit Detail Modal */}
      {selectedAuditLog && (
        <Modal
          isOpen={Boolean(selectedAuditLog)}
          onClose={() => setSelectedAuditLog(null)}
          title={`Audit Log Details: #${selectedAuditLog.notificationId.slice(0, 12)}`}
        >
          <div className="space-y-4 text-xs text-slate-800">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Notification ID
                </span>
                <code className="font-bold text-indigo-600">{selectedAuditLog.notificationId}</code>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Tenant ID
                </span>
                <code className="font-bold text-slate-700">{selectedAuditLog.tenantId}</code>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Recipient
                </span>
                <strong className="text-slate-900">{selectedAuditLog.recipient}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  Channel & Template
                </span>
                <strong className="text-slate-900">
                  {selectedAuditLog.channel.toUpperCase()} / {selectedAuditLog.templateId}
                </strong>
              </div>
            </div>

            <div className="space-y-1">
              <span className="font-bold text-slate-700 block">Delivery Timestamps & Retries</span>
              <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] space-y-1">
                <div>Created: {new Date(selectedAuditLog.createdAt).toLocaleString()}</div>
                <div>
                  Sent At: {selectedAuditLog.sentAt ? new Date(selectedAuditLog.sentAt).toLocaleString() : "Not Delivered"}
                </div>
                <div>Retry Attempts: {selectedAuditLog.retryCount}</div>
                <div>Provider Ref: {selectedAuditLog.providerReference || "mock_provider_v1"}</div>
              </div>
            </div>

            {selectedAuditLog.lastError && (
              <div className="space-y-1">
                <span className="font-bold text-rose-700 block">Failure Audit Report</span>
                <div className="p-3 bg-rose-50 text-rose-900 rounded-xl border border-rose-200 font-mono text-[11px]">
                  {selectedAuditLog.lastError}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Send Test Notification Modal */}
      {isTestModalOpen && (
        <Modal
          isOpen={isTestModalOpen}
          onClose={() => setIsTestModalOpen(false)}
          title="Send Test Notification"
        >
          <form onSubmit={handleSendTestNotification} className="space-y-4">
            <div>
              <label htmlFor="target-channel-select" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Target Channel
              </label>
              <select
                id="target-channel-select"
                value={testChannel}
                onChange={(e) => {
                  const ch = e.target.value as NotificationChannel;
                  setTestChannel(ch);
                  setTestTemplateId(ch === "sms" ? "test_sms_template" : "test_email_template");
                }}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-medium bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>

            <div>
              <label htmlFor="recipient-address-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Recipient Address / Phone
              </label>
              <input
                id="recipient-address-input"
                type="text"
                placeholder={testChannel === "sms" ? "+1 555-0199" : "user@example.com"}
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-medium bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label htmlFor="template-id-input" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Template ID
              </label>
              <input
                id="template-id-input"
                type="text"
                value={testTemplateId}
                onChange={(e) => setTestTemplateId(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl font-medium bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSendingTest || !testRecipient}
                aria-label="Send Test"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow transition cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {isSendingTest ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send Test
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
