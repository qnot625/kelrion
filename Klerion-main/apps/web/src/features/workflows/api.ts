export interface TransitionRuleJSON {
  readonly id: string;
  readonly targetStepId: string;
  readonly condition?: {
    readonly field: string;
    readonly operator: "EQUALS" | "NOT_EQUALS" | "GREATER_THAN" | "LESS_THAN" | "CONTAINS" | "IN" | "IS_EMPTY";
    readonly value: any;
  };
  readonly isDefault?: boolean;
}

export interface TaskConfigJSON {
  readonly assigneeId?: string;
  readonly candidateUsers?: readonly string[];
  readonly candidateRoles?: readonly string[];
  readonly candidateGroups?: readonly string[];
  readonly priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  readonly dueDurationMs?: number;
  readonly formDefinitionId?: string;
  readonly slaTimeoutMs?: number;
  readonly escalationRules?: readonly any[];
}

export interface WorkflowStepJSON {
  readonly id: string;
  readonly name: string;
  readonly type: "START" | "END" | "AUTOMATIC_TASK" | "MANUAL_TASK" | "APPROVAL_TASK" | "PARALLEL_SPLIT" | "PARALLEL_JOIN";
  readonly description?: string;
  readonly transitions: readonly TransitionRuleJSON[];
  readonly taskConfig?: TaskConfigJSON;
  readonly position?: { readonly x: number; readonly y: number };
}

export interface TriggerJSON {
  readonly id: string;
  readonly type: "API_CALL" | "FORM_SUBMISSION" | "EVENT_BUS" | "CRON_SCHEDULE";
  readonly config?: Record<string, any>;
}

export interface WorkflowDefinitionJSON {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly description?: string;
  readonly version: number;
  readonly status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  readonly startStepId: string;
  readonly steps: readonly WorkflowStepJSON[];
  readonly triggers: readonly TriggerJSON[];
  readonly metadata?: Record<string, any>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt?: string | null;
  readonly archivedAt?: string | null;
}

export interface WorkflowInstanceJSON {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowDefinitionId: string;
  readonly workflowVersion: number;
  readonly status: "NOT_STARTED" | "RUNNING" | "WAITING" | "COMPLETED" | "FAILED" | "CANCELLED";
  readonly currentStepId: string | null;
  readonly startedBy: string;
  readonly variables: Record<string, any>;
  readonly parentInstanceId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | null;
}

export interface HumanTaskJSON {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly workflowDefinitionId?: string;
  readonly stepId: string;
  readonly name: string;
  readonly description?: string;
  readonly status: "PENDING" | "ASSIGNED" | "CLAIMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "ESCALATED";
  readonly taskType: "APPROVAL_TASK" | "FORM_FILLING" | "MANUAL_ACTION";
  readonly priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  readonly assigneeId?: string | null;
  readonly candidateUsers?: readonly string[];
  readonly candidateRoles?: readonly string[];
  readonly candidateGroups?: readonly string[];
  readonly formDefinitionId?: string;
  readonly dueDate?: string | null;
  readonly slaTimeoutDate?: string | null;
  readonly outcome?: string | null;
  readonly outputData?: Record<string, any>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt?: string | null;
}

