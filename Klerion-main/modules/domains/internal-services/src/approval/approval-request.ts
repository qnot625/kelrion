export type ApprovalStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'MORE_INFO_REQUESTED'
  | 'DELEGATED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'EXPIRED';

export type ApprovalAction =
  | 'APPROVE'
  | 'REJECT'
  | 'DELEGATE'
  | 'REQUEST_MORE_INFO'
  | 'RESUME'
  | 'CANCEL'
  | 'TIMEOUT';

export interface ApprovalDecision {
  id: string;
  stepId: string;
  action: ApprovalAction;
  actorUserId: string;
  actorRole?: string;
  comment?: string;
  question?: string;
  targetUserId?: string;
  data?: Record<string, unknown>;
  decidedAt: Date;
}

export interface EscalationRule {
  id: string;
  triggerAfterMs: number;
  action: 'NOTIFY' | 'REASSIGN' | 'AUTO_APPROVE' | 'AUTO_REJECT';
  targetUserId?: string;
  targetRole?: string;
}

export interface ApprovalStepProps {
  id: string;
  name: string;
  stepOrder: number;
  status?: ApprovalStatus;
  requiredApproversCount?: number;
  assignedUserIds?: string[];
  assignedRoles?: string[];
  decisions?: ApprovalDecision[];
  dueAt?: Date;
  escalationTargetUserId?: string;
  escalationRules?: EscalationRule[];
  metadata?: Record<string, unknown>;
}

export class ApprovalStep {
  public readonly id: string;
  public readonly name: string;
  public readonly stepOrder: number;
  private _status: ApprovalStatus;
  public readonly requiredApproversCount: number;
  private _assignedUserIds: string[];
  public readonly assignedRoles: string[];
  private _decisions: ApprovalDecision[];
  public dueAt?: Date;
  public escalationTargetUserId?: string;
  public escalationRules: EscalationRule[];
  public metadata: Record<string, unknown>;

  constructor(props: ApprovalStepProps) {
    this.id = props.id;
    this.name = props.name;
    this.stepOrder = props.stepOrder;
    this._status = props.status || 'PENDING';
    this.requiredApproversCount = props.requiredApproversCount || 1;
    this._assignedUserIds = props.assignedUserIds ? [...props.assignedUserIds] : [];
    this.assignedRoles = props.assignedRoles ? [...props.assignedRoles] : [];
    this._decisions = props.decisions ? [...props.decisions] : [];
    this.dueAt = props.dueAt;
    this.escalationTargetUserId = props.escalationTargetUserId;
    this.escalationRules = props.escalationRules ? [...props.escalationRules] : [];
    this.metadata = props.metadata ? { ...props.metadata } : {};
  }

  public get status(): ApprovalStatus {
    return this._status;
  }

  public get assignedUserIds(): string[] {
    return [...this._assignedUserIds];
  }

  public get decisions(): ApprovalDecision[] {
    return [...this._decisions];
  }

  public setStatus(status: ApprovalStatus): void {
    this._status = status;
  }

  public addDecision(decision: ApprovalDecision): void {
    this._decisions.push(decision);
  }

  public addAssignee(userId: string): void {
    if (!this._assignedUserIds.includes(userId)) {
      this._assignedUserIds.push(userId);
    }
  }

  public toJSON() {
    return {
      id: this.id,
      name: this.name,
      stepOrder: this.stepOrder,
      status: this._status,
      requiredApproversCount: this.requiredApproversCount,
      assignedUserIds: [...this._assignedUserIds],
      assignedRoles: [...this.assignedRoles],
      decisions: [...this._decisions],
      dueAt: this.dueAt?.toISOString(),
      escalationTargetUserId: this.escalationTargetUserId,
      escalationRules: [...this.escalationRules],
      metadata: { ...this.metadata },
    };
  }
}

export interface ApprovalRequestProps {
  id: string;
  tenantId: string;
  title: string;
  description?: string;
  workflowInstanceId?: string;
  workflowStepId?: string;
  requesterUserId: string;
  currentStepIndex?: number;
  status?: ApprovalStatus;
  steps: ApprovalStepProps[] | ApprovalStep[];
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date;
}

