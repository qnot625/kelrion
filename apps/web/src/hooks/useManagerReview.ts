import { useCallback, useEffect, useState } from "react";
import { klerionApi, type ApiAttendanceCorrection } from "../lib/api";
import type { KlerionSession } from "../lib/session";

export function useManagerReview(session: KlerionSession) {
  const [pendingRequests, setPendingRequests] = useState<ApiAttendanceCorrection[]>([]);
  const [resolvedRequests, setResolvedRequests] = useState<ApiAttendanceCorrection[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isManager = session.roles.some((r) => ["owner", "admin", "manager"].includes(r));

  const fetchRequests = useCallback(async () => {
    if (!isManager) return;
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        klerionApi.listAttendanceCorrections(session, { status: "pending", limit: 50 }),
        klerionApi.listAttendanceCorrections(session, { status: "approved", limit: 25 }),
        klerionApi.listAttendanceCorrections(session, { status: "rejected", limit: 25 }),
      ]);
      setPendingRequests(pendingRes.corrections as ApiAttendanceCorrection[]);
      const combinedResolved = [
        ...approvedRes.corrections,
        ...rejectedRes.corrections,
      ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setResolvedRequests(combinedResolved as ApiAttendanceCorrection[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load manager review inbox");
    } finally {
      setLoading(false);
    }
  }, [session, isManager]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const approveCorrection = async (id: string, reviewNotes?: string): Promise<boolean> => {
    setActionLoadingId(id);
    setError(null);
    try {
      await klerionApi.approveAttendanceCorrection(session, id, reviewNotes);
      await fetchRequests();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to approve correction request");
      return false;
    } finally {
      setActionLoadingId(null);
    }
  };

  const rejectCorrection = async (id: string, reviewNotes?: string): Promise<boolean> => {
    setActionLoadingId(id);
    setError(null);
    try {
      await klerionApi.rejectAttendanceCorrection(session, id, reviewNotes);
      await fetchRequests();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reject correction request");
      return false;
    } finally {
      setActionLoadingId(null);
    }
  };

  return {
    isManager,
    pendingRequests,
    resolvedRequests,
    pendingCount: pendingRequests.length,
    loading,
    actionLoadingId,
    error,
    approveCorrection,
    rejectCorrection,
    refetch: fetchRequests,
  };
}
