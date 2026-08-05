import { useCallback, useEffect, useState } from "react";
import {
  klerionApi,
  type ApiAttendanceCorrection,
  type ListCorrectionsParams,
} from "../lib/api";
import type { KlerionSession } from "../lib/session";

export interface CreateCorrectionInput {
  employeeId: string;
  targetEventId?: string;
  requestedEventType: "clock_in" | "clock_out" | "break_start" | "break_end";
  requestedTimestamp: string;
  reason: string;
}

export function useAttendanceCorrections(session: KlerionSession, initialParams: ListCorrectionsParams = {}) {
  const [corrections, setCorrections] = useState<ApiAttendanceCorrection[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"pending" | "approved" | "rejected" | undefined>(
    initialParams.status
  );
  const [employeeIdFilter, setEmployeeIdFilter] = useState<string | undefined>(initialParams.employeeId);

  const fetchCorrections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await klerionApi.listAttendanceCorrections(session, {
        status: filterStatus,
        employeeId: employeeIdFilter,
        limit: 100,
      });
      setCorrections(res.corrections as ApiAttendanceCorrection[]);
      setTotal(res.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load correction requests");
    } finally {
      setLoading(false);
    }
  }, [session, filterStatus, employeeIdFilter]);

  useEffect(() => {
    void fetchCorrections();
  }, [fetchCorrections]);

  const submitCorrection = async (input: CreateCorrectionInput): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    try {
      await klerionApi.createAttendanceCorrection(session, input);
      await fetchCorrections();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit correction request");
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return {
    corrections,
    total,
    loading,
    submitting,
    error,
    filterStatus,
    setFilterStatus,
    employeeIdFilter,
    setEmployeeIdFilter,
    submitCorrection,
    refetch: fetchCorrections,
  };
}