export class ApprovalRequest {
  public readonly id: string;
  public readonly tenantId: string;
  public title: string;
  public description?: string;
  public readonly workflowInstanceId?: string;
  public readonly workflowStepId?: string;
  public readonly requesterUserId: string;
  private _currentStepIndex: number;
  private _status: ApprovalStatus;
  private _steps: ApprovalStep[];
  public metadata: Record<string, unknown>;
  public readonly createdAt: Date;
  private _updatedAt: Date;
  private _completedAt?: Date;

  private constructor(props: ApprovalRequestProps) {
    if (!props.tenantId || props.tenantId.trim() === '') {
      throw new Error('ApprovalRequest tenantId is required');
    }
    if (!props.id || props.id.trim() === '') {
      throw new Error('ApprovalRequest id is required');
    }
    if (!props.title || props.title.trim() === '') {
      throw new Error('ApprovalRequest title is required');
    }
    if (!props.requesterUserId || props.requesterUserId.trim() === '') {
      throw new Error('ApprovalRequest requesterUserId is required');
    }

    this.id = props.id;
    this.tenantId = props.tenantId;
    this.title = props.title;
    this.description = props.description;
    this.workflowInstanceId = props.workflowInstanceId;
    this.workflowStepId = props.workflowStepId;
    this.requesterUserId = props.requesterUserId;
    this._currentStepIndex = props.currentStepIndex ?? 0;
    this._status = props.status || 'PENDING';

    if (!props.steps || props.steps.length === 0) {
      throw new Error('ApprovalRequest must contain at least one step');
    }

    this._steps = props.steps.map((s, idx) => {
      if (s instanceof ApprovalStep) return s;
      return new ApprovalStep({ ...s, stepOrder: s.stepOrder ?? idx });
    });

    this.metadata = props.metadata ? { ...props.metadata } : {};
    this.createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
    this._completedAt = props.completedAt;

    // Activate initial step if status is PENDING/IN_PROGRESS
    if (this._status === 'PENDING') {
      this._status = 'IN_PROGRESS';
      if (this._steps[0]) {
        this._steps[0].setStatus('IN_PROGRESS');
      }
    }
  }

  public static create(props: ApprovalRequestProps): ApprovalRequest {
    return new ApprovalRequest(props);
  }

  public get currentStepIndex(): number {
    return this._currentStepIndex;
  }

  public get status(): ApprovalStatus {
    return this._status;
  }

  public get steps(): ApprovalStep[] {
    return [...this._steps];
  }

  public get currentStep(): ApprovalStep | undefined {
    return this._steps[this._currentStepIndex];
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public get completedAt(): Date | undefined {
    return this._completedAt;
  }

  private assertActive(actionName: string): void {
    if (
      this._status === 'APPROVED' ||
      this._status === 'REJECTED' ||
      this._status === 'CANCELLED' ||
      this._status === 'TIMED_OUT' ||
      this._status === 'EXPIRED'
    ) {
      throw new Error(`Cannot perform '${actionName}' on ApprovalRequest '${this.id}' in terminal state '${this._status}'`);
    }
  }

  public approve(
    stepId: string,
    actorUserId: string,
    comment?: string,
    data?: Record<string, unknown>,
    actorRole?: string
  ): void {
    this.assertActive('approve');
    const step = this._steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step '${stepId}' not found in ApprovalRequest '${this.id}'`);
    }

    const decision: ApprovalDecision = {
      id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      stepId,
      action: 'APPROVE',
      actorUserId,
      actorRole,
      comment,
      data,
      decidedAt: new Date(),
    };

    step.addDecision(decision);

    const approveCount = step.decisions.filter((d) => d.action === 'APPROVE').length;
    if (approveCount >= step.requiredApproversCount) {
      step.setStatus('APPROVED');

      // Check if there are further steps
      if (this._currentStepIndex < this._steps.length - 1) {
        this._currentStepIndex++;
        const nextStep = this._steps[this._currentStepIndex];
        nextStep.setStatus('IN_PROGRESS');
        this._status = 'IN_PROGRESS';
      } else {
        this._status = 'APPROVED';
        this._completedAt = new Date();
      }
    }

    this._updatedAt = new Date();
  }

  public reject(
    stepId: string,
    actorUserId: string,
    comment?: string,
    data?: Record<string, unknown>,
    actorRole?: string
  ): void {
    this.assertActive('reject');
    const step = this._steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step '${stepId}' not found in ApprovalRequest '${this.id}'`);
    }

