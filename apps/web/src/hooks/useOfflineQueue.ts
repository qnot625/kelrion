import { useCallback, useEffect, useState } from "react";
import {
  enqueueAttendanceItem,
  loadQueueFromStorage,
  QueuedAttendanceItem,
  removeItemsFromQueue,
} from "../lib/attendance-queue";

export interface UseOfflineQueueResult {
  readonly queue: readonly QueuedAttendanceItem[];
  readonly pendingCount: number;
  readonly enqueue: (
    item: Omit<QueuedAttendanceItem, "id" | "createdAt" | "attempts" | "status">
  ) => QueuedAttendanceItem[];
  readonly removeItems: (itemIds: readonly string[]) => QueuedAttendanceItem[];
  readonly refreshQueue: () => void;
}

export function useOfflineQueue(
  tenantSlug: string | undefined,
  employeeId: string | undefined
): UseOfflineQueueResult {
  const [queue, setQueue] = useState<readonly QueuedAttendanceItem[]>([]);

  const refreshQueue = useCallback(() => {
    if (!tenantSlug || !employeeId) {
      setQueue([]);
      return;
    }
    const items = loadQueueFromStorage(tenantSlug, employeeId);
    setQueue(items);
  }, [tenantSlug, employeeId]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  const enqueue = useCallback(
    (item: Omit<QueuedAttendanceItem, "id" | "createdAt" | "attempts" | "status">) => {
      if (!tenantSlug || !employeeId) return [];
      const updated = enqueueAttendanceItem(tenantSlug, employeeId, item);
      setQueue(updated);
      return updated;
    },
    [tenantSlug, employeeId]
  );

  const removeItems = useCallback(
    (itemIds: readonly string[]) => {
      if (!tenantSlug || !employeeId) return [];
      const updated = removeItemsFromQueue(tenantSlug, employeeId, itemIds);
      setQueue(updated);
      return updated;
    },
    [tenantSlug, employeeId]
  );

  return {
    queue,
    pendingCount: queue.filter((q) => q.status === "pending" || q.status === "failed").length,
    enqueue,
    removeItems,
    refreshQueue,
  };
}
