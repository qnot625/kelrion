import type { QueueConfigurationData } from "./types.js";

export class QueueConfiguration {
  private data: QueueConfigurationData;
  constructor(data: QueueConfigurationData) {
    this.data = { ...data, prefix: data.prefix.trim().toUpperCase(), createdAt: new Date(data.createdAt), updatedAt: new Date(data.updatedAt) };
    this.validate();
  }
  static create(input: Omit<QueueConfigurationData, "createdAt" | "updatedAt">) {
    const now = new Date();
    return new QueueConfiguration({ ...input, createdAt: now, updatedAt: now });
  }
  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get branchId() { return this.data.branchId; }
  get serviceId() { return this.data.serviceId; }
  get departmentId() { return this.data.departmentId; }
  get prefix() { return this.data.prefix; }
  get averageServiceMinutes() { return this.data.averageServiceMinutes; }
  get allowWalkIns() { return this.data.allowWalkIns; }
  get allowAppointmentCheckIn() { return this.data.allowAppointmentCheckIn; }
  get maxEarlyCheckInMinutes() { return this.data.maxEarlyCheckInMinutes; }
  get maxLateCheckInMinutes() { return this.data.maxLateCheckInMinutes; }
  get maxConcurrentServing() { return this.data.maxConcurrentServing; }
  get createdAt() { return new Date(this.data.createdAt); }
  get updatedAt() { return new Date(this.data.updatedAt); }
  update(input: Partial<Pick<QueueConfigurationData, "departmentId" | "prefix" | "averageServiceMinutes" | "allowWalkIns" | "allowAppointmentCheckIn" | "maxEarlyCheckInMinutes" | "maxLateCheckInMinutes" | "maxConcurrentServing">>) {
    this.data = { ...this.data, ...input, prefix: input.prefix === undefined ? this.data.prefix : input.prefix.trim().toUpperCase(), updatedAt: new Date() };
    this.validate();
  }
  clone() { return new QueueConfiguration(this.toPersistence()); }
  toPersistence(): QueueConfigurationData { return structuredClone(this.data); }
  toJSON() { const d = this.toPersistence(); return { ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() }; }
  private validate() {
    if (!this.data.id.trim() || !this.data.tenantId.trim() || !this.data.branchId.trim() || !this.data.serviceId.trim()) throw new Error("Queue configuration requires id, tenantId, branchId and serviceId");
    if (!/^[A-Z0-9]{1,8}$/.test(this.data.prefix)) throw new Error("Queue ticket prefix must contain 1-8 uppercase letters or numbers");
    if (!Number.isInteger(this.data.averageServiceMinutes) || this.data.averageServiceMinutes < 1) throw new Error("averageServiceMinutes must be a positive integer");
    if (!Number.isInteger(this.data.maxConcurrentServing) || this.data.maxConcurrentServing < 1) throw new Error("maxConcurrentServing must be a positive integer");
    for (const value of [this.data.maxEarlyCheckInMinutes, this.data.maxLateCheckInMinutes]) if (value !== null && (!Number.isInteger(value) || value < 0)) throw new Error("Check-in windows must be non-negative integers or null");
  }
}
