export type TaskState =
  | 'PENDING'
  | 'ASSIGNED'
  | 'CLAIMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DelegationRecord {
  fromUserId: string;
  toUserId: string;
  delegatedAt: Date;
  reason?: string;
}

export type EscalationTrigger = 'DUE_DATE_PASSED' | 'SLA_EXCEEDED' | 'TIMEOUT';
export type EscalationAction = 'REASSIGN' | 'ESCALATE_ROLE' | 'NOTIFY_EVENT';

export interface EscalationRule {
  id: string;
  trigger: EscalationTrigger;
  action: EscalationAction;
  targetUserId?: string;
  targetRole?: string;
  timeoutMinutes?: number;
}

export interface HumanTaskParams {
  id: string;
  tenantId: string;
  workflowInstanceId: string;
  workflowDefinitionId?: string;
  stepId: string;
  name: string;
  description?: string;
  status?: TaskState;
  priority?: TaskPriority;
  assigneeId?: string;
  originalAssigneeId?: string;
  candidateUsers?: string[];
  candidateRoles?: string[];
  candidateGroups?: string[];
  delegationHistory?: DelegationRecord[];
  dueDate?: Date;
  slaHours?: number;
  escalationCount?: number;
  formData?: Record<string, any>;
  formDefinitionId?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
}

export class HumanTask {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly workflowInstanceId: string;
  public readonly workflowDefinitionId?: string;
  public readonly stepId: string;
  public name: string;
  public description?: string;
  public status: TaskState;
  public priority: TaskPriority;
  public assigneeId?: string;
  public originalAssigneeId?: string;
  public candidateUsers: string[];
  public candidateRoles: string[];
  public candidateGroups: string[];
  public delegationHistory: DelegationRecord[];
  public dueDate?: Date;
  public slaHours?: number;
  public escalationCount: number;
  public formData?: Record<string, any>;
  public formDefinitionId?: string;
  public metadata: Record<string, any>;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public startedAt?: Date;
  public completedAt?: Date;
  public cancelledAt?: Date;
  public expiredAt?: Date;

  constructor(params: HumanTaskParams) {
    if (!params.id || params.id.trim() === '') {
      throw new Error('Task ID is required');
    }
    if (!params.tenantId || params.tenantId.trim() === '') {
      throw new Error('Tenant ID is required');
    }
    if (!params.workflowInstanceId || params.workflowInstanceId.trim() === '') {
      throw new Error('WorkflowInstance ID is required');
    }
    if (!params.stepId || params.stepId.trim() === '') {
      throw new Error('Step ID is required');
    }
    if (!params.name || params.name.trim() === '') {
      throw new Error('Task name is required');
    }

    this.id = params.id;
    this.tenantId = params.tenantId;
    this.workflowInstanceId = params.workflowInstanceId;
    this.workflowDefinitionId = params.workflowDefinitionId;
    this.stepId = params.stepId;
    this.name = params.name;
    this.description = params.description;
    this.status = params.status ?? (params.assigneeId ? 'ASSIGNED' : 'PENDING');
    this.priority = params.priority ?? 'MEDIUM';
    this.assigneeId = params.assigneeId;
    this.originalAssigneeId = params.originalAssigneeId ?? params.assigneeId;
    this.candidateUsers = params.candidateUsers ? [...params.candidateUsers] : [];
    this.candidateRoles = params.candidateRoles ? [...params.candidateRoles] : [];
    this.candidateGroups = params.candidateGroups ? [...params.candidateGroups] : [];
    this.delegationHistory = params.delegationHistory
      ? params.delegationHistory.map((d) => ({
          ...d,
          delegatedAt: new Date(d.delegatedAt),
        }))
      : [];
    this.dueDate = params.dueDate;
    this.slaHours = params.slaHours;
    this.escalationCount = params.escalationCount ?? 0;
    this.formData = params.formData ? { ...params.formData } : undefined;
    this.formDefinitionId = params.formDefinitionId;
    this.metadata = params.metadata ? { ...params.metadata } : {};
    this.createdAt = params.createdAt ?? new Date();
    this.updatedAt = params.updatedAt ?? new Date();
    this.startedAt = params.startedAt;
    this.completedAt = params.completedAt;
    this.cancelledAt = params.cancelledAt;
    this.expiredAt = params.expiredAt;
  }

  public static create(params: {
    id: string;
    tenantId: string;
    workflowInstanceId: string;
    workflowDefinitionId?: string;
    stepId: string;
    name: string;
    description?: string;
    priority?: TaskPriority;
    assigneeId?: string;
    candidateUsers?: string[];
    candidateRoles?: string[];
    candidateGroups?: string[];
    dueDate?: Date;
    slaHours?: number;
    formDefinitionId?: string;
    metadata?: Record<string, any>;
  }): HumanTask {
    return new HumanTask({
      ...params,
    });
  }

  private ensureActive(): void {
    if (
      this.status === 'COMPLETED' ||
      this.status === 'CANCELLED' ||
      this.status === 'EXPIRED'
    ) {
      throw new Error(`Cannot perform operation on task in '${this.status}' state`);
    }
  }

