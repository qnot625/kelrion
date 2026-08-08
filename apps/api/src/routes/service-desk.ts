import type { FastifyInstance } from "fastify";
import type { ControlPlaneService } from "@adminops/control-plane";
import { hasPermission } from "@adminops/identity";
import {
  ServiceDeskAccessError,
  ServiceDeskSlaPolicyNotFoundError,
  ServiceDeskTicketNotFoundError,
  ServiceDeskValidationError,
  type ServiceDeskAttachmentReference,
  type ServiceDeskCommentVisibility,
  type ServiceDeskPriority,
  type ServiceDeskService,
  type ServiceDeskSource,
  type ServiceDeskTicketStatus,
  type ServiceDeskTicketType,
} from "@adminops/service-desk";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";

const SERVICE_DESK_MODULE = "service-desk" as const;

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function strings(value: unknown): string[] | undefined { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : undefined; }

function attachments(value: unknown): ServiceDeskAttachmentReference[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ServiceDeskValidationError("attachments must be an array");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.fileName !== "string" || typeof item.contentType !== "string" || typeof item.storageKey !== "string") {
      throw new ServiceDeskValidationError(`attachments[${index}] must include id, fileName, contentType and storageKey`);
    }
    return { id: item.id, fileName: item.fileName, contentType: item.contentType, storageKey: item.storageKey, sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null };
  });
}

function mapError(error: unknown): { status: number; message: string } | null {
  if (error instanceof ServiceDeskTicketNotFoundError || error instanceof ServiceDeskSlaPolicyNotFoundError) return { status: 404, message: error.message };
  if (error instanceof ServiceDeskAccessError) return { status: 403, message: error.message };
  if (error instanceof ServiceDeskValidationError) return { status: 400, message: error.message };
  return null;
}

async function handled(reply: { code(status: number): { send(body: unknown): unknown } }, operation: () => Promise<unknown>) {
  try { return await operation(); }
  catch (error) {
    const mapped = mapError(error);
    if (!mapped) throw error;
    return reply.code(mapped.status).send({ error: mapped.message });
  }
}

