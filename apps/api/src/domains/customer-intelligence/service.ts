import { randomUUID } from "node:crypto";
import type { CustomerCaseFilters, CustomerIntelligenceRepository } from "./repository.js";
import {
  CustomerCaseNotFoundError,
  CustomerCaseValidationError,
  InvalidCaseTransitionError,
  type CaseComment,
  type CaseCommentVisibility,
  type CasePriority,
  type CaseSlaState,
  type CaseStatus,
  type CaseWithSla,
  type CustomerCase,
} from "./types.js";

const SLA_HOURS: Record<CasePriority, number> = { urgent: 4, high: 8, normal: 24, low: 48 };
const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  open: ["in_progress", "waiting_customer", "resolved", "closed"],
  in_progress: ["waiting_customer", "resolved", "closed"],
  waiting_customer: ["in_progress", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: ["in_progress"],
};

function validateEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CustomerCaseValidationError("A valid customer email is required");
  }
  return email;
}

function bounded(value: string, field: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new CustomerCaseValidationError(`${field} must contain between ${min} and ${max} characters`);
  }
  return normalized;
}

function reference(): string {
  return `KLR-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function slaState(customerCase: CustomerCase, now = new Date()): { state: CaseSlaState; remainingMinutes: number } {
  const remainingMinutes = Math.round((customerCase.slaDueAt.getTime() - now.getTime()) / 60_000);
  if (customerCase.status === "resolved" || customerCase.status === "closed") {
    const endedAt = customerCase.resolvedAt ?? customerCase.updatedAt;
    return { state: endedAt.getTime() <= customerCase.slaDueAt.getTime() ? "met" : "missed", remainingMinutes };
  }
  if (remainingMinutes < 0) return { state: "breached", remainingMinutes };
  const warningWindow = Math.max(120, SLA_HOURS[customerCase.priority] * 15);
  return { state: remainingMinutes <= warningWindow ? "due_soon" : "on_track", remainingMinutes };
}

export function decorateCase(customerCase: CustomerCase, now = new Date()): CaseWithSla {
  const sla = slaState(customerCase, now);
  return { ...customerCase, slaState: sla.state, remainingMinutes: sla.remainingMinutes };
}

export class CustomerCaseService {
  constructor(private readonly repository: CustomerIntelligenceRepository) {}

  async create(input: {
    tenantId: string;
    customerEmail: string;
    subject: string;
    description: string;
    category: string;
    priority: CasePriority;
    createdByUserId: string;
  }): Promise<CaseWithSla> {
    const now = new Date();
    const customerCase: CustomerCase = {
      id: randomUUID(),
      tenantId: input.tenantId,
      reference: reference(),
      customerEmail: validateEmail(input.customerEmail),
      subject: bounded(input.subject, "subject", 3, 160),
      description: bounded(input.description, "description", 5, 4000),
      category: bounded(input.category, "category", 2, 80),
      priority: input.priority,
      status: "open",
      ownerUserId: null,
      slaDueAt: new Date(now.getTime() + SLA_HOURS[input.priority] * 3_600_000),
      firstResponseAt: null,
      resolvedAt: null,
      resolution: null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveCase(customerCase);
    return decorateCase(customerCase, now);
  }

  async get(tenantId: string, id: string): Promise<CaseWithSla> {
    return decorateCase(await this.requireCase(tenantId, id));
  }

  async list(tenantId: string, filters?: CustomerCaseFilters): Promise<CaseWithSla[]> {
    return (await this.repository.listCases(tenantId, filters)).map((item) => decorateCase(item));
  }

  async assign(tenantId: string, id: string, ownerUserId: string | null): Promise<CaseWithSla> {
    const customerCase = await this.requireCase(tenantId, id);
    const now = new Date();
    const updated: CustomerCase = {
      ...customerCase,
      ownerUserId,
      firstResponseAt: ownerUserId && !customerCase.firstResponseAt ? now : customerCase.firstResponseAt,
      status: ownerUserId && customerCase.status === "open" ? "in_progress" : customerCase.status,
      updatedAt: now,
    };
    await this.repository.saveCase(updated);
    return decorateCase(updated, now);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: CaseStatus,
    resolution?: string | null,
  ): Promise<CaseWithSla> {
    const customerCase = await this.requireCase(tenantId, id);
    if (!TRANSITIONS[customerCase.status].includes(status)) {
      throw new InvalidCaseTransitionError(customerCase.status, status);
    }
    const now = new Date();
    const normalizedResolution = status === "resolved"
      ? bounded(resolution ?? "", "resolution", 3, 2000)
      : customerCase.resolution;
    const updated: CustomerCase = {
      ...customerCase,
      status,
      resolution: normalizedResolution,
      resolvedAt: status === "resolved" || status === "closed" ? customerCase.resolvedAt ?? now : null,
      updatedAt: now,
    };
    await this.repository.saveCase(updated);
    return decorateCase(updated, now);
  }

  async addComment(input: {
    tenantId: string;
    caseId: string;
    authorUserId: string;
    body: string;
    visibility: CaseCommentVisibility;
  }): Promise<CaseComment> {
    const customerCase = await this.requireCase(input.tenantId, input.caseId);
    const now = new Date();
    const comment: CaseComment = {
      id: randomUUID(),
      tenantId: input.tenantId,
      caseId: input.caseId,
      authorUserId: input.authorUserId,
      body: bounded(input.body, "comment", 1, 2000),
      visibility: input.visibility,
      createdAt: now,
    };
    if (!customerCase.firstResponseAt) {
      await this.repository.saveCase({ ...customerCase, firstResponseAt: now, updatedAt: now });
    }
    await this.repository.saveComment(comment);
    return comment;
  }

  async comments(tenantId: string, caseId: string): Promise<CaseComment[]> {
    await this.requireCase(tenantId, caseId);
    return this.repository.listComments(tenantId, caseId);
  }

  private async requireCase(tenantId: string, id: string): Promise<CustomerCase> {
    const customerCase = await this.repository.findCase(tenantId, id);
    if (!customerCase) throw new CustomerCaseNotFoundError(id);
    return customerCase;
  }
}
