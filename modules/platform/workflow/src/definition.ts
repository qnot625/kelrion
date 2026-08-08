import type {
  WorkflowDefinitionData,
  WorkflowMetadata,
  WorkflowStep,
  WorkflowTrigger,
} from "./types.js";

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class WorkflowDefinition {
  private data: WorkflowDefinitionData;

  constructor(data: WorkflowDefinitionData) {
    this.data = {
      ...data,
      name: data.name.trim(),
      description: data.description.trim(),
      steps: clone(data.steps),
      triggers: clone(data.triggers),
      metadata: clone(data.metadata),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
      archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
    };
    if (!this.data.id.trim()) throw new Error("Workflow definition ID is required");
    if (!this.data.tenantId.trim()) throw new Error("Tenant ID is required");
    if (!this.data.name) throw new Error("Workflow name is required");
    if (!Number.isInteger(this.data.version) || this.data.version < 1) throw new Error("Workflow version must be >= 1");
  }

  static create(input: {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    startStepId?: string;
    steps?: readonly WorkflowStep[];
    triggers?: readonly WorkflowTrigger[];
    metadata?: WorkflowMetadata;
  }): WorkflowDefinition {
    const now = new Date();
    const steps = clone(input.steps ?? []);
    const detectedStart = input.startStepId?.trim() || steps.find((step) => step.type === "START")?.id || "";
    return new WorkflowDefinition({
      id: input.id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? "",
      version: 1,
      status: "DRAFT",
      startStepId: detectedStart,
      steps,
      triggers: clone(input.triggers ?? [{ type: "MANUAL" }]),
      metadata: clone(input.metadata ?? {}),
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      archivedAt: null,
    });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get name() { return this.data.name; }
  get description() { return this.data.description; }
  get version() { return this.data.version; }
  get status() { return this.data.status; }
  get startStepId() { return this.data.startStepId; }
  get steps(): readonly WorkflowStep[] { return clone(this.data.steps); }
  get triggers(): readonly WorkflowTrigger[] { return clone(this.data.triggers); }
  get metadata(): WorkflowMetadata { return clone(this.data.metadata); }
  get createdAt() { return new Date(this.data.createdAt); }
  get updatedAt() { return new Date(this.data.updatedAt); }
  get publishedAt() { return this.data.publishedAt ? new Date(this.data.publishedAt) : null; }
  get archivedAt() { return this.data.archivedAt ? new Date(this.data.archivedAt) : null; }

  getStep(id: string): WorkflowStep | null {
    const step = this.data.steps.find((candidate) => candidate.id === id);
    return step ? clone(step) : null;
  }

  prepareDraftRevision(): void {
    if (this.data.status === "ARCHIVED") throw new Error("Archived workflows cannot be edited");
    if (this.data.status === "PUBLISHED") {
      this.data = {
        ...this.data,
        version: this.data.version + 1,
        status: "DRAFT",
        publishedAt: null,
        updatedAt: new Date(),
      };
    }
  }

  updateDraft(input: {
    name?: string;
    description?: string;
    startStepId?: string;
    steps?: readonly WorkflowStep[];
    triggers?: readonly WorkflowTrigger[];
    metadata?: WorkflowMetadata;
  }): void {
    if (this.data.status !== "DRAFT") throw new Error("Only draft workflows can be edited");
    const name = input.name === undefined ? this.data.name : input.name.trim();
    if (!name) throw new Error("Workflow name cannot be empty");
    const steps = clone(input.steps ?? this.data.steps);
    const startStepId = input.startStepId === undefined
      ? this.data.startStepId || steps.find((step) => step.type === "START")?.id || ""
      : input.startStepId.trim();
    this.data = {
      ...this.data,
      name,
      description: input.description === undefined ? this.data.description : input.description.trim(),
      startStepId,
      steps,
      triggers: clone(input.triggers ?? this.data.triggers),
      metadata: clone(input.metadata ?? this.data.metadata),
      updatedAt: new Date(),
    };
  }

  publish(): void {
    if (this.data.status !== "DRAFT") throw new Error("Only draft workflows can be published");
    this.validateGraph();
    const now = new Date();
    this.data = { ...this.data, status: "PUBLISHED", publishedAt: now, archivedAt: null, updatedAt: now };
  }

  archive(): void {
    if (this.data.status === "ARCHIVED") return;
    const now = new Date();
    this.data = { ...this.data, status: "ARCHIVED", archivedAt: now, updatedAt: now };
  }

  validateGraph(): void {
    if (this.data.steps.length < 2) throw new Error("Workflow must contain at least START and END steps");
    const ids = new Set<string>();
    let startCount = 0;
    let endCount = 0;
    for (const step of this.data.steps) {
      if (!step.id.trim() || !step.name.trim()) throw new Error("Every workflow step requires an ID and name");
      if (ids.has(step.id)) throw new Error(`Duplicate workflow step '${step.id}'`);
      ids.add(step.id);
      if (step.type === "START") startCount += 1;
      if (step.type === "END") endCount += 1;
      if (step.type === "END" && step.transitions.length) throw new Error(`END step '${step.id}' cannot have outgoing transitions`);
      if (step.type !== "END" && step.transitions.length === 0) throw new Error(`Step '${step.id}' requires an outgoing transition`);
      if (step.type === "AUTOMATIC_TASK" && !step.automaticConfig) throw new Error(`Automatic step '${step.id}' requires an automaticConfig`);
      if (step.type !== "AUTOMATIC_TASK" && step.automaticConfig) throw new Error(`Only AUTOMATIC_TASK steps may define automaticConfig`);
    }
    if (startCount !== 1) throw new Error("Workflow must contain exactly one START step");
    if (endCount < 1) throw new Error("Workflow must contain at least one END step");
    const start = this.getStep(this.data.startStepId);
    if (!start || start.type !== "START") throw new Error("startStepId must reference the START step");

    for (const step of this.data.steps) {
      const defaults = step.transitions.filter((transition) => transition.isDefault);
      if (defaults.length > 1) throw new Error(`Step '${step.id}' cannot have more than one default transition`);
      for (const transition of step.transitions) {
        if (!ids.has(transition.targetStepId)) throw new Error(`Step '${step.id}' targets missing step '${transition.targetStepId}'`);
      }
    }

    const reachable = new Set<string>();
    const stack = [this.data.startStepId];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const step = this.getStep(id);
      for (const transition of step?.transitions ?? []) stack.push(transition.targetStepId);
    }
    if (!this.data.steps.some((step) => step.type === "END" && reachable.has(step.id))) {
      throw new Error("START step cannot reach an END step");
    }
    const unreachable = this.data.steps.filter((step) => !reachable.has(step.id));
    if (unreachable.length) throw new Error(`Unreachable workflow steps: ${unreachable.map((step) => step.id).join(", ")}`);
  }

  clone(): WorkflowDefinition { return new WorkflowDefinition(this.toPersistence()); }

  toPersistence(): WorkflowDefinitionData {
    return {
      ...this.data,
      steps: clone(this.data.steps),
      triggers: clone(this.data.triggers),
      metadata: clone(this.data.metadata),
      createdAt: new Date(this.data.createdAt),
      updatedAt: new Date(this.data.updatedAt),
      publishedAt: this.data.publishedAt ? new Date(this.data.publishedAt) : null,
      archivedAt: this.data.archivedAt ? new Date(this.data.archivedAt) : null,
    };
  }

  toJSON() {
    const data = this.toPersistence();
    return {
      ...data,
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString(),
      publishedAt: data.publishedAt?.toISOString() ?? null,
      archivedAt: data.archivedAt?.toISOString() ?? null,
    };
  }
}