export function registerServiceDeskRoutes(app: FastifyInstance, serviceDesk: ServiceDeskService, controlPlane: ControlPlaneService): void {
  const moduleGuard = requireModule(controlPlane, SERVICE_DESK_MODULE);

  app.get("/service-desk/tickets", { preHandler: [moduleGuard, requirePermission("service_desk:view")] }, async (request, reply) => handled(reply, async () => {
    const query = request.query as { status?: ServiceDeskTicketStatus; scope?: "mine" | "assigned" | "all" };
    const canManage = hasPermission(request.auth!.roles, "service_desk:manage");
    const tickets = await serviceDesk.listTickets({ tenantId: request.tenant!.tenantId, actorUserId: request.auth!.userId, canManage, status: query.status, scope: query.scope });
    return reply.send(tickets.map((ticket) => ticket.toJSON()));
  }));

  app.post("/service-desk/tickets", { preHandler: [moduleGuard, requirePermission("service_desk:create")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.subject !== "string" || typeof body.type !== "string") throw new ServiceDeskValidationError("subject and type are required");
    const canManage = hasPermission(request.auth!.roles, "service_desk:manage");
    const requester = canManage && isRecord(body.requester) ? {
      userId: typeof body.requester.userId === "string" ? body.requester.userId : null,
      employeeId: typeof body.requester.employeeId === "string" ? body.requester.employeeId : null,
      name: typeof body.requester.name === "string" ? body.requester.name : null,
      email: typeof body.requester.email === "string" ? body.requester.email : null,
    } : { userId: request.auth!.userId };
    const ticket = await serviceDesk.createTicket({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth!.userId,
      type: body.type as ServiceDeskTicketType,
      priority: typeof body.priority === "string" ? body.priority as ServiceDeskPriority : undefined,
      subject: body.subject,
      description: typeof body.description === "string" ? body.description : undefined,
      categoryKey: typeof body.categoryKey === "string" ? body.categoryKey : body.categoryKey === null ? null : undefined,
      requester,
      source: canManage && typeof body.source === "string" ? body.source as ServiceDeskSource : "WEB",
      assignmentGroupId: canManage && typeof body.assignmentGroupId === "string" ? body.assignmentGroupId : undefined,
      assigneeUserId: canManage && typeof body.assigneeUserId === "string" ? body.assigneeUserId : undefined,
      watcherUserIds: canManage ? strings(body.watcherUserIds) : undefined,
      tags: strings(body.tags),
      workflowInstanceId: canManage && typeof body.workflowInstanceId === "string" ? body.workflowInstanceId : undefined,
      approvalRequestId: canManage && typeof body.approvalRequestId === "string" ? body.approvalRequestId : undefined,
    });
    return reply.code(201).send(ticket.toJSON());
  }));

  app.get<{ Params: { id: string } }>("/service-desk/tickets/:id", { preHandler: [moduleGuard, requirePermission("service_desk:view")] }, async (request, reply) => handled(reply, async () => {
    const ticket = await serviceDesk.getTicket({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, canManage: hasPermission(request.auth!.roles, "service_desk:manage") });
    const json = ticket.toJSON();
    if (!hasPermission(request.auth!.roles, "service_desk:manage")) {
      return reply.send({ ...json, comments: json.comments.filter((comment) => comment.visibility === "REQUESTER") });
    }
    return reply.send(json);
  }));

  app.patch<{ Params: { id: string } }>("/service-desk/tickets/:id", { preHandler: [moduleGuard, requirePermission("service_desk:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const ticket = await serviceDesk.updateTicket({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, subject: typeof body.subject === "string" ? body.subject : undefined, description: typeof body.description === "string" ? body.description : undefined, categoryKey: typeof body.categoryKey === "string" ? body.categoryKey : body.categoryKey === null ? null : undefined, priority: typeof body.priority === "string" ? body.priority as ServiceDeskPriority : undefined, tags: strings(body.tags), workflowInstanceId: typeof body.workflowInstanceId === "string" ? body.workflowInstanceId : body.workflowInstanceId === null ? null : undefined, approvalRequestId: typeof body.approvalRequestId === "string" ? body.approvalRequestId : body.approvalRequestId === null ? null : undefined });
    return reply.send(ticket.toJSON());
  }));

  app.post<{ Params: { id: string } }>("/service-desk/tickets/:id/assign", { preHandler: [moduleGuard, requirePermission("service_desk:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    return reply.send((await serviceDesk.assignTicket({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, assignmentGroupId: typeof body.assignmentGroupId === "string" ? body.assignmentGroupId : body.assignmentGroupId === null ? null : undefined, assigneeUserId: typeof body.assigneeUserId === "string" ? body.assigneeUserId : body.assigneeUserId === null ? null : undefined })).toJSON());
  }));

  app.put<{ Params: { id: string } }>("/service-desk/tickets/:id/watchers", { preHandler: [moduleGuard, requirePermission("service_desk:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const watcherUserIds = strings(body.watcherUserIds);
    if (!watcherUserIds) throw new ServiceDeskValidationError("watcherUserIds must be an array of user IDs");
    return reply.send((await serviceDesk.setWatchers({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, watcherUserIds })).toJSON());
  }));

  app.post<{ Params: { id: string } }>("/service-desk/tickets/:id/comments", { preHandler: [moduleGuard, requirePermission("service_desk:comment")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const visibility: ServiceDeskCommentVisibility = body.visibility === "INTERNAL" ? "INTERNAL" : "REQUESTER";
    const ticket = await serviceDesk.addComment({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, canManage: hasPermission(request.auth!.roles, "service_desk:manage"), visibility, body: typeof body.body === "string" ? body.body : "", attachments: attachments(body.attachments) });
    const json = ticket.toJSON();
    return reply.send(hasPermission(request.auth!.roles, "service_desk:manage") ? json : { ...json, comments: json.comments.filter((comment) => comment.visibility === "REQUESTER") });
  }));

  app.post<{ Params: { id: string } }>("/service-desk/tickets/:id/transition", { preHandler: [moduleGuard, requirePermission("service_desk:manage")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.status !== "string") throw new ServiceDeskValidationError("status is required");
    return reply.send((await serviceDesk.transitionTicket({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, toStatus: body.status as ServiceDeskTicketStatus, reason: typeof body.reason === "string" ? body.reason : undefined })).toJSON());
  }));

  app.get("/service-desk/sla-policies", { preHandler: [moduleGuard, requirePermission("service_desk:sla")] }, async (request, reply) => reply.send((await serviceDesk.listSlaPolicies(request.tenant!.tenantId)).map((policy) => policy.toJSON())));

  app.post("/service-desk/sla-policies", { preHandler: [moduleGuard, requirePermission("service_desk:sla")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.name !== "string" || typeof body.firstResponseMinutes !== "number" || typeof body.resolutionMinutes !== "number") throw new ServiceDeskValidationError("name, firstResponseMinutes and resolutionMinutes are required");
    const policy = await serviceDesk.createSlaPolicy({ tenantId: request.tenant!.tenantId, actorUserId: request.auth!.userId, name: body.name, description: typeof body.description === "string" ? body.description : undefined, enabled: typeof body.enabled === "boolean" ? body.enabled : undefined, ticketTypes: strings(body.ticketTypes) as ServiceDeskTicketType[] | undefined, priorities: strings(body.priorities) as ServiceDeskPriority[] | undefined, categoryKeys: strings(body.categoryKeys), firstResponseMinutes: body.firstResponseMinutes, resolutionMinutes: body.resolutionMinutes, pauseStatuses: strings(body.pauseStatuses) as ServiceDeskTicketStatus[] | undefined, escalationThresholds: Array.isArray(body.escalationThresholds) ? body.escalationThresholds.filter((value): value is number => typeof value === "number") : undefined });
    return reply.code(201).send(policy.toJSON());
  }));

  app.patch<{ Params: { id: string } }>("/service-desk/sla-policies/:id", { preHandler: [moduleGuard, requirePermission("service_desk:sla")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const patch = {
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      ticketTypes: strings(body.ticketTypes) as ServiceDeskTicketType[] | undefined,
      priorities: strings(body.priorities) as ServiceDeskPriority[] | undefined,
      categoryKeys: strings(body.categoryKeys),
      firstResponseMinutes: typeof body.firstResponseMinutes === "number" ? body.firstResponseMinutes : undefined,
      resolutionMinutes: typeof body.resolutionMinutes === "number" ? body.resolutionMinutes : undefined,
      pauseStatuses: strings(body.pauseStatuses) as ServiceDeskTicketStatus[] | undefined,
      escalationThresholds: Array.isArray(body.escalationThresholds) ? body.escalationThresholds.filter((value): value is number => typeof value === "number") : undefined,
    };
    return reply.send((await serviceDesk.updateSlaPolicy({ tenantId: request.tenant!.tenantId, id: request.params.id, actorUserId: request.auth!.userId, patch })).toJSON());
  }));

  app.delete<{ Params: { id: string } }>("/service-desk/sla-policies/:id", { preHandler: [moduleGuard, requirePermission("service_desk:sla")] }, async (request, reply) => handled(reply, async () => {
    await serviceDesk.deleteSlaPolicy(request.tenant!.tenantId, request.params.id, request.auth!.userId);
    return reply.code(204).send(undefined);
  }));
}
