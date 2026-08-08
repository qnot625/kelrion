import { randomUUID } from "node:crypto";
import type { AuditLog } from "@adminops/audit";
import { ServiceDeskAccessError, ServiceDeskSlaPolicyNotFoundError, ServiceDeskTicketNotFoundError, ServiceDeskValidationError } from "./errors.js";
import type { ServiceDeskSlaPolicyRepository, ServiceDeskTicketRepository } from "./repositories.js";
import { ServiceDeskSlaPolicy } from "./sla-policy.js";
import { ServiceDeskTicket } from "./ticket.js";
import type {
  ServiceDeskAttachmentReference,
  ServiceDeskCommentVisibility,
  ServiceDeskPriority,
  ServiceDeskRequester,
  ServiceDeskSource,
  ServiceDeskTicketStatus,
  ServiceDeskTicketType,
} from "./types.js";

export class ServiceDeskService {
  constructor(
    private readonly tickets: ServiceDeskTicketRepository,
    private readonly slaPolicies: ServiceDeskSlaPolicyRepository,
    private readonly auditLog?: AuditLog,
  ) {}

  async createTicket(input: {
    tenantId: string;
    actorUserId: string;
    type: ServiceDeskTicketType;
    priority?: ServiceDeskPriority;
    subject: string;
    description?: string;
    categoryKey?: string | null;
    requester?: ServiceDeskRequester;
    source?: ServiceDeskSource;
    assignmentGroupId?: string | null;
    assigneeUserId?: string | null;
    watcherUserIds?: readonly string[];
    tags?: readonly string[];
    workflowInstanceId?: string | null;
    approvalRequestId?: string | null;
    id?: string;
  }): Promise<ServiceDeskTicket> {
    if (!input.subject.trim()) throw new ServiceDeskValidationError("Ticket subject is required");
    const id = input.id?.trim() || randomUUID();
    if (await this.tickets.findById(input.tenantId, id)) throw new ServiceDeskValidationError(`Ticket '${id}' already exists`);
    const priority = input.priority ?? "MEDIUM";
    const sla = await this.selectSla(input.tenantId, input.type, priority, input.categoryKey?.trim() || null);
    let ticket: ServiceDeskTicket;
    try {
      ticket = ServiceDeskTicket.create({
        id,
        tenantId: input.tenantId,
        reference: `SD-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`,
        type: input.type,
        priority,
        subject: input.subject,
        description: input.description,
        categoryKey: input.categoryKey,
        requester: input.requester ?? { userId: input.actorUserId },
        source: input.source,
        assignmentGroupId: input.assignmentGroupId,
        assigneeUserId: input.assigneeUserId,
        watcherUserIds: input.watcherUserIds,
        tags: input.tags,
        workflowInstanceId: input.workflowInstanceId,
        approvalRequestId: input.approvalRequestId,
        createdByUserId: input.actorUserId,
        slaPolicy: sla?.toPersistence() ?? null,
        statusEventId: randomUUID(),
      });
    } catch (error) { throw this.validation(error); }
    await this.tickets.save(ticket);
    await this.audit("service_desk.ticket_created", input.tenantId, input.actorUserId, "service_desk_ticket", ticket.id, { reference: ticket.reference, type: ticket.type, priority: ticket.priority, slaPolicyId: ticket.slaPolicyId });
    return ticket;
  }

  async getTicket(input: { tenantId: string; id: string; actorUserId: string; canManage: boolean }): Promise<ServiceDeskTicket> {
    const ticket = await this.requireTicket(input.tenantId, input.id);
    if (!input.canManage && !ticket.isRequester(input.actorUserId) && !ticket.isWatcher(input.actorUserId) && !ticket.isAssigned(input.actorUserId)) throw new ServiceDeskAccessError();
    await this.refreshTicketSla(ticket);
    return ticket;
  }

  async listTickets(input: { tenantId: string; actorUserId: string; canManage: boolean; status?: ServiceDeskTicketStatus; scope?: "mine" | "assigned" | "all" }): Promise<ServiceDeskTicket[]> {
    if (input.scope === "all" && !input.canManage) throw new ServiceDeskAccessError("Only service desk managers can list all tickets");
    let tickets: ServiceDeskTicket[];
    if (input.canManage && input.scope !== "mine" && input.scope !== "assigned") tickets = await this.tickets.listByTenant(input.tenantId, input.status);
    else if (input.scope === "assigned") tickets = await this.tickets.listByAssignee(input.tenantId, input.actorUserId);
    else tickets = await this.tickets.listByRequester(input.tenantId, input.actorUserId);
    const filtered = input.status ? tickets.filter((ticket) => ticket.status === input.status) : tickets;
    for (const ticket of filtered) await this.refreshTicketSla(ticket);
    return filtered;
  }

