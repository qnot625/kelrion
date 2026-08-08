import type {
  HumanTaskData,
  WorkflowExecutionEntry,
  WorkflowInstanceData,
  WorkflowInstanceStatus,
  WorkflowStep,
} from "./types.js";

function clone<T>(value: T): T { return structuredClone(value); }

export class WorkflowInstance {
  private data: WorkflowInstanceData;

  constructor(data: WorkflowInstanceData) {
    this.data = {
      ...data,
      variables: clone(data.variables),
      executionHistory: clone(data.executionHistory).map((entry) => ({
        ...entry,
        startedAt: new Date(entry.startedAt),
        completedAt: entry.completedAt ? new Date(entry.completedAt) : null,
      })),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      completedAt: data.completedAt ? new Date(data.completedAt) : null,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : null,
      failedAt: data.failedAt ? new Date(data.failedAt) : null,
    };
  }

  static create(input: {
    id: string;
    tenantId: string;
    workflowDefinitionId: string;
    workflowVersion: number;
    startedByUserId: string;
    sourceType: WorkflowInstanceData["sourceType"];
    sourceReferenceId?: string | null;
    variables?: Readonly<Record<string, unknown>>;
    startStep: WorkflowStep;
  }): WorkflowInstance {
    const now = new Date();
    return new WorkflowInstance({
      id: input.id,
      tenantId: input.tenantId,
      workflowDefinitionId: input.workflowDefinitionId,
      workflowVersion: input.workflowVersion,
      status: "RUNNING",
      currentStepId: input.startStep.id,
      variables: clone(input.variables ?? {}),
      executionHistory: [],
      startedByUserId: input.startedByUserId,
      sourceType: input.sourceType,
      sourceReferenceId: input.sourceReferenceId ?? null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
      failedAt: null,
      failureReason: null,
    });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get workflowDefinitionId() { return this.data.workflowDefinitionId; }
  get workflowVersion() { return this.data.workflowVersion; }
  get status() { return this.data.status; }
  get currentStepId() { return this.data.currentStepId; }
  get variables(): Readonly<Record<string, unknown>> { return clone(this.data.variables); }
  get executionHistory(): readonly WorkflowExecutionEntry[] { return clone(this.data.executionHistory); }
  get startedByUserId() { return this.data.startedByUserId; }
  get sourceType() { return this.data.sourceType; }
  get sourceReferenceId() { return this.data.sourceReferenceId; }
  get createdAt() { return new Date(this.data.createdAt); }
  get updatedAt() { return new Date(this.data.updatedAt); }

  setVariables(values: Readonly<Record<string, unknown>>): void {
    this.data = { ...this.data, variables: { ...this.data.variables, ...clone(values) }, updatedAt: new Date() };
  }

  enterWaiting(step: WorkflowStep): void {
    this.ensureActive();
    this.data = { ...this.data, status: "WAITING", currentStepId: step.id, updatedAt: new Date() };
  }

  resume(): void {
    if (this.data.status !== "WAITING") throw new Error("Only waiting workflows can resume");
    this.data = { ...this.data, status: "RUNNING", updatedAt: new Date() };
  }

  recordStep(step: WorkflowStep, status: WorkflowExecutionEntry["status"], actorUserId: string | null, output?: Readonly<Record<string, unknown>> | null, error?: string | null): void {
    const now = new Date();
    const entry: WorkflowExecutionEntry = {
      stepId: step.id,
      stepName: step.name,
      stepType: step.type,
      status,
      startedAt: now,
      completedAt: status === "WAITING" ? null : now,
      actorUserId,
      output: output ? clone(output) : null,
      error: error ?? null,
    };
    this.data = { ...this.data, executionHistory: [...this.data.executionHistory, entry], updatedAt: now };
  }

  moveTo(stepId: string): void {
    this.ensureActive();
    this.data = { ...this.data, status: "RUNNING", currentStepId: stepId, updatedAt: new Date() };
  }

  complete(step: WorkflowStep, actorUserId: string | null): void {
    this.recordStep(step, "COMPLETED", actorUserId);
    const now = new Date();
    this.data = { ...this.data, status: "COMPLETED", currentStepId: null, completedAt: now, updatedAt: now };
  }

  cancel(reason: string | null): void {
    this.ensureActive();
    const now = new Date();
    this.data = { ...this.data, status: "CANCELLED", currentStepId: null, cancelledAt: now, failureReason: reason, updatedAt: now };
  }

  fail(reason: string, step?: WorkflowStep | null): void {
    if (this.isTerminal()) return;
    if (step) this.recordStep(step, "FAILED", null, null, reason);
    const now = new Date();
    this.data = { ...this.data, status: "FAILED", currentStepId: null, failedAt: now, failureReason: reason, updatedAt: now };
  }

  clone(): WorkflowInstance { return new WorkflowInstance(this.toPersistence()); }
  toPersistence(): WorkflowInstanceData { return clone(this.data); }
  toJSON() {
    const data = this.toPersistence();
    return {
      ...data,
      executionHistory: data.executionHistory.map((entry) => ({ ...entry, startedAt: entry.startedAt.toISOString(), completedAt: entry.completedAt?.toISOString() ?? null })),
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString(),
      completedAt: data.completedAt?.toISOString() ?? null,
      cancelledAt: data.cancelledAt?.toISOString() ?? null,
      failedAt: data.failedAt?.toISOString() ?? null,
    };
  }

  private ensureActive() {
    if (this.isTerminal()) throw new Error(`Workflow instance is ${this.data.status}`);
  }
  private isTerminal() { return ["COMPLETED", "CANCELLED", "FAILED"].includes(this.data.status as WorkflowInstanceStatus); }
}

export class HumanTask {
  private data: HumanTaskData;

