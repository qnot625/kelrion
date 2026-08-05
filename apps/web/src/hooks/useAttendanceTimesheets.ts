import { useCallback, useEffect, useState } from "react";
import { klerionApi, type ApiAttendanceSummary } from "../lib/api";
import type { KlerionSession } from "../lib/session";

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 14);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

export interface UseAttendanceTimesheetsOptions {
  readonly session: KlerionSession;
  readonly initialStartDate?: string;
  readonly initialEndDate?: string;
  readonly initialEmployeeId?: string;
}

export function useAttendanceTimesheets({
  session,
  initialStartDate,
  initialEndDate,
  initialEmployeeId = "",
}: UseAttendanceTimesheetsOptions) {
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(initialStartDate || defaults.startDate);
  const [endDate, setEndDate] = useState(initialEndDate || defaults.endDate);
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [summaries, setSummaries] = useState<ApiAttendanceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTimesheets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await klerionApi.listAttendanceSummaries(session, {
        startDate,
        endDate,
        employeeId: employeeId || undefined,
      });
      setSummaries(res.summaries);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load timesheet summaries");
    } finally {
      setLoading(false);
    }
  }, [session, startDate, endDate, employeeId]);

  useEffect(() => {
    void fetchTimesheets();
  }, [fetchTimesheets]);

  const totalWorkedMinutes = summaries.reduce((acc, curr) => acc + (curr.totalWorkMinutes || 0), 0);
  const totalBreakMinutes = summaries.reduce((acc, curr) => acc + (curr.totalBreakMinutes || 0), 0);

  return {
    summaries,
    totalWorkedHours: Math.round((totalWorkedMinutes / 60) * 10) / 10,
    totalBreakHours: Math.round((totalBreakMinutes / 60) * 10) / 10,
    loading,
    error,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    employeeId,
    setEmployeeId,
    refetch: fetchTimesheets,
  };
}
