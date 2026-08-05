import { useCallback, useEffect, useState } from "react";
import { klerionApi, SyncAttendanceBatchResult } from "../lib/api";
import { QueuedAttendanceItem } from "../lib/attendance-queue";
import { KlerionSession } from "../lib/session";

export interface UseAttendanceSyncResult {
  readonly isSyncing: boolean;
  readonly lastSyncResult: SyncAttendanceBatchResult | null;
  readonly lastSyncError: string | null;
  readonly syncNow: () => Promise<SyncAttendanceBatchResult | null>;
}

export function useAttendanceSync(
  session: KlerionSession | null,
  queue: readonly QueuedAttendanceItem[],
  removeItems: (ids: readonly string[]) => void,
  onSyncComplete?: () => void
): UseAttendanceSyncResult {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncAttendanceBatchResult | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const syncNow = useCallback(async (): Promise<SyncAttendanceBatchResult | null> => {
    if (!session || !session.token || queue.length === 0 || isSyncing) {
      return null;
    }

    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const payloadEvents = queue.map((q) => ({
        id: q.id,
        eventId: q.eventId || q.id,
        tenantId: q.tenantId,
        employeeId: q.employeeId,
        eventType: q.eventType,
        timestamp: q.timestamp,
        workDate: q.workDate,
        idempotencyKey: q.idempotencyKey,
        source: "web" as const,
        location: q.location || null,
        notes: q.notes || undefined,
      }));

      const batchId = `batch_web_${Date.now()}`;
      const result = await klerionApi.syncAttendance(session, {
        batchId,
        submittedAt: new Date().toISOString(),
        events: payloadEvents,
      });

      setLastSyncResult(result);

      // Collect IDs of processed or duplicate items to purge from local queue
      const idsToRemove = result.results
        .filter((r) => r.status === "processed" || r.status === "duplicate")
        .map((r) => r.id);

      if (idsToRemove.length > 0) {
        removeItems(idsToRemove);
      }

      if (onSyncComplete) {
        onSyncComplete();
      }

      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sync failed";
      setLastSyncError(message);
      return null;
    } finally {
      setIsSyncing(false);
    }
  }, [session, queue, isSyncing, removeItems, onSyncComplete]);

  // Auto sync on window focus or online event
  useEffect(() => {
    const handleOnline = () => {
      if (queue.length > 0) {
        syncNow();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [queue, syncNow]);

  return {
    isSyncing,
    lastSyncResult,
    lastSyncError,
    syncNow,
  };
}