  async updateTicket(input: {
    tenantId: string;
    id: string;
    actorUserId: string;
    subject?: string;
    description?: string;
    categoryKey?: string | null;
    priority?: ServiceDeskPriority;
    tags?: readonly string[];
    workflowInstanceId?: string | null;
    approvalRequestId?: string | null;
  }): Promise<ServiceDeskTicket> {
    const ticket = await this.requireTicket(input.tenantId, input.id);
    const oldPriority = ticket.priority;
    try { ticket.updateDetails(input); } catch (error) { throw this.validation(error); }
    if (input.priority && input.priority !== oldPriority && !ticket.firstRespondedAt) {
      const policy = await this.selectSla(input.tenantId, ticket.type, ticket.priority, input.categoryKey === undefined ? ticket.toPersistence().categoryKey : input.categoryKey?.trim() || null);
      if (policy) ticket.applySlaPolicy(policy.toPersistence());
    }
    await this.tickets.save(ticket);
    await this.audit("service_desk.ticket_updated", input.tenantId, input.actorUserId, "service_desk_ticket", ticket.id, { reference: ticket.reference, priority: ticket.priority });
    return ticket;
  }

  async assignTicket(input: { tenantId: string; id: string; actorUserId: string; assignmentGroupId?: string | null; assigneeUserId?: string | null }): Promise<ServiceDeskTicket> {
    const ticket = await this.requireTicket(input.tenantId, input.id);
    try { ticket.assign(input); } catch (error) { throw this.validation(error); }
    await this.tickets.save(ticket);
    await this.audit("service_desk.ticket_assigned", input.tenantId, input.actorUserId, "service_desk_ticket", ticket.id, { assignmentGroupId: ticket.assignmentGroupId, assigneeUserId: ticket.assigneeUserId });
    return ticket;
  }

  async setWatchers(input: { tenantId: string; id: string; actorUserId: string; watcherUserIds: readonly string[] }): Promise<ServiceDeskTicket> {
    const ticket = await this.requireTicket(input.tenantId, input.id);
    ticket.setWatchers(input.watcherUserIds);
    await this.tickets.save(ticket);
    await this.audit("service_desk.watchers_updated", input.tenantId, input.actorUserId, "service_desk_ticket", ticket.id, { watcherCount: ticket.watcherUserIds.length });
    return ticket;
  }

  async addComment(input: {
    tenantId: string;
    id: string;
    actorUserId: string;
    canManage: boolean;
    visibility: ServiceDeskCommentVisibility;
    body: string;
    attachments?: readonly ServiceDeskAttachmentReference[];
  }): Promise<ServiceDeskTicket> {
    const ticket = await this.requireTicket(input.tenantId, input.id);
    if (!input.canManage && !ticket.isRequester(input.actorUserId) && !ticket.isWatcher(input.actorUserId) && !ticket.isAssigned(input.actorUserId)) throw new ServiceDeskAccessError();
    if (!input.canManage && input.visibility === "INTERNAL") throw new ServiceDeskAccessError("Requester users cannot add internal notes");
    const countsAsFirstResponse = input.canManage && input.visibility === "REQUESTER" && !ticket.isRequester(input.actorUserId);
    try { ticket.addComment({ id: randomUUID(), authorUserId: input.actorUserId, visibility: input.visibility, body: input.body, attachments: input.attachments, countsAsFirstResponse }); }
    catch (error) { throw this.validation(error); }
    await this.tickets.save(ticket);
    await this.audit(input.visibility === "INTERNAL" ? "service_desk.internal_note_added" : "service_desk.comment_added", input.tenantId, input.actorUserId, "service_desk_ticket", ticket.id, { reference: ticket.reference, attachmentCount: input.attachments?.length ?? 0, countsAsFirstResponse });
    return ticket;
  }

  async transitionTicket(input: { tenantId: string; id: string; actorUserId: string; toStatus: ServiceDeskTicketStatus; reason?: string }): Promise<ServiceDeskTicket> {
    const ticket = await this.requireTicket(input.tenantId, input.id);
    const policy = ticket.slaPolicyId ? await this.slaPolicies.findById(input.tenantId, ticket.slaPolicyId) : null;
    try { ticket.transition({ toStatus: input.toStatus, actorUserId: input.actorUserId, reason: input.reason, eventId: randomUUID(), slaPolicy: policy?.toPersistence() ?? null }); }
    catch (error) { throw this.validation(error); }
    await this.tickets.save(ticket);
    await this.audit("service_desk.status_changed", input.tenantId, input.actorUserId, "service_desk_ticket", ticket.id, { reference: ticket.reference, status: ticket.status, reason: input.reason ?? null });
    return ticket;
  }