  constructor(data: HumanTaskData) {
    this.data = {
      ...data,
      candidateUserIds: [...data.candidateUserIds],
      candidateRoles: [...data.candidateRoles],
      output: data.output ? clone(data.output) : null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      completedAt: data.completedAt ? new Date(data.completedAt) : null,
    };
  }

  static create(input: Omit<HumanTaskData, "status" | "output" | "createdAt" | "updatedAt" | "completedAt">): HumanTask {
    const now = new Date();
    return new HumanTask({ ...input, status: "PENDING", output: null, createdAt: now, updatedAt: now, completedAt: null });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get workflowInstanceId() { return this.data.workflowInstanceId; }
  get workflowDefinitionId() { return this.data.workflowDefinitionId; }
  get workflowVersion() { return this.data.workflowVersion; }
  get stepId() { return this.data.stepId; }
  get kind() { return this.data.kind; }
  get name() { return this.data.name; }
  get status() { return this.data.status; }
  get assigneeUserId() { return this.data.assigneeUserId; }
  get candidateUserIds() { return [...this.data.candidateUserIds]; }
  get candidateRoles() { return [...this.data.candidateRoles]; }
  get dueAt() { return this.data.dueAt ? new Date(this.data.dueAt) : null; }

  isEligible(userId: string, roles: readonly string[]): boolean {
    if (this.data.assigneeUserId) return this.data.assigneeUserId === userId;
    const userMatch = this.data.candidateUserIds.length === 0 || this.data.candidateUserIds.includes(userId);
    const roleMatch = this.data.candidateRoles.length === 0 || roles.some((role) => this.data.candidateRoles.includes(role));
    return userMatch && roleMatch;
  }

  claim(userId: string, roles: readonly string[]): void {
    if (this.data.status !== "PENDING") throw new Error("Only pending tasks can be claimed");
    if (!this.isEligible(userId, roles)) throw new Error("User is not eligible to claim this task");
    this.data = { ...this.data, assigneeUserId: userId, status: "CLAIMED", updatedAt: new Date() };
  }

  start(userId: string): void {
    if (this.data.status !== "CLAIMED" && this.data.status !== "PENDING") throw new Error("Task cannot be started in its current state");
    if (this.data.assigneeUserId && this.data.assigneeUserId !== userId) throw new Error("Task is assigned to another user");
    this.data = { ...this.data, assigneeUserId: userId, status: "IN_PROGRESS", updatedAt: new Date() };
  }

  complete(userId: string, output?: Readonly<Record<string, unknown>>): void {
    if (!["PENDING", "CLAIMED", "IN_PROGRESS"].includes(this.data.status)) throw new Error("Task cannot be completed in its current state");
    if (this.data.assigneeUserId && this.data.assigneeUserId !== userId) throw new Error("Task is assigned to another user");
    const now = new Date();
    this.data = { ...this.data, assigneeUserId: this.data.assigneeUserId ?? userId, status: "COMPLETED", output: output ? clone(output) : null, completedAt: now, updatedAt: now };
  }

  cancel(): void {
    if (this.data.status === "COMPLETED") return;
    this.data = { ...this.data, status: "CANCELLED", updatedAt: new Date() };
  }

  clone() { return new HumanTask(this.toPersistence()); }
  toPersistence(): HumanTaskData { return clone(this.data); }
  toJSON() {
    const data = this.toPersistence();
    return { ...data, dueAt: data.dueAt?.toISOString() ?? null, createdAt: data.createdAt.toISOString(), updatedAt: data.updatedAt.toISOString(), completedAt: data.completedAt?.toISOString() ?? null };
  }
}
