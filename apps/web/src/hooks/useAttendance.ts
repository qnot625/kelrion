import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiAttendanceRecord,
  ApiAttendanceSummary,
  klerionApi,
} from "../lib/api";
import { generateIdempotencyKey } from "../lib/attendance-queue";
import { KlerionSession } from "../lib/session";
import { useAttendanceSync } from "./useAttendanceSync";
import { useClock } from "./useClock";
import { useOfflineQueue } from "./useOfflineQueue";

function getTodayIsoDate(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDemoAttendanceSummary(employeeId: string): ApiAttendanceSummary {
  const today = getTodayIsoDate();
  return {
    employeeId,
    workDate: today,
    status: "clocked_out",
    clockInTime: null,
    clockOutTime: null,
    totalWorkMinutes: 0,
    totalBreakMinutes: 0,
  };
}

function createDemoAttendanceRecord(employeeId: string): ApiAttendanceRecord {
  return {
    id: `demo-record-${employeeId}`,
    tenantId: "klerion-demo",
    employeeId,
    workDate: getTodayIsoDate(),
    status: "clocked_out",
    clockInTime: null,
    clockOutTime: null,
    totalWorkMinutes: 0,
    totalBreakMinutes: 0,
    events: [],
  };
}

export type AttendanceStatus = "CLOCKED_OUT" | "CLOCKED_IN" | "ON_BREAK";

export interface AttendanceState {
  readonly status: AttendanceStatus;
  readonly record: ApiAttendanceRecord | null;
  readonly summary: ApiAttendanceSummary | null;
  readonly clockInTime: string | null;
  readonly currentBreakStart: string | null;
  readonly workDate: string;
}

export interface UseAttendanceResult {
  readonly state: AttendanceState;
  readonly now: Date;
  readonly isLoading: boolean;
  readonly isActionPending: boolean;
  readonly isOffline: boolean;
  readonly error: string | null;
  readonly pendingQueueCount: number;
  readonly queue: ReturnType<typeof useOfflineQueue>["queue"];
  readonly isSyncing: boolean;
  readonly clockIn: () => Promise<void>;
  readonly clockOut: () => Promise<void>;
  readonly startBreak: () => Promise<void>;
  readonly endBreak: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly syncNow: () => Promise<unknown>;
}

export function useAttendance(
  session: KlerionSession | null,
  employeeId?: string
): UseAttendanceResult {
  const now = useClock(1000);
  const [record, setRecord] = useState<ApiAttendanceRecord | null>(null);
  const [summary, setSummary] = useState<ApiAttendanceSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  const activeEmployeeId = employeeId || session?.userId;
  const tenantSlug = session?.tenantSlug;
  const isDemo = session?.mode === "demo";

  const { queue, pendingCount, enqueue, removeItems, refreshQueue } = useOfflineQueue(
    tenantSlug,
    activeEmployeeId
  );

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const fetchAttendance = useCallback(async () => {
    if (isDemo && activeEmployeeId) {
      setError(null);
      setRecord(createDemoAttendanceRecord(activeEmployeeId));
      setSummary(createDemoAttendanceSummary(activeEmployeeId));
      setIsLoading(false);
      return;
    }

    if (!session || !session.token || !activeEmployeeId) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await klerionApi.getEmployeeAttendance(session, activeEmployeeId);
      setRecord(res.record);
      setSummary(res.summary);
    } catch (err: unknown) {
      // If offline or network error, rely on queue/local state
      if (!navigator.onLine) {
        setIsOffline(true);
      } else {
        const message = err instanceof Error ? err.message : "Failed to load attendance record";
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [session, activeEmployeeId, isDemo]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const { isSyncing, syncNow } = useAttendanceSync(
    session,
    queue,
    removeItems,
    fetchAttendance
  );

  // Compute status by considering server state + un-synced optimistic queue items
  const computedState: AttendanceState = useMemo(() => {
    const today = getTodayIsoDate();
    let currentStatus: AttendanceStatus = "CLOCKED_OUT";
    let clockInTime: string | null = record?.clockInTime || null;
    let currentBreakStart: string | null = null;

    if (summary) {
      if (summary.status === "clocked_in") currentStatus = "CLOCKED_IN";
      else if (summary.status === "on_break") currentStatus = "ON_BREAK";
      else currentStatus = "CLOCKED_OUT";
    }

    // Apply un-synced optimistic items in queue
    const pendingItems = queue.filter((q) => q.status === "pending" || q.status === "failed");
    for (const item of pendingItems) {
      if (item.eventType === "clock_in") {
        currentStatus = "CLOCKED_IN";
        clockInTime = item.timestamp;
        currentBreakStart = null;
      } else if (item.eventType === "break_start") {
        currentStatus = "ON_BREAK";
        currentBreakStart = item.timestamp;
      } else if (item.eventType === "break_end") {
        currentStatus = "CLOCKED_IN";
        currentBreakStart = null;
      } else if (item.eventType === "clock_out") {
        currentStatus = "CLOCKED_OUT";
        currentBreakStart = null;
      }
    }

    return {
      status: currentStatus,
      record,
      summary,
      clockInTime,
      currentBreakStart,
      workDate: record?.workDate || summary?.workDate || today,
    };
  }, [record, summary, queue]);

  const performClockAction = useCallback(
    async (
      eventType: "clock_in" | "clock_out" | "break_start" | "break_end",
      apiCall: () => Promise<unknown>
    ) => {
      if (isDemo && activeEmployeeId) {
        setError(null);
        setIsActionPending(true);
        const timestamp = new Date().toISOString();
        const workDate = getTodayIsoDate();

        setRecord((current) => {
          const updated: ApiAttendanceRecord = {
            id: current?.id ?? `demo-record-${activeEmployeeId}`,
            tenantId: "klerion-demo",
            employeeId: activeEmployeeId,
            workDate,
            status: eventType === "clock_in" ? "clocked_in" : eventType === "break_start" ? "on_break" : eventType === "clock_out" ? "clocked_out" : current?.status ?? "clocked_out",
            clockInTime: eventType === "clock_in" ? timestamp : current?.clockInTime ?? null,
            clockOutTime: eventType === "clock_out" ? timestamp : current?.clockOutTime ?? null,
            totalWorkMinutes: current?.totalWorkMinutes ?? 0,
            totalBreakMinutes: current?.totalBreakMinutes ?? 0,
            events: [
              ...(current?.events ?? []),
              {
                id: `evt_${Date.now()}`,
                type: eventType,
                timestamp,
                workDate,
                idempotencyKey: generateIdempotencyKey(activeEmployeeId, eventType, timestamp),
              },
            ],
          };
          return updated;
        });

        setSummary((current) => ({
          employeeId: activeEmployeeId,
          workDate,
          status: eventType === "clock_in" ? "clocked_in" : eventType === "break_start" ? "on_break" : eventType === "clock_out" ? "clocked_out" : current?.status ?? "clocked_out",
          clockInTime: eventType === "clock_in" ? timestamp : current?.clockInTime ?? null,
          clockOutTime: eventType === "clock_out" ? timestamp : current?.clockOutTime ?? null,
          totalWorkMinutes: current?.totalWorkMinutes ?? 0,
          totalBreakMinutes: current?.totalBreakMinutes ?? 0,
        }));

        setIsActionPending(false);
        return;
      }

      if (!session || !session.token || !activeEmployeeId || !tenantSlug) {
        setError("Missing user session or employee identity");
        return;
      }

      setIsActionPending(true);
      setError(null);
      const timestamp = new Date().toISOString();
      const workDate = getTodayIsoDate();
      const idempotencyKey = generateIdempotencyKey(activeEmployeeId, eventType, timestamp);

      const queueItemPayload = {
        eventId: `evt_${Date.now()}`,
        tenantId: session.tenantSlug,
        employeeId: activeEmployeeId,
        eventType,
        timestamp,
        workDate,
        idempotencyKey,
        source: "web" as const,
      };

      // If offline, enqueue immediately
      if (!navigator.onLine) {
        enqueue(queueItemPayload);
        setIsActionPending(false);
        return;
      }

      try {
        await apiCall();
        await fetchAttendance();
      } catch (err: unknown) {
        // Enqueue offline item if request fails due to network or server error
        console.warn("Direct API call failed, queueing offline event", err);
        enqueue(queueItemPayload);
      } finally {
        setIsActionPending(false);
        refreshQueue();
      }
    },
    [isDemo, session, activeEmployeeId, tenantSlug, enqueue, fetchAttendance, refreshQueue]
  );

  const clockIn = useCallback(async () => {
    const timestamp = new Date().toISOString();
    const workDate = getTodayIsoDate();
    const idempotencyKey = generateIdempotencyKey(activeEmployeeId || "", "clock_in", timestamp);
    await performClockAction("clock_in", () =>
      klerionApi.clockIn(session!, {
        employeeId: activeEmployeeId!,
        workDate,
        timestamp,
        idempotencyKey,
        source: "web",
      })
    );
  }, [session, activeEmployeeId, performClockAction]);

  const clockOut = useCallback(async () => {
    const timestamp = new Date().toISOString();
    const workDate = getTodayIsoDate();
    const idempotencyKey = generateIdempotencyKey(activeEmployeeId || "", "clock_out", timestamp);
    await performClockAction("clock_out", () =>
      klerionApi.clockOut(session!, {
        employeeId: activeEmployeeId!,
        workDate,
        timestamp,
        idempotencyKey,
        source: "web",
      })
    );
  }, [session, activeEmployeeId, performClockAction]);

  const startBreak = useCallback(async () => {
    const timestamp = new Date().toISOString();
    const workDate = getTodayIsoDate();
    const idempotencyKey = generateIdempotencyKey(activeEmployeeId || "", "break_start", timestamp);
    await performClockAction("break_start", () =>
      klerionApi.startBreak(session!, {
        employeeId: activeEmployeeId!,
        workDate,
        timestamp,
        idempotencyKey,
        source: "web",
      })
    );
  }, [session, activeEmployeeId, performClockAction]);

  const endBreak = useCallback(async () => {
    const timestamp = new Date().toISOString();
    const workDate = getTodayIsoDate();
    const idempotencyKey = generateIdempotencyKey(activeEmployeeId || "", "break_end", timestamp);
    await performClockAction("break_end", () =>
      klerionApi.endBreak(session!, {
        employeeId: activeEmployeeId!,
        workDate,
        timestamp,
        idempotencyKey,
        source: "web",
      })
    );
  }, [session, activeEmployeeId, performClockAction]);

  return {
    state: computedState,
    now,
    isLoading,
    isActionPending,
    isOffline,
    error,
    pendingQueueCount: pendingCount,
    queue,
    isSyncing,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    refresh: fetchAttendance,
    syncNow,
  };
}
