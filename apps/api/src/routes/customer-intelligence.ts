import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { requirePermission } from "../plugins/require-permission.js";
import {
  CustomerCaseNotFoundError,
  CustomerCaseValidationError,
  InvalidCaseTransitionError,
  type CaseCommentVisibility,
  type CasePriority,
  type CaseStatus,
  type CustomerCaseService,
  type ExecutiveSummaryService,
} from "../domains/customer-intelligence/index.js";

const PRIORITIES = new Set<CasePriority>(["low", "normal", "high", "urgent"]);
const STATUSES = new Set<CaseStatus>(["open", "in_progress", "waiting_customer", "resolved", "closed"]);
const VISIBILITIES = new Set<CaseCommentVisibility>(["public", "internal"]);

function handleError(reply: { code(status: number): { send(body: unknown): unknown } }, error: unknown) {
  if (error instanceof CustomerCaseNotFoundError) return reply.code(404).send({ error: error.message });
  if (error instanceof CustomerCaseValidationError || error instanceof InvalidCaseTransitionError) {
    return reply.code(400).send({ error: error.message });
  }
  throw error;
}

export function registerCustomerIntelligenceRoutes(
  app: FastifyInstance,
  cases: CustomerCaseService,
  executive: ExecutiveSummaryService,
  auditLog: AuditLog,
): void {
  app.post("/cases", { preHandler: requirePermission("cases:create") }, async (request, reply) => {
    const body = request.body as {
      customerEmail?: unknown;
      subject?: unknown;
      description?: unknown;
      category?: unknown;
      priority?: unknown;
    };
    if (
      typeof body?.customerEmail !== "string" || typeof body.subject !== "string" ||
      typeof body.description !== "string" || typeof body.category !== "string" ||
      typeof body.priority !== "string" || !PRIORITIES.has(body.priority as CasePriority)
    ) return reply.code(400).send({ error: "customerEmail, subject, description, category and priority are required" });

    try {
      const customerCase = await cases.create({
        tenantId: request.tenant!.tenantId,
        customerEmail: body.customerEmail,
        subject: body.subject,
        description: body.description,
        category: body.category,
        priority: body.priority as CasePriority,
        createdByUserId: request.auth!.userId,
      });
      await auditLog.record({
        tenantId: customerCase.tenantId,
        actorUserId: request.auth!.userId,
        action: "case.created",
        targetType: "customer_case",
        targetId: customerCase.id,
        metadata: { reference: customerCase.reference, priority: customerCase.priority, category: customerCase.category },
      });
      return reply.code(201).send(customerCase);
    } catch (error) { return handleError(reply, error); }
  });

  app.get("/cases", { preHandler: requirePermission("cases:manage") }, async (request, reply) => {
    const query = request.query as { status?: string; priority?: string; customerEmail?: string };
    if (query.status && !STATUSES.has(query.status as CaseStatus)) return reply.code(400).send({ error: "Invalid case status" });
    if (query.priority && !PRIORITIES.has(query.priority as CasePriority)) return reply.code(400).send({ error: "Invalid case priority" });
    return reply.send(await cases.list(request.tenant!.tenantId, {
      status: query.status as CaseStatus | undefined,
      priority: query.priority as CasePriority | undefined,
      customerEmail: query.customerEmail,
    }));
  });

  app.get<{ Params: { id: string } }>("/cases/:id", { preHandler: requirePermission("cases:manage") }, async (request, reply) => {
    try { return reply.send(await cases.get(request.tenant!.tenantId, request.params.id)); }
    catch (error) { return handleError(reply, error); }
  });

  app.get<{ Params: { id: string } }>("/cases/:id/comments", { preHandler: requirePermission("cases:manage") }, async (request, reply) => {
    try { return reply.send(await cases.comments(request.tenant!.tenantId, request.params.id)); }
    catch (error) { return handleError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/cases/:id/assign", { preHandler: requirePermission("cases:manage") }, async (request, reply) => {
    const body = request.body as { ownerUserId?: unknown };
    if (body?.ownerUserId !== null && typeof body?.ownerUserId !== "string") {
      return reply.code(400).send({ error: "ownerUserId must be a string or null" });
    }
    try {
      const customerCase = await cases.assign(
        request.tenant!.tenantId,
        request.params.id,
        body.ownerUserId as string | null,
      );
      await auditLog.record({
        tenantId: customerCase.tenantId,
        actorUserId: request.auth!.userId,
        action: "case.assigned",
        targetType: "customer_case",
        targetId: customerCase.id,
        metadata: { ownerUserId: customerCase.ownerUserId },
      });
      return reply.send(customerCase);
    } catch (error) { return handleError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/cases/:id/status", { preHandler: requirePermission("cases:manage") }, async (request, reply) => {
    const body = request.body as { status?: unknown; resolution?: unknown };
    if (typeof body?.status !== "string" || !STATUSES.has(body.status as CaseStatus)) {
      return reply.code(400).send({ error: "A valid status is required" });
    }
    try {
      const customerCase = await cases.updateStatus(
        request.tenant!.tenantId,
        request.params.id,
        body.status as CaseStatus,
        typeof body.resolution === "string" ? body.resolution : null,
      );
      await auditLog.record({
        tenantId: customerCase.tenantId,
        actorUserId: request.auth!.userId,
        action: "case.status_changed",
        targetType: "customer_case",
        targetId: customerCase.id,
        metadata: { status: customerCase.status, slaState: customerCase.slaState },
      });
      return reply.send(customerCase);
    } catch (error) { return handleError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/cases/:id/comments", { preHandler: requirePermission("cases:manage") }, async (request, reply) => {
    const body = request.body as { body?: unknown; visibility?: unknown };
    if (
      typeof body?.body !== "string" || typeof body.visibility !== "string" ||
      !VISIBILITIES.has(body.visibility as CaseCommentVisibility)
    ) return reply.code(400).send({ error: "body and a valid visibility are required" });
    try {
      const comment = await cases.addComment({
        tenantId: request.tenant!.tenantId,
        caseId: request.params.id,
        authorUserId: request.auth!.userId,
        body: body.body,
        visibility: body.visibility as CaseCommentVisibility,
      });
      await auditLog.record({
        tenantId: comment.tenantId,
        actorUserId: request.auth!.userId,
        action: "case.comment_added",
        targetType: "customer_case",
        targetId: comment.caseId,
        metadata: { visibility: comment.visibility },
      });
      return reply.code(201).send(comment);
    } catch (error) { return handleError(reply, error); }
  });

  app.get("/executive/summary", { preHandler: requirePermission("analytics:view") }, async (request, reply) =>
    reply.send(await executive.summary(request.tenant!.tenantId)));
}
