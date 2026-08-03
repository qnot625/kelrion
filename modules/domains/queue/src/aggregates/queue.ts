import { QueueId, TicketId, TenantId, BranchId } from "../value-objects/identifiers.js";
import { TicketNumber } from "../value-objects/ticket-number.js";
import { QueuePriority } from "../enums/queue-priority.js";
import { QueueTicket } from "./queue-ticket.js";

export interface QueueProps {
  id: QueueId;
  tenantId: TenantId;
  branchId: BranchId;
  code: string;
  name: string;
  prefix: string;
  isActive?: boolean;
  isPaused?: boolean;
  currentSequence?: number;
  avgServiceTimeMinutes?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const PRIORITY_WEIGHTS: Record<QueuePriority, number> = {
  [QueuePriority.EMERGENCY]: 4,
  [QueuePriority.APPOINTMENT]: 3,
  [QueuePriority.VIP]: 2,
  [QueuePriority.STANDARD]: 1,
};

export class Queue {
  private readonly _id: QueueId;
  private readonly _tenantId: TenantId;
  private readonly _branchId: BranchId;
  private _code: string;
  private _name: string;
  private _prefix: string;
  private _isActive: boolean;
  private _isPaused: boolean;
  private _currentSequence: number;
  private _avgServiceTimeMinutes: number;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: QueueProps) {
    this._id = props.id;
    this._tenantId = props.tenantId;
    this._branchId = props.branchId;
    this._code = props.code;
    this._name = props.name;
    this._prefix = props.prefix.toUpperCase();
    this._isActive = props.isActive ?? true;
    this._isPaused = props.isPaused ?? false;
    this._currentSequence = props.currentSequence ?? 0;
    this._avgServiceTimeMinutes = props.avgServiceTimeMinutes ?? 5;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
  }

  get id(): QueueId { return this._id; }
  get tenantId(): TenantId { return this._tenantId; }
  get branchId(): BranchId { return this._branchId; }
  get code(): string { return this._code; }
  get name(): string { return this._name; }
  get prefix(): string { return this._prefix; }
  get isActive(): boolean { return this._isActive; }
  get isPaused(): boolean { return this._isPaused; }
  get currentSequence(): number { return this._currentSequence; }
  get avgServiceTimeMinutes(): number { return this._avgServiceTimeMinutes; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  pause(): void {
    this._isPaused = true;
    this._updatedAt = new Date();
  }

  resume(): void {
    this._isPaused = false;
    this._updatedAt = new Date();
  }

  activate(): void {
    this._isActive = true;
    this._updatedAt = new Date();
  }

  deactivate(): void {
    this._isActive = false;
    this._updatedAt = new Date();
  }

  updateConfig(config: { name?: string; code?: string; prefix?: string; avgServiceTimeMinutes?: number }): void {
    if (config.name !== undefined) this._name = config.name;
    if (config.code !== undefined) this._code = config.code;
    if (config.prefix !== undefined) this._prefix = config.prefix.toUpperCase();
    if (config.avgServiceTimeMinutes !== undefined) this._avgServiceTimeMinutes = config.avgServiceTimeMinutes;
    this._updatedAt = new Date();
  }

  /**
   * Issues a new ticket for this queue, auto-incrementing current sequence.
   */
  issueTicket(options?: {
    customerName?: string;
    customerPhone?: string;
    priority?: QueuePriority;
    serviceId?: string;
    idempotencyKey?: string;
  }): QueueTicket {
    if (!this._isActive) {
      throw new Error(`Cannot issue ticket for inactive queue '${this._name}'`);
    }
    if (this._isPaused) {
      throw new Error(`Cannot issue ticket for paused queue '${this._name}'`);
    }

    this._currentSequence += 1;
    this._updatedAt = new Date();

    const ticketNumber = TicketNumber.create(this._prefix, this._currentSequence);

    return new QueueTicket({
      id: TicketId.generate(),
      tenantId: this._tenantId,
      branchId: this._branchId,
      queueId: this._id,
      number: ticketNumber,
      priority: options?.priority ?? QueuePriority.STANDARD,
      customerName: options?.customerName,
      customerPhone: options?.customerPhone,
      serviceId: options?.serviceId,
      idempotencyKey: options?.idempotencyKey,
    });
  }

  /**
   * Calculates estimated wait time in minutes for a ticket at a given queue position.
   * position is 1-indexed (1st in line = 1).
   */
  calculateWaitTimeMinutes(position: number, activeCounters = 1): number {
    if (position <= 0) return 0;
    const effectiveCounters = Math.max(1, activeCounters);
    return Math.ceil((position * this._avgServiceTimeMinutes) / effectiveCounters);
  }

  /**
   * Sorts waiting tickets by priority order (emergency > appointment > vip > standard)
   * and secondary by creation timestamp (FIFO).
   */
  static sortTicketsByPriority(tickets: QueueTicket[]): QueueTicket[] {
    return [...tickets].sort((a, b) => {
      const weightA = PRIORITY_WEIGHTS[a.priority];
      const weightB = PRIORITY_WEIGHTS[b.priority];

      if (weightA !== weightB) {
        return weightB - weightA; // Higher weight first
      }

      return a.createdAt.getTime() - b.createdAt.getTime(); // Older creation time first
    });
  }
}