  async createSlaPolicy(input: {
    tenantId: string;
    actorUserId: string;
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
    id?: string;
  }): Promise<ServiceDeskSlaPolicy> {
    const id = input.id?.trim() || randomUUID();
    if (await this.slaPolicies.findById(input.tenantId, id)) throw new ServiceDeskValidationError(`SLA policy '${id}' already exists`);
    let policy: ServiceDeskSlaPolicy;
    try { policy = ServiceDeskSlaPolicy.create({ ...input, id }); } catch (error) { throw this.validation(error); }
    await this.slaPolicies.save(policy);
    await this.audit("service_desk.sla_created", input.tenantId, input.actorUserId, "service_desk_sla_policy", policy.id, { name: policy.name });
    return policy;
  }

  async updateSlaPolicy(input: { tenantId: string; id: string; actorUserId: string; patch: Parameters<ServiceDeskSlaPolicy["update"]>[0] }): Promise<ServiceDeskSlaPolicy> {
    const policy = await this.requireSla(input.tenantId, input.id);
    try { policy.update(input.patch); } catch (error) { throw this.validation(error); }
    await this.slaPolicies.save(policy);
    await this.audit("service_desk.sla_updated", input.tenantId, input.actorUserId, "service_desk_sla_policy", policy.id, { name: policy.name, enabled: policy.enabled });
    return policy;
  }

  async deleteSlaPolicy(tenantId: string, id: string, actorUserId: string): Promise<void> {
    await this.requireSla(tenantId, id);
    const inUse = (await this.tickets.listByTenant(tenantId)).some((ticket) => ticket.slaPolicyId === id && !ticket.isTerminal());
    if (inUse) throw new ServiceDeskValidationError("SLA policy cannot be deleted while active tickets use it; disable it instead");
    await this.slaPolicies.delete(tenantId, id);
    await this.audit("service_desk.sla_deleted", tenantId, actorUserId, "service_desk_sla_policy", id, {});
  }

  listSlaPolicies(tenantId: string) { return this.slaPolicies.listByTenant(tenantId); }

  private async selectSla(tenantId: string, type: ServiceDeskTicketType, priority: ServiceDeskPriority, categoryKey: string | null) {
    const matches = (await this.slaPolicies.listByTenant(tenantId)).filter((policy) => policy.matches({ type, priority, categoryKey }));
    return matches.sort((a, b) => this.specificity(b) - this.specificity(a) || b.updatedAt.getTime() - a.updatedAt.getTime())[0] ?? null;
  }

  private specificity(policy: ServiceDeskSlaPolicy) {
    const data = policy.toPersistence();
    return (data.categoryKeys.length ? 4 : 0) + (data.priorities.length ? 2 : 0) + (data.ticketTypes.length ? 1 : 0);
  }

  private async refreshTicketSla(ticket: ServiceDeskTicket) {
    const policy = ticket.slaPolicyId ? await this.slaPolicies.findById(ticket.tenantId, ticket.slaPolicyId) : null;
    const before = ticket.escalationLevel;
    ticket.refreshSla(policy?.toPersistence() ?? null);
    if (ticket.escalationLevel !== before) {
      await this.tickets.save(ticket);
      await this.audit("service_desk.sla_escalated", ticket.tenantId, "system", "service_desk_ticket", ticket.id, { reference: ticket.reference, escalationLevel: ticket.escalationLevel });
    }
  }

  private async requireTicket(tenantId: string, id: string) {
    const ticket = await this.tickets.findById(tenantId, id);
    if (!ticket) throw new ServiceDeskTicketNotFoundError(id);
    return ticket;
  }

  private async requireSla(tenantId: string, id: string) {
    const policy = await this.slaPolicies.findById(tenantId, id);
    if (!policy) throw new ServiceDeskSlaPolicyNotFoundError(id);
    return policy;
  }

  private validation(error: unknown) { return new ServiceDeskValidationError(error instanceof Error ? error.message : "Invalid service desk operation"); }
  private async audit(action: string, tenantId: string, actorUserId: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
    if (!this.auditLog) return;
    await this.auditLog.record({ tenantId, actorUserId, action, targetType, targetId, metadata });
  }
}