export interface WorkflowHistoryRecordJSON {
  readonly id: string;
  readonly tenantId: string;
  readonly workflowInstanceId: string;
  readonly workflowDefinitionId?: string;
  readonly stepId?: string;
  readonly taskId?: string;
  readonly eventType: string;
  readonly actorId: string;
  readonly metadata?: Record<string, any>;
  readonly timestamp: string;
}

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "x-tenant-id": "tenant-default",
  "x-user-id": "user-1",
  "x-user-role": "admin",
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error) msg = errJson.error;
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const workflowsApi = {
  async listWorkflows(
    query?: { status?: string; search?: string },
    headers?: Record<string, string>
  ): Promise<WorkflowDefinitionJSON[]> {
    const params = new URLSearchParams();
    if (query?.status) params.append("status", query.status);
    if (query?.search) params.append("search", query.search);
    const queryString = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(`/api/workflows${queryString}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const data = await handleResponse<{ workflows: WorkflowDefinitionJSON[] }>(res);
    return data.workflows;
  },

  async getWorkflow(
    id: string,
    version?: number,
    headers?: Record<string, string>
  ): Promise<WorkflowDefinitionJSON> {
    const queryString = version ? `?version=${version}` : "";
    const res = await fetch(`/api/workflows/${encodeURIComponent(id)}${queryString}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const data = await handleResponse<{ workflow: WorkflowDefinitionJSON }>(res);
    return data.workflow;
  },

  async createWorkflow(
    data: Partial<WorkflowDefinitionJSON>,
    headers?: Record<string, string>
  ): Promise<WorkflowDefinitionJSON> {
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ workflow: WorkflowDefinitionJSON }>(res);
    return result.workflow;
  },

  async updateWorkflow(
    id: string,
    data: Partial<WorkflowDefinitionJSON>,
    headers?: Record<string, string>
  ): Promise<WorkflowDefinitionJSON> {
    const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ workflow: WorkflowDefinitionJSON }>(res);
    return result.workflow;
  },

  async publishWorkflow(
    id: string,
    headers?: Record<string, string>
  ): Promise<WorkflowDefinitionJSON> {
    const res = await fetch(`/api/workflows/${encodeURIComponent(id)}/publish`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ workflow: WorkflowDefinitionJSON }>(res);
    return result.workflow;
  },

  async archiveWorkflow(
    id: string,
    headers?: Record<string, string>
  ): Promise<WorkflowDefinitionJSON> {
    const res = await fetch(`/api/workflows/${encodeURIComponent(id)}/archive`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ workflow: WorkflowDefinitionJSON }>(res);
    return result.workflow;
  },

  async createInstance(
    data: {
      workflowDefinitionId: string;
      workflowVersion?: number;
      initialContext?: Record<string, any>;
      parentInstanceId?: string;
    },
    headers?: Record<string, string>
  ): Promise<WorkflowInstanceJSON> {
    const res = await fetch("/api/workflows/instances", {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ instance: WorkflowInstanceJSON }>(res);
    return result.instance;
  },

  async getInstance(
    instanceId: string,
    headers?: Record<string, string>
  ): Promise<WorkflowInstanceJSON> {
    const res = await fetch(`/api/workflows/instances/${encodeURIComponent(instanceId)}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ instance: WorkflowInstanceJSON }>(res);
    return result.instance;
  },

  async startInstance(
    instanceId: string,
    headers?: Record<string, string>
  ): Promise<WorkflowInstanceJSON> {
    const res = await fetch(`/api/workflows/instances/${encodeURIComponent(instanceId)}/start`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ instance: WorkflowInstanceJSON }>(res);
    return result.instance;
  },

  async advanceInstance(
    instanceId: string,
    contextUpdates?: Record<string, any>,
    headers?: Record<string, string>
  ): Promise<WorkflowInstanceJSON> {
    const res = await fetch(`/api/workflows/instances/${encodeURIComponent(instanceId)}/advance`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify({ contextUpdates }),
    });
    const result = await handleResponse<{ instance: WorkflowInstanceJSON }>(res);
    return result.instance;
  },

  async cancelInstance(
    instanceId: string,
    reason?: string,
    headers?: Record<string, string>
  ): Promise<WorkflowInstanceJSON> {
    const res = await fetch(`/api/workflows/instances/${encodeURIComponent(instanceId)}/cancel`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify({ reason }),
    });
    const result = await handleResponse<{ instance: WorkflowInstanceJSON }>(res);
    return result.instance;
  },

  async getInstanceHistory(
    instanceId: string,
    headers?: Record<string, string>
  ): Promise<WorkflowHistoryRecordJSON[]> {
    const res = await fetch(`/api/workflows/instances/${encodeURIComponent(instanceId)}/history`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ history: WorkflowHistoryRecordJSON[] }>(res);
    return result.history;
  },

  async listTasks(
    query?: {
      assigneeId?: string;
      candidateUserId?: string;
      candidateRole?: string;
      workflowInstanceId?: string;
      status?: string;
    },
    headers?: Record<string, string>
  ): Promise<HumanTaskJSON[]> {
    const params = new URLSearchParams();
    if (query?.assigneeId) params.append("assigneeId", query.assigneeId);
    if (query?.candidateUserId) params.append("candidateUserId", query.candidateUserId);
    if (query?.candidateRole) params.append("candidateRole", query.candidateRole);
    if (query?.workflowInstanceId) params.append("workflowInstanceId", query.workflowInstanceId);
    if (query?.status) params.append("status", query.status);
    const queryString = params.toString() ? `?${params.toString()}` : "";

    const res = await fetch(`/api/workflows/tasks${queryString}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ tasks: HumanTaskJSON[] }>(res);
    return result.tasks;
  },

  async completeTask(
    taskId: string,
    payload: { outcome: string; outputData?: Record<string, any> },
    headers?: Record<string, string>
  ): Promise<{ task: HumanTaskJSON; instance: WorkflowInstanceJSON | null }> {
    const res = await fetch(`/api/workflows/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ task: HumanTaskJSON; instance: WorkflowInstanceJSON | null }>(res);
  },
};
