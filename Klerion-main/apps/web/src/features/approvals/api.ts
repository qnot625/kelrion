import { useState, useEffect, useCallback } from "react";

export type ApprovalStatusJSON =
  | "PENDING"
  | "IN_PROGRESS"
  | "APPROVED"
  | "REJECTED"
  | "MORE_INFO_REQUESTED"
  | "DELEGATED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "EXPIRED";

export type ApprovalActionJSON =
  | "APPROVE"
  | "REJECT"
  | "DELEGATE"
  | "REQUEST_MORE_INFO"
  | "RESUME"
  | "CANCEL"
  | "TIMEOUT";

export interface ApprovalDecisionJSON {
  readonly id: string;
  readonly stepId: string;
  readonly action: ApprovalActionJSON;
  readonly actorUserId: string;
  readonly actorRole?: string;
  readonly comment?: string;
  readonly question?: string;
  readonly targetUserId?: string;
  readonly data?: Record<string, unknown>;
  readonly decidedAt: string;
}

export interface ApprovalStepJSON {
  readonly id: string;
  readonly name: string;
  readonly stepOrder: number;
  readonly status: ApprovalStatusJSON;
  readonly requiredApproversCount: number;
  readonly assignedUserIds: readonly string[];
  readonly assignedRoles: readonly string[];
  readonly decisions: readonly ApprovalDecisionJSON[];
  readonly dueAt?: string;
  readonly escalationTargetUserId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ApprovalRequestJSON {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description?: string;
  readonly workflowInstanceId?: string;
  readonly workflowStepId?: string;
  readonly requesterUserId: string;
  readonly currentStepIndex: number;
  readonly status: ApprovalStatusJSON;
  readonly steps: readonly ApprovalStepJSON[];
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string;
}

export interface ApprovalHistoryTimelineJSON {
  readonly approvalRequestId: string;
  readonly currentStatus: ApprovalStatusJSON;
  readonly decisions: readonly (ApprovalDecisionJSON & { stepId: string; stepName: string })[];
  readonly auditTimeline: readonly {
    readonly id: string;
    readonly action: string;
    readonly payload: Record<string, unknown>;
    readonly timestamp: string;
  }[];
}

export interface ApprovalListResponse {
  readonly approvals: readonly ApprovalRequestJSON[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "x-tenant-id": "tenant-default",
  "x-user-id": "user-1",
  "x-user-role": "admin",
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errObj = await res.json();
      if (errObj.error) errorMsg = errObj.error;
    } catch {
      // JSON parse error ignored
    }
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

export const approvalsApi = {
  async listApprovals(
    params?: {
      status?: ApprovalStatusJSON;
      requesterUserId?: string;
      assigneeUserId?: string;
      workflowInstanceId?: string;
      search?: string;
      inbox?: boolean;
      page?: number;
      limit?: number;
    },
    headers?: Record<string, string>
  ): Promise<ApprovalListResponse> {
    const urlParams = new URLSearchParams();
    if (params?.status) urlParams.append("status", params.status);
    if (params?.requesterUserId) urlParams.append("requesterUserId", params.requesterUserId);
    if (params?.assigneeUserId) urlParams.append("assigneeUserId", params.assigneeUserId);
    if (params?.workflowInstanceId) urlParams.append("workflowInstanceId", params.workflowInstanceId);
    if (params?.search) urlParams.append("search", params.search);
    if (params?.inbox) urlParams.append("inbox", "true");
    if (params?.page) urlParams.append("page", params.page.toString());
    if (params?.limit) urlParams.append("limit", params.limit.toString());

    const queryString = urlParams.toString() ? `?${urlParams.toString()}` : "";
    const res = await fetch(`/api/approvals${queryString}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    return handleResponse<ApprovalListResponse>(res);
  },

  async getApproval(
    id: string,
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async createApproval(
    payload: {
      id?: string;
      title: string;
      description?: string;
      workflowInstanceId?: string;
      workflowStepId?: string;
      steps: {
        id?: string;
        name: string;
        assignedUserIds?: string[];
        assignedRoles?: string[];
        requiredApproversCount?: number;
        dueDurationMs?: number;
        escalationTargetUserId?: string;
      }[];
      metadata?: Record<string, unknown>;
    },
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async approve(
    id: string,
    payload?: { stepId?: string; comment?: string; data?: Record<string, unknown> },
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload || {}),
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async reject(
    id: string,
    payload?: { stepId?: string; comment?: string; reason?: string; data?: Record<string, unknown> },
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload || {}),
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async delegate(
    id: string,
    payload: { stepId?: string; targetUserId: string; comment?: string },
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/delegate`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async requestInfo(
    id: string,
    payload: { stepId?: string; question: string; targetUserId?: string },
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/request-info`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async resume(
    id: string,
    payload?: { comment?: string; responseData?: Record<string, unknown> },
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/resume`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload || {}),
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async cancel(
    id: string,
    payload?: { reason?: string },
    headers?: Record<string, string>
  ): Promise<ApprovalRequestJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload || {}),
    });
    const result = await handleResponse<{ approval: ApprovalRequestJSON }>(res);
    return result.approval;
  },

