import type { FastifyInstance } from "fastify";
import type { ApprovalEngineService } from "@adminops/approvals";
import type { ControlPlaneService } from "@adminops/control-plane";
import type { FormDefinitionService, SubmissionService } from "@adminops/forms";
import { hasPermission } from "@adminops/identity";
import {
  ServiceDeskAccessError,
  ServiceDeskCatalogItemNotFoundError,
  ServiceDeskValidationError,
  type ServiceDeskCatalogItem,
  type ServiceDeskCatalogService,
  type ServiceDeskPriority,
  type ServiceDeskService,
  type ServiceDeskTicketType,
} from "@adminops/service-desk";
import type { WorkflowEngineService } from "@adminops/workflow";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : undefined;
}

function mapError(error: unknown): { status: number; message: string } | null {
  if (error instanceof ServiceDeskCatalogItemNotFoundError) return { status: 404, message: error.message };
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

async function validateBindings(
  tenantId: string,
  item: ServiceDeskCatalogItem,
  forms: FormDefinitionService,
  workflow: WorkflowEngineService,
  approvals: ApprovalEngineService,
) {
  try {
    if (item.formDefinitionId) await forms.getPublished(tenantId, item.formDefinitionId);
    if (item.workflowDefinitionId) await workflow.getPublishedDefinition(tenantId, item.workflowDefinitionId);
    if (item.approvalPolicyId) await approvals.getPublishedPolicy(tenantId, item.approvalPolicyId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Referenced automation resource is unavailable";
    throw new ServiceDeskValidationError(`Catalogue bindings must reference published resources: ${message}`);
  }
}

export function registerServiceDeskCatalogRoutes(
  app: FastifyInstance,
  catalog: ServiceDeskCatalogService,
  serviceDesk: ServiceDeskService,
  forms: FormDefinitionService,
  submissions: SubmissionService,
  workflow: WorkflowEngineService,
  approvals: ApprovalEngineService,
  controlPlane: ControlPlaneService,
): void {
  const moduleGuard = requireModule(controlPlane, "service-desk");

  app.get("/service-desk/catalog", { preHandler: [moduleGuard, requirePermission("service_desk:view")] }, async (request, reply) => {
    const canManage = hasPermission(request.auth!.roles, "service_desk:catalog");
    const items = canManage ? await catalog.list(request.tenant!.tenantId) : await catalog.listPublished(request.tenant!.tenantId);
    return reply.send(items.map((item) => item.toJSON()));
  });

  app.get<{ Params: { id: string } }>("/service-desk/catalog/:id", { preHandler: [moduleGuard, requirePermission("service_desk:view")] }, async (request, reply) => handled(reply, async () => {
    const canManage = hasPermission(request.auth!.roles, "service_desk:catalog");
    const query = request.query as { version?: string };
    const version = query.version ? Number(query.version) : undefined;
    if (query.version && (!Number.isInteger(version) || (version ?? 0) < 1)) throw new ServiceDeskValidationError("version must be a positive integer");
    const item = canManage && version === undefined
      ? await catalog.get(request.tenant!.tenantId, request.params.id)
      : await catalog.getPublished(request.tenant!.tenantId, request.params.id, version);
    return reply.send(item.toJSON());
  }));

  app.get<{ Params: { id: string } }>("/service-desk/catalog/:id/versions", { preHandler: [moduleGuard, requirePermission("service_desk:catalog")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await catalog.listVersions(request.tenant!.tenantId, request.params.id)).map((item) => item.toJSON()))));

  app.post("/service-desk/catalog", { preHandler: [moduleGuard, requirePermission("service_desk:catalog")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    if (typeof body.key !== "string" || typeof body.name !== "string") throw new ServiceDeskValidationError("key and name are required");
    const item = await catalog.create({
      tenantId: request.tenant!.tenantId,
      actorUserId: request.auth!.userId,
      id: typeof body.id === "string" ? body.id : undefined,
      key: body.key,
      name: body.name,
      description: typeof body.description === "string" ? body.description : undefined,
      intakeMode: body.intakeMode === "FORM" ? "FORM" : body.intakeMode === "FREEFORM" ? "FREEFORM" : undefined,
      formDefinitionId: typeof body.formDefinitionId === "string" ? body.formDefinitionId : body.formDefinitionId === null ? null : undefined,
      workflowDefinitionId: typeof body.workflowDefinitionId === "string" ? body.workflowDefinitionId : body.workflowDefinitionId === null ? null : undefined,
      approvalPolicyId: typeof body.approvalPolicyId === "string" ? body.approvalPolicyId : body.approvalPolicyId === null ? null : undefined,
      defaultTicketType: typeof body.defaultTicketType === "string" ? body.defaultTicketType as ServiceDeskTicketType : undefined,
      defaultPriority: typeof body.defaultPriority === "string" ? body.defaultPriority as ServiceDeskPriority : undefined,
      categoryKey: typeof body.categoryKey === "string" ? body.categoryKey : body.categoryKey === null ? null : undefined,
      assignmentGroupId: typeof body.assignmentGroupId === "string" ? body.assignmentGroupId : body.assignmentGroupId === null ? null : undefined,
      tags: strings(body.tags),
    });
    return reply.code(201).send(item.toJSON());
  }));

  app.patch<{ Params: { id: string } }>("/service-desk/catalog/:id", { preHandler: [moduleGuard, requirePermission("service_desk:catalog")] }, async (request, reply) => handled(reply, async () => {
    const body = isRecord(request.body) ? request.body : {};
    const item = await catalog.update({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
      key: typeof body.key === "string" ? body.key : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      intakeMode: body.intakeMode === "FORM" ? "FORM" : body.intakeMode === "FREEFORM" ? "FREEFORM" : undefined,
      formDefinitionId: typeof body.formDefinitionId === "string" ? body.formDefinitionId : body.formDefinitionId === null ? null : undefined,
      workflowDefinitionId: typeof body.workflowDefinitionId === "string" ? body.workflowDefinitionId : body.workflowDefinitionId === null ? null : undefined,
      approvalPolicyId: typeof body.approvalPolicyId === "string" ? body.approvalPolicyId : body.approvalPolicyId === null ? null : undefined,
      defaultTicketType: typeof body.defaultTicketType === "string" ? body.defaultTicketType as ServiceDeskTicketType : undefined,
      defaultPriority: typeof body.defaultPriority === "string" ? body.defaultPriority as ServiceDeskPriority : undefined,
      categoryKey: typeof body.categoryKey === "string" ? body.categoryKey : body.categoryKey === null ? null : undefined,
      assignmentGroupId: typeof body.assignmentGroupId === "string" ? body.assignmentGroupId : body.assignmentGroupId === null ? null : undefined,
      tags: strings(body.tags),
    });
    return reply.send(item.toJSON());
  }));

  app.post<{ Params: { id: string } }>("/service-desk/catalog/:id/publish", { preHandler: [moduleGuard, requirePermission("service_desk:catalog")] }, async (request, reply) => handled(reply, async () => {
    const current = await catalog.get(request.tenant!.tenantId, request.params.id);
    await validateBindings(request.tenant!.tenantId, current, forms, workflow, approvals);
    return reply.send((await catalog.publish(request.tenant!.tenantId, request.params.id, request.auth!.userId)).toJSON());
  }));

  app.post<{ Params: { id: string } }>("/service-desk/catalog/:id/archive", { preHandler: [moduleGuard, requirePermission("service_desk:catalog")] }, async (request, reply) => handled(reply, async () =>
    reply.send((await catalog.archive(request.tenant!.tenantId, request.params.id, request.auth!.userId)).toJSON())));

  app.post<{ Params: { id: string } }>("/service-desk/catalog/:id/request", { preHandler: [moduleGuard, requirePermission("service_desk:create")] }, async (request, reply) => handled(reply, async () => {
    const tenantId = request.tenant!.tenantId;
    const actorUserId = request.auth!.userId;
    const item = await catalog.getPublished(tenantId, request.params.id);
    const body = isRecord(request.body) ? request.body : {};
    const requestContext = isRecord(body.context) ? body.context : {};
    let formSubmissionId: string | null = null;

    if (item.intakeMode === "FORM") {
      if (typeof body.formSubmissionId !== "string" || !body.formSubmissionId.trim()) {
        throw new ServiceDeskValidationError("formSubmissionId is required for this catalogue item");
      }
      try {
        const submission = await submissions.get({ tenantId, id: body.formSubmissionId, actorUserId, canManage: hasPermission(request.auth!.roles, "forms:manage") });
        if (submission.formDefinitionId !== item.formDefinitionId) throw new ServiceDeskValidationError("The form submission does not belong to this catalogue item");
        if (submission.status !== "SUBMITTED" && submission.status !== "VALIDATED") throw new ServiceDeskValidationError("The form submission must be submitted before creating a service request");
        formSubmissionId = submission.id;
      } catch (error) {
        if (error instanceof ServiceDeskValidationError) throw error;
        throw new ServiceDeskValidationError(error instanceof Error ? error.message : "Form submission is unavailable");
      }
    }

    const ticket = await serviceDesk.createTicket({
      tenantId,
      actorUserId,
      type: item.defaultTicketType,
      priority: item.defaultPriority,
      subject: typeof body.subject === "string" && body.subject.trim() ? body.subject : item.name,
      description: typeof body.description === "string" ? body.description : item.description,
      categoryKey: item.categoryKey,
      requester: { userId: actorUserId },
      source: item.intakeMode === "FORM" ? "FORM" : "WEB",
      assignmentGroupId: item.assignmentGroupId,
      tags: [...item.tags, `catalog:${item.key}`, `catalog-version:${item.version}`],
    });

    const variables: Record<string, unknown> = {
      ...requestContext,
      serviceDeskTicketId: ticket.id,
      serviceDeskReference: ticket.reference,
      serviceDeskCatalogItemId: item.id,
      serviceDeskCatalogVersion: item.version,
      formSubmissionId,
    };

    let workflowInstance: unknown = null;
    let approvalRequest: unknown = null;

    if (item.workflowDefinitionId) {
      const instance = await workflow.startWorkflow({
        tenantId,
        definitionId: item.workflowDefinitionId,
        actorUserId,
        variables,
        sourceType: "API",
        sourceReferenceId: ticket.id,
      });
      workflowInstance = instance.toJSON();
      await serviceDesk.updateTicket({ tenantId, id: ticket.id, actorUserId, workflowInstanceId: instance.id });
    } else if (item.approvalPolicyId) {
      const approval = await approvals.createRequest({
        tenantId,
        policyId: item.approvalPolicyId,
        title: ticket.subject,
        description: ticket.toPersistence().description,
        requestedByUserId: actorUserId,
        sourceType: "API",
        sourceReferenceId: ticket.id,
        context: variables,
      });
      approvalRequest = approval.toJSON();
      await serviceDesk.updateTicket({ tenantId, id: ticket.id, actorUserId, approvalRequestId: approval.id });
    }

    const updated = await serviceDesk.getTicket({ tenantId, id: ticket.id, actorUserId, canManage: true });
    return reply.code(201).send({ ticket: updated.toJSON(), workflowInstance, approvalRequest });
  }));
}
