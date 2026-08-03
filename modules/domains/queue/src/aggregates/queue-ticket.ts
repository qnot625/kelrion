import { QueueId, TicketId, TenantId, BranchId } from "../value-objects/identifiers.js";
import { TicketNumber } from "../value-objects/ticket-number.js";
import { TicketStatus } from "../enums/ticket-status.js";
import { QueuePriority } from "../enums/queue-priority.js";

export class InvalidStateTransitionError extends Error {
  constructor(from: TicketStatus, to: TicketStatus, reason?: string) {
    super(`Cannot transition ticket from '${from}' to '${to}'${reason ? `: ${reason}` : ""}`);
    this.name = "InvalidStateTransitionError";
  }
}

export interface QueueTicketProps {
  id: TicketId;
  tenantId: TenantId;
  branchId: BranchId;
  queueId: QueueId;
  number: TicketNumber;
  status?: TicketStatus;
  priority?: QueuePriority;
  customerName?: string | null;
  customerPhone?: string | null;
  serviceId?: string | null;
  counterId?: string | null;
  servedByUserId?: string | null;
  idempotencyKey?: string | null;
  estimatedWaitMinutes?: number;
  calledAt?: Date | null;
  serviceStartedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class QueueTicket {
  private readonly _id: TicketId;
  private readonly _tenantId: TenantId;
  private readonly _branchId: BranchId;
  private _queueId: QueueId;
  private readonly _number: TicketNumber;
  private _status: TicketStatus;
  private _priority: QueuePriority;
  private _customerName: string | null;
  private _customerPhone: string | null;
  private _serviceId: string | null;
  private _counterId: string | null;
  private _servedByUserId: string | null;
  private _idempotencyKey: string | null;
  private _estimatedWaitMinutes: number;
  private _calledAt: Date | null;
  private _serviceStartedAt: Date | null;
  private _completedAt: Date | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: QueueTicketProps) {
    this._id = props.id;
    this._tenantId = props.tenantId;
    this._branchId = props.branchId;
    this._queueId = props.queueId;
    this._number = props.number;
    this._status = props.status ?? TicketStatus.WAITING;
    this._priority = props.priority ?? QueuePriority.STANDARD;
    this._customerName = props.customerName ?? null;
    this._customerPhone = props.customerPhone ?? null;
    this._serviceId = props.serviceId ?? null;
    this._counterId = props.counterId ?? null;
    this._servedByUserId = props.servedByUserId ?? null;
    this._idempotencyKey = props.idempotencyKey ?? null;
    this._estimatedWaitMinutes = props.estimatedWaitMinutes ?? 0;
    this._calledAt = props.calledAt ?? null;
    this._serviceStartedAt = props.serviceStartedAt ?? null;
    this._completedAt = props.completedAt ?? null;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  // Getters
  get id(): TicketId { return this._id; }
  get tenantId(): TenantId { return this._tenantId; }
  get branchId(): BranchId { return this._branchId; }
  get queueId(): QueueId { return this._queueId; }
  get number(): TicketNumber { return this._number; }
  get status(): TicketStatus { return this._status; }
  get priority(): QueuePriority { return this._priority; }
  get customerName(): string | null { return this._customerName; }
  get customerPhone(): string | null { return this._customerPhone; }
  get serviceId(): string | null { return this._serviceId; }
  get counterId(): string | null { return this._counterId; }
  get servedByUserId(): string | null { return this._servedByUserId; }
  get idempotencyKey(): string | null { return this._idempotencyKey; }
  get estimatedWaitMinutes(): number { return this._estimatedWaitMinutes; }
  get calledAt(): Date | null { return this._calledAt; }
  get serviceStartedAt(): Date | null { return this._serviceStartedAt; }
  get completedAt(): Date | null { return this._completedAt; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  // State Transitions
  call(counterId: string, servedByUserId: string): void {
    if (this._status !== TicketStatus.WAITING) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.CALLED, "Only waiting tickets can be called");
    }
    this._status = TicketStatus.CALLED;
    this._counterId = counterId;
    this._servedByUserId = servedByUserId;
    this._calledAt = new Date();
    this._updatedAt = new Date();
  }

  startService(): void {
    if (this._status !== TicketStatus.CALLED) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.IN_SERVICE, "Only called tickets can start service");
    }
    this._status = TicketStatus.IN_SERVICE;
    this._serviceStartedAt = new Date();
    this._updatedAt = new Date();
  }

  complete(): void {
    if (this._status !== TicketStatus.IN_SERVICE && this._status !== TicketStatus.CALLED) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.COMPLETED, "Only called or in-service tickets can be completed");
    }
    this._status = TicketStatus.COMPLETED;
    this._completedAt = new Date();
    this._updatedAt = new Date();
  }

  markNoShow(): void {
    if (this._status !== TicketStatus.CALLED) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.NO_SHOW, "Only called tickets can be marked as no-show");
    }
    this._status = TicketStatus.NO_SHOW;
    this._updatedAt = new Date();
  }

  recall(): void {
    if (this._status !== TicketStatus.CALLED) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.CALLED, "Only called tickets can be recalled");
    }
    this._calledAt = new Date();
    this._updatedAt = new Date();
  }

  skip(): void {
    if (this._status !== TicketStatus.CALLED) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.NO_SHOW, "Only called tickets can be skipped");
    }
    this._status = TicketStatus.NO_SHOW;
    this._updatedAt = new Date();
  }

  cancel(reason?: string): void {
    if (this._status === TicketStatus.COMPLETED || this._status === TicketStatus.CANCELLED) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.CANCELLED, "Ticket is already finalized");
    }
    this._status = TicketStatus.CANCELLED;
    this._updatedAt = new Date();
  }

  transfer(targetQueueId: QueueId): void {
    if (this._status !== TicketStatus.CALLED && this._status !== TicketStatus.IN_SERVICE) {
      throw new InvalidStateTransitionError(this._status, TicketStatus.TRANSFERRED, "Only active called/in-service tickets can be transferred");
    }
    this._queueId = targetQueueId;
    this._status = TicketStatus.TRANSFERRED;
    this._counterId = null;
    this._servedByUserId = null;
    this._updatedAt = new Date();
  }

  updateEstimatedWait(minutes: number): void {
    this._estimatedWaitMinutes = Math.max(0, minutes);
    this._updatedAt = new Date();
  }
}