  async getApprovalHistory(
    id: string,
    headers?: Record<string, string>
  ): Promise<ApprovalHistoryTimelineJSON> {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}/history`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    return handleResponse<ApprovalHistoryTimelineJSON>(res);
  },
};

// -------------------------------------------------------------------
// REACT HOOKS FOR APPROVALS
// -------------------------------------------------------------------

export function useApprovalInbox(params?: {
  status?: ApprovalStatusJSON;
  search?: string;
  inbox?: boolean;
  page?: number;
  limit?: number;
}) {
  const [data, setData] = useState<ApprovalListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.listApprovals(params);
      setData(res);
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to load approval inbox");
    } finally {
      setLoading(false);
    }
  }, [params?.status, params?.search, params?.inbox, params?.page, params?.limit]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  return { data, loading, error, refetch: fetchInbox };
}

export function useApproval(id: string | null) {
  const [approval, setApproval] = useState<ApprovalRequestJSON | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApproval = useCallback(async () => {
    if (!id) {
      setApproval(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await approvalsApi.getApproval(id);
      setApproval(data);
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to load approval details");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchApproval();
  }, [fetchApproval]);

  return { approval, loading, error, refetch: fetchApproval };
}

export function useApprovalHistory(id: string | null) {
  const [history, setHistory] = useState<ApprovalHistoryTimelineJSON | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!id) {
      setHistory(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await approvalsApi.getApprovalHistory(id);
      setHistory(data);
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to load approval history");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}

export function useApprove() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (
    id: string,
    payload?: { stepId?: string; comment?: string; data?: Record<string, unknown> }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.approve(id, payload);
      return res;
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to approve request");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}

export function useReject() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (
    id: string,
    payload?: { stepId?: string; comment?: string; reason?: string; data?: Record<string, unknown> }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.reject(id, payload);
      return res;
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to reject request");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}

export function useDelegate() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (
    id: string,
    payload: { stepId?: string; targetUserId: string; comment?: string }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.delegate(id, payload);
      return res;
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to delegate request");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}

export function useRequestInfo() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (
    id: string,
    payload: { stepId?: string; question: string; targetUserId?: string }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.requestInfo(id, payload);
      return res;
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to request info");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}

export function useResume() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (
    id: string,
    payload?: { comment?: string; responseData?: Record<string, unknown> }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.resume(id, payload);
      return res;
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to resume request");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}

export function useCancel() {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const execute = async (
    id: string,
    payload?: { reason?: string }
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await approvalsApi.cancel(id, payload);
      return res;
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || "Failed to cancel request");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { execute, loading, error };
}
