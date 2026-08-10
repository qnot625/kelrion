import type { QueueEntryData, QueueEntryStatus, QueuePriority } from "./types.js";

const TERMINAL = new Set<QueueEntryStatus>(["COMPLETED", "NO_SHOW", "CANCELLED", "TRANSFERRED"]);
const BASE_SCORE: Record<QueuePriority, number> = { STANDARD: 100, PRIORITY: 200, URGENT: 300 };

export class QueueEntry {
  private data: QueueEntryData;
  constructor(data: QueueEntryData) {
    this.data = {
      ...data,
      customer: structuredClone(data.customer),
      metadata: structuredClone(data.metadata),
      checkedInAt: new Date(data.checkedInAt),
      calledAt: data.calledAt ? new Date(data.calledAt) : null,
      serviceStartedAt: data.serviceStartedAt ? new Date(data.serviceStartedAt) : null,
      completedAt: data.completedAt ? new Date(data.completedAt) : null,
      noShowAt: data.noShowAt ? new Date(data.noShowAt) : null,
      cancelledAt: data.cancelledAt ? new Date(data.cancelledAt) : null,
      transferredAt: data.transferredAt ? new Date(data.transferredAt) : null,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
    this.validate();
  }
  static score(priority: QueuePriority, adjustment = 0) { return BASE_SCORE[priority] + adjustment; }
  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get publicToken() { return this.data.publicToken; }
  get ticketNumber() { return this.data.ticketNumber; }
  get kind() { return this.data.kind; }
  get branchId() { return this.data.branchId; }
  get serviceId() { return this.data.serviceId; }
  get departmentId() { return this.data.departmentId; }
  get appointmentId() { return this.data.appointmentId; }
  get customer() { return structuredClone(this.data.customer); }
  get priority() { return this.data.priority; }
  get priorityAdjustment() { return this.data.priorityAdjustment; }
  get priorityScore() { return this.data.priorityScore; }
  get checkInSource() { return this.data.checkInSource; }
  get status() { return this.data.status; }
  get stationId() { return this.data.stationId; }
  get servingStaffUserId() { return this.data.servingStaffUserId; }
  get recallCount() { return this.data.recallCount; }
  get checkedInAt() { return new Date(this.data.checkedInAt); }
  get calledAt() { return this.data.calledAt ? new Date(this.data.calledAt) : null; }
  get serviceStartedAt() { return this.data.serviceStartedAt ? new Date(this.data.serviceStartedAt) : null; }
  get completedAt() { return this.data.completedAt ? new Date(this.data.completedAt) : null; }
  get noShowAt() { return this.data.noShowAt ? new Date(this.data.noShowAt) : null; }
  get cancelledAt() { return this.data.cancelledAt ? new Date(this.data.cancelledAt) : null; }
  get transferredAt() { return this.data.transferredAt ? new Date(this.data.transferredAt) : null; }
  get idempotencyKey() { return this.data.idempotencyKey; }
  get transferFromEntryId() { return this.data.transferFromEntryId; }
  get metadata() { return structuredClone(this.data.metadata); }
  get createdAt() { return new Date(this.data.createdAt); }
  get updatedAt() { return new Date(this.data.updatedAt); }
  get isTerminal() { return TERMINAL.has(this.data.status); }
  adjustPriority(priority: QueuePriority, adjustment: number) {
    this.ensureActive();
    if (!Number.isInteger(adjustment) || adjustment < -99 || adjustment > 99) throw new Error("Priority adjustment must be an integer between -99 and 99");
    this.data = { ...this.data, priority, priorityAdjustment: adjustment, priorityScore: QueueEntry.score(priority, adjustment), updatedAt: new Date() };
  }
  call(stationId: string, staffUserId: string) {
    if (this.data.status !== "WAITING") throw new Error(`Only WAITING entries can be called; current status is ${this.data.status}`);
    if (!stationId.trim() || !staffUserId.trim()) throw new Error("stationId and staffUserId are required");
    const now = new Date();
    this.data = { ...this.data, status: "CALLED", stationId: stationId.trim(), servingStaffUserId: staffUserId, calledAt: now, updatedAt: now };
  }
  recall(stationId?: string | null) {
    if (this.data.status !== "CALLED") throw new Error(`Only CALLED entries can be recalled; current status is ${this.data.status}`);
    const now = new Date();
    this.data = { ...this.data, stationId: stationId?.trim() || this.data.stationId, recallCount: this.data.recallCount + 1, calledAt: now, updatedAt: now };
  }
  startService(staffUserId: string, stationId?: string | null) {
    if (this.data.status !== "CALLED") throw new Error(`Only CALLED entries can start service; current status is ${this.data.status}`);
    const now = new Date();
    this.data = { ...this.data, status: "SERVING", servingStaffUserId: staffUserId, stationId: stationId?.trim() || this.data.stationId, serviceStartedAt: now, updatedAt: now };
  }
  complete() {
    if (this.data.status !== "SERVING") throw new Error(`Only SERVING entries can be completed; current status is ${this.data.status}`);
    const now = new Date();
    this.data = { ...this.data, status: "COMPLETED", completedAt: now, updatedAt: now };
  }
  markNoShow() {
    if (this.data.status !== "CALLED") throw new Error(`Only CALLED entries can be marked no-show; current status is ${this.data.status}`);
    const now = new Date();
    this.data = { ...this.data, status: "NO_SHOW", noShowAt: now, updatedAt: now };
  }
  cancel() {
    if (this.isTerminal) throw new Error(`Queue entry is already terminal (${this.data.status})`);
    const now = new Date();
    this.data = { ...this.data, status: "CANCELLED", cancelledAt: now, updatedAt: now };
  }
  markTransferred() {
    if (this.isTerminal) throw new Error(`Queue entry is already terminal (${this.data.status})`);
    const now = new Date();
    this.data = { ...this.data, status: "TRANSFERRED", transferredAt: now, updatedAt: now };
  }
  clone() { return new QueueEntry(this.toPersistence()); }
  toPersistence(): QueueEntryData { return structuredClone(this.data); }
  toJSON() {
    const d = this.toPersistence();
    return { ...d, checkedInAt: d.checkedInAt.toISOString(), calledAt: d.calledAt?.toISOString() ?? null, serviceStartedAt: d.serviceStartedAt?.toISOString() ?? null, completedAt: d.completedAt?.toISOString() ?? null, noShowAt: d.noShowAt?.toISOString() ?? null, cancelledAt: d.cancelledAt?.toISOString() ?? null, transferredAt: d.transferredAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() };
  }
  private ensureActive() { if (this.isTerminal) throw new Error(`Queue entry is terminal (${this.data.status})`); }
  private validate() {
    if (!this.data.id.trim() || !this.data.tenantId.trim() || !this.data.branchId.trim() || !this.data.serviceId.trim() || !this.data.publicToken.trim() || !this.data.ticketNumber.trim()) throw new Error("Queue entry requires identity, tenant, branch, service, public token and ticket number");
    if (this.data.priorityScore !== QueueEntry.score(this.data.priority, this.data.priorityAdjustment)) throw new Error("Queue entry priority score is inconsistent");
    if (this.data.kind === "APPOINTMENT" && !this.data.appointmentId) throw new Error("Appointment queue entries require appointmentId");
  }
}