    const decision: ApprovalDecision = {
      id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      stepId,
      action: 'REJECT',
      actorUserId,
      actorRole,
      comment,
      data,
      decidedAt: new Date(),
    };

    step.addDecision(decision);
    step.setStatus('REJECTED');
    this._status = 'REJECTED';
    this._completedAt = new Date();
    this._updatedAt = new Date();
  }

  public delegate(
    stepId: string,
    actorUserId: string,
    targetUserId: string,
    comment?: string
  ): void {
    this.assertActive('delegate');
    const step = this._steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step '${stepId}' not found in ApprovalRequest '${this.id}'`);
    }

    const decision: ApprovalDecision = {
      id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      stepId,
      action: 'DELEGATE',
      actorUserId,
      targetUserId,
      comment,
      decidedAt: new Date(),
    };

    step.addDecision(decision);
    step.addAssignee(targetUserId);
    step.setStatus('DELEGATED');
    this._status = 'DELEGATED';
    this._updatedAt = new Date();
  }

  public requestMoreInfo(
    stepId: string,
    actorUserId: string,
    question: string,
    targetUserId?: string
  ): void {
    this.assertActive('requestMoreInfo');
    const step = this._steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step '${stepId}' not found in ApprovalRequest '${this.id}'`);
    }

    const decision: ApprovalDecision = {
      id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      stepId,
      action: 'REQUEST_MORE_INFO',
      actorUserId,
      question,
      targetUserId: targetUserId || this.requesterUserId,
      decidedAt: new Date(),
    };

    step.addDecision(decision);
    step.setStatus('MORE_INFO_REQUESTED');
    this._status = 'MORE_INFO_REQUESTED';
    this._updatedAt = new Date();
  }

  public resume(
    actorUserId: string,
    comment?: string,
    responseData?: Record<string, unknown>
  ): void {
    if (this._status !== 'MORE_INFO_REQUESTED' && this._status !== 'DELEGATED') {
      throw new Error(`Cannot resume ApprovalRequest '${this.id}' from status '${this._status}' (must be MORE_INFO_REQUESTED or DELEGATED)`);
    }

    const step = this.currentStep;
    if (step) {
      const decision: ApprovalDecision = {
        id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stepId: step.id,
        action: 'RESUME',
        actorUserId,
        comment,
        data: responseData,
        decidedAt: new Date(),
      };

      step.addDecision(decision);
      step.setStatus('IN_PROGRESS');
    }

    this._status = 'IN_PROGRESS';
    this._updatedAt = new Date();
  }

  public cancel(actorUserId: string, reason?: string): void {
    this.assertActive('cancel');
    this._status = 'CANCELLED';
    this._completedAt = new Date();
    this._updatedAt = new Date();

    const step = this.currentStep;
    if (step) {
      step.setStatus('CANCELLED');
      step.addDecision({
        id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stepId: step.id,
        action: 'CANCEL',
        actorUserId,
        comment: reason,
        decidedAt: new Date(),
      });
    }
  }

  public timeout(reason?: string): void {
    this.assertActive('timeout');
    this._status = 'TIMED_OUT';
    this._completedAt = new Date();
    this._updatedAt = new Date();

    const step = this.currentStep;
    if (step) {
      step.setStatus('TIMED_OUT');
      step.addDecision({
        id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        stepId: step.id,
        action: 'TIMEOUT',
        actorUserId: 'system',
        comment: reason || 'SLA timeout exceeded',
        decidedAt: new Date(),
      });
    }
  }

  public toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      title: this.title,
      description: this.description,
      workflowInstanceId: this.workflowInstanceId,
      workflowStepId: this.workflowStepId,
      requesterUserId: this.requesterUserId,
      currentStepIndex: this._currentStepIndex,
      status: this._status,
      steps: this._steps.map((s) => s.toJSON()),
      metadata: { ...this.metadata },
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      completedAt: this._completedAt?.toISOString(),
    };
  }
}