  public assign(assigneeId: string): void {
    this.ensureActive();
    if (!assigneeId || assigneeId.trim() === '') {
      throw new Error('Assignee ID is required');
    }

    if (!this.originalAssigneeId) {
      this.originalAssigneeId = assigneeId;
    }

    this.assigneeId = assigneeId;
    this.status = 'ASSIGNED';
    this.updatedAt = new Date();
  }

  public reassign(newAssigneeId: string): void {
    this.assign(newAssigneeId);
  }

  public delegate(fromUserId: string, toUserId: string, reason?: string): void {
    this.ensureActive();
    if (!toUserId || toUserId.trim() === '') {
      throw new Error('Target delegate user ID is required');
    }
    if (this.assigneeId && this.assigneeId !== fromUserId) {
      throw new Error(
        `User '${fromUserId}' cannot delegate task assigned to '${this.assigneeId}'`
      );
    }

    if (!this.originalAssigneeId) {
      this.originalAssigneeId = fromUserId;
    }

    this.delegationHistory.push({
      fromUserId,
      toUserId,
      delegatedAt: new Date(),
      reason,
    });

    this.assigneeId = toUserId;
    this.status = 'ASSIGNED';
    this.updatedAt = new Date();
  }

  public claim(userId: string, userRoles: string[] = []): void {
    this.ensureActive();
    if (!userId || userId.trim() === '') {
      throw new Error('User ID is required to claim task');
    }

    if (this.assigneeId && this.assigneeId !== userId) {
      throw new Error(`Task is already assigned to '${this.assigneeId}'`);
    }

    const isCandidateUser = this.candidateUsers.length === 0 || this.candidateUsers.includes(userId);
    const isCandidateRole =
      this.candidateRoles.length === 0 ||
      userRoles.some((r) => this.candidateRoles.includes(r));

    if (!isCandidateUser && !isCandidateRole) {
      throw new Error(`User '${userId}' is not eligible to claim this task`);
    }

    this.assigneeId = userId;
    if (!this.originalAssigneeId) {
      this.originalAssigneeId = userId;
    }
    this.status = 'CLAIMED';
    this.updatedAt = new Date();
  }

  public release(): void {
    this.ensureActive();
    this.assigneeId = undefined;
    this.status = 'PENDING';
    this.updatedAt = new Date();
  }

  public start(userId: string): void {
    this.ensureActive();
    if (this.assigneeId && this.assigneeId !== userId) {
      throw new Error(`Task assigned to '${this.assigneeId}' cannot be started by '${userId}'`);
    }

    this.status = 'IN_PROGRESS';
    this.startedAt = new Date();
    this.updatedAt = new Date();
  }

  public complete(userId: string, formData?: Record<string, any>): void {
    this.ensureActive();

    if (formData) {
      this.formData = { ...this.formData, ...formData };
    }

    this.status = 'COMPLETED';
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  public cancel(reason?: string): void {
    this.ensureActive();
    this.status = 'CANCELLED';
    this.cancelledAt = new Date();
    if (reason) {
      this.metadata.cancelReason = reason;
    }
    this.updatedAt = new Date();
  }

  public expire(reason?: string): void {
    this.ensureActive();
    this.status = 'EXPIRED';
    this.expiredAt = new Date();
    if (reason) {
      this.metadata.expireReason = reason;
    }
    this.updatedAt = new Date();
  }

  public escalate(rule: EscalationRule): void {
    this.ensureActive();
    this.escalationCount += 1;

    if (rule.action === 'REASSIGN' && rule.targetUserId) {
      this.assigneeId = rule.targetUserId;
      this.status = 'ASSIGNED';
    } else if (rule.action === 'ESCALATE_ROLE' && rule.targetRole) {
      if (!this.candidateRoles.includes(rule.targetRole)) {
        this.candidateRoles.push(rule.targetRole);
      }
    }

    this.metadata[`escalation_${this.escalationCount}`] = {
      trigger: rule.trigger,
      action: rule.action,
      escalatedAt: new Date().toISOString(),
    };

    this.updatedAt = new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      workflowInstanceId: this.workflowInstanceId,
      workflowDefinitionId: this.workflowDefinitionId,
      stepId: this.stepId,
      name: this.name,
      description: this.description,
      status: this.status,
      priority: this.priority,
      assigneeId: this.assigneeId,
      originalAssigneeId: this.originalAssigneeId,
      candidateUsers: [...this.candidateUsers],
      candidateRoles: [...this.candidateRoles],
      candidateGroups: [...this.candidateGroups],
      delegationHistory: this.delegationHistory.map((d) => ({
        ...d,
        delegatedAt: d.delegatedAt.toISOString(),
      })),
      dueDate: this.dueDate?.toISOString(),
      slaHours: this.slaHours,
      escalationCount: this.escalationCount,
      formData: this.formData ? { ...this.formData } : undefined,
      formDefinitionId: this.formDefinitionId,
      metadata: { ...this.metadata },
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      startedAt: this.startedAt?.toISOString(),
      completedAt: this.completedAt?.toISOString(),
      cancelledAt: this.cancelledAt?.toISOString(),
      expiredAt: this.expiredAt?.toISOString(),
    };
  }
}
