export interface QueuedAttendanceItem {
  readonly id: string;
  readonly eventId: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly eventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  readonly timestamp: string; // ISO string
  readonly workDate: string; // YYYY-MM-DD
  readonly idempotencyKey: string;
  readonly source: "web";
  readonly location?: { latitude: number; longitude: number; accuracy?: number } | null;
  readonly notes?: string;
  readonly createdAt: string;
  readonly attempts: number;
  readonly lastAttemptAt?: string;
  readonly status: "pending" | "syncing" | "failed";
  readonly error?: string;
}

export function generateIdempotencyKey(
  employeeId: string,
  eventType: string,
  timestamp: string
): string {
  const timeMs = new Date(timestamp).getTime();
  return `clk_${eventType}_${employeeId}_${timeMs}`;
}

export function getQueueStorageKey(tenantSlug: string, employeeId: string): string {
  return `klerion_attendance_queue_${tenantSlug}_${employeeId}`;
}

export function loadQueueFromStorage(tenantSlug: string, employeeId: string): QueuedAttendanceItem[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  const key = getQueueStorageKey(tenantSlug, employeeId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const items = JSON.parse(raw) as QueuedAttendanceItem[];
    // Ensure chronological FIFO order
    return Array.isArray(items)
      ? [...items].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      : [];
  } catch (err) {
    console.error("Failed to parse local attendance queue", err);
    return [];
  }
}

export function saveQueueToStorage(
  tenantSlug: string,
  employeeId: string,
  items: readonly QueuedAttendanceItem[]
): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getQueueStorageKey(tenantSlug, employeeId);
  try {
    const sorted = [...items].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    window.localStorage.setItem(key, JSON.stringify(sorted));
  } catch (err) {
    console.error("Failed to save local attendance queue", err);
  }
}

export function enqueueAttendanceItem(
  tenantSlug: string,
  employeeId: string,
  item: Omit<QueuedAttendanceItem, "id" | "createdAt" | "attempts" | "status">
): QueuedAttendanceItem[] {
  const currentQueue = loadQueueFromStorage(tenantSlug, employeeId);
  
  // Deduplicate by idempotency key
  if (currentQueue.some((q) => q.idempotencyKey === item.idempotencyKey)) {
    return currentQueue;
  }

  const newItem: QueuedAttendanceItem = {
    ...item,
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  };

  const updatedQueue = [...currentQueue, newItem];
  saveQueueToStorage(tenantSlug, employeeId, updatedQueue);
  return updatedQueue;
}

export function removeItemsFromQueue(
  tenantSlug: string,
  employeeId: string,
  itemIdsToRemove: readonly string[]
): QueuedAttendanceItem[] {
  const currentQueue = loadQueueFromStorage(tenantSlug, employeeId);
  const updatedQueue = currentQueue.filter((q) => !itemIdsToRemove.includes(q.id));
  saveQueueToStorage(tenantSlug, employeeId, updatedQueue);
  return updatedQueue;
}

export function clearQueueStorage(tenantSlug: string, employeeId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getQueueStorageKey(tenantSlug, employeeId);
  window.localStorage.removeItem(key);
}
