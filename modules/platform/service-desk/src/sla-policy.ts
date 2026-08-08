import type { ServiceDeskPriority, ServiceDeskSlaPolicyData, ServiceDeskTicketStatus, ServiceDeskTicketType } from "./types.js";

function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }

export class ServiceDeskSlaPolicy {
  private data: ServiceDeskSlaPolicyData;

  constructor(data: ServiceDeskSlaPolicyData) {
    this.data = {
      ...data,
      name: data.name.trim(),
      description: data.description.trim(),
      ticketTypes: unique(data.ticketTypes),
      priorities: unique(data.priorities),
      categoryKeys: unique(data.categoryKeys.map((value) => value.trim()).filter(Boolean)),
      pauseStatuses: unique(data.pauseStatuses),
      escalationThresholds: unique(data.escalationThresholds).sort((a, b) => a - b),
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    };
    this.validate();
  }

  static create(input: {
    id: string;
    tenantId: string;
    name: string;
    description?: string;
    enabled?: boolean;
    ticketTypes?: readonly ServiceDeskTicketType[];
    priorities?: readonly ServiceDeskPriority[];
    categoryKeys?: readonly string[];
    firstResponseMinutes: number;
    resolutionMinutes: number;
    pauseStatuses?: readonly ServiceDeskTicketStatus[];
    escalationThresholds?: readonly number[];
  }): ServiceDeskSlaPolicy {
    const now = new Date();
    return new ServiceDeskSlaPolicy({
      id: input.id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? "",
      enabled: input.enabled ?? true,
      ticketTypes: input.ticketTypes ?? [],
      priorities: input.priorities ?? [],
      categoryKeys: input.categoryKeys ?? [],
      firstResponseMinutes: input.firstResponseMinutes,
      resolutionMinutes: input.resolutionMinutes,
      pauseStatuses: input.pauseStatuses ?? ["PENDING_REQUESTER", "PENDING_THIRD_PARTY"],
      escalationThresholds: input.escalationThresholds ?? [80, 100, 125],
      createdAt: now,
      updatedAt: now,
    });
  }

  get id() { return this.data.id; }
  get tenantId() { return this.data.tenantId; }
  get name() { return this.data.name; }
  get enabled() { return this.data.enabled; }
  get updatedAt() { return new Date(this.data.updatedAt); }
  get firstResponseMinutes() { return this.data.firstResponseMinutes; }
  get resolutionMinutes() { return this.data.resolutionMinutes; }
  get pauseStatuses() { return [...this.data.pauseStatuses]; }
  get escalationThresholds() { return [...this.data.escalationThresholds]; }

  matches(input: { type: ServiceDeskTicketType; priority: ServiceDeskPriority; categoryKey: string | null }): boolean {
    if (!this.data.enabled) return false;
    if (this.data.ticketTypes.length > 0 && !this.data.ticketTypes.includes(input.type)) return false;
    if (this.data.priorities.length > 0 && !this.data.priorities.includes(input.priority)) return false;
    if (this.data.categoryKeys.length > 0 && (!input.categoryKey || !this.data.categoryKeys.includes(input.categoryKey))) return false;
    return true;
  }

  update(input: Partial<Omit<ServiceDeskSlaPolicyData, "id" | "tenantId" | "createdAt" | "updatedAt">>): void {
    this.data = {
      ...this.data,
      ...input,
      name: input.name === undefined ? this.data.name : input.name.trim(),
      description: input.description === undefined ? this.data.description : input.description.trim(),
      ticketTypes: input.ticketTypes === undefined ? this.data.ticketTypes : unique(input.ticketTypes),
      priorities: input.priorities === undefined ? this.data.priorities : unique(input.priorities),
      categoryKeys: input.categoryKeys === undefined ? this.data.categoryKeys : unique(input.categoryKeys.map((value) => value.trim()).filter(Boolean)),
      pauseStatuses: input.pauseStatuses === undefined ? this.data.pauseStatuses : unique(input.pauseStatuses),
      escalationThresholds: input.escalationThresholds === undefined ? this.data.escalationThresholds : unique(input.escalationThresholds).sort((a, b) => a - b),
      updatedAt: new Date(),
    };
    this.validate();
  }

  clone() { return new ServiceDeskSlaPolicy(this.toPersistence()); }
  toPersistence(): ServiceDeskSlaPolicyData { return structuredClone(this.data); }
  toJSON() {
    const data = this.toPersistence();
    return { ...data, createdAt: data.createdAt.toISOString(), updatedAt: data.updatedAt.toISOString() };
  }

  private validate() {
    if (!this.data.id.trim()) throw new Error("SLA policy ID is required");
    if (!this.data.tenantId.trim()) throw new Error("Tenant ID is required");
    if (!this.data.name) throw new Error("SLA policy name is required");
    if (!Number.isInteger(this.data.firstResponseMinutes) || this.data.firstResponseMinutes <= 0) throw new Error("firstResponseMinutes must be a positive integer");
    if (!Number.isInteger(this.data.resolutionMinutes) || this.data.resolutionMinutes <= 0) throw new Error("resolutionMinutes must be a positive integer");
    if (this.data.resolutionMinutes < this.data.firstResponseMinutes) throw new Error("resolutionMinutes cannot be shorter than firstResponseMinutes");
    if (this.data.escalationThresholds.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("SLA escalation thresholds must be positive percentages");
  }
}
