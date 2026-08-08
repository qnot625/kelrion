import type { FastifyInstance } from "fastify";
import type { AuditLog } from "@adminops/audit";
import { hasPermission } from "@adminops/identity";
import type { ControlPlaneService } from "@adminops/control-plane";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";
import {
  InsufficientLeaveBalanceError,
  InvalidLeaveTransitionError,
  LeaveRequestNotFoundError,
  LifecyclePlanNotFoundError,
  LifecycleStepNotFoundError,
  OverlappingLeaveRequestError,
  WorkforceLifecycleValidationError,
  type LeaveType,
  type LifecycleKind,
  type WorkforceLifecycleService,
} from "../domains/workforce-lifecycle/index.js";

const LEAVE_TYPES = new Set<LeaveType>(["annual", "sick", "parental", "unpaid", "other"]);
const LIFECYCLE_KINDS = new Set<LifecycleKind>(["onboarding", "offboarding"]);

function domainError(error: unknown): { status: number; message: string } | undefined {
  if (
    error instanceof WorkforceLifecycleValidationError ||
    error instanceof InvalidLeaveTransitionError ||
    error instanceof OverlappingLeaveRequestError ||
    error instanceof InsufficientLeaveBalanceError ||
    error instanceof LifecycleStepNotFoundError
  ) return { status: 400, message: error.message };
  if (error instanceof LeaveRequestNotFoundError || error instanceof LifecyclePlanNotFoundError) {
    return { status: 404, message: error.message };
  }
  return undefined;
}

function optionalNote(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function optionalSubject(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function respondToDomainError(reply: { code(status: number): { send(body: unknown): unknown } }, error: unknown) {
  const handled = domainError(error);
  if (!handled) throw error;
  return reply.code(handled.status).send({ error: handled.message });
}

export function registerWorkforceLifecycleRoutes(
  app: FastifyInstance,
  service: WorkforceLifecycleService,
  controlPlane: ControlPlaneService,
  auditLog: AuditLog,
): void {
  app.post("/leave-requests", { preHandler: [requireModule(controlPlane, "leave"), requirePermission("leave:request")] }, async (request, reply) => {
    const body = request.body as { type?: unknown; startDate?: unknown; endDate?: unknown; reason?: unknown };
    if (
      typeof body?.type !== "string" || !LEAVE_TYPES.has(body.type as LeaveType) ||
      typeof body.startDate !== "string" || typeof body.endDate !== "string" ||
      typeof body.reason !== "string"
    ) return reply.code(400).send({ error: "type, startDate, endDate and reason are required" });

    try {
      const leave = await service.submitLeave({
        tenantId: request.tenant!.tenantId,
        requesterUserId: request.auth!.userId,
        type: body.type as LeaveType,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        reason: body.reason,
      });
      await auditLog.record({
        tenantId: leave.tenantId,
        actorUserId: request.auth!.userId,
        action: "leave.requested",
        targetType: "leave_request",
        targetId: leave.id,
        metadata: {
          requesterEmployeeId: leave.requesterEmployeeId,
          type: leave.type,
          startDate: leave.startDate.toISOString(),
          endDate: leave.endDate.toISOString(),
          workingDays: leave.workingDays,
        },
      });
      return reply.code(201).send(leave);
    } catch (error) { return respondToDomainError(reply, error); }
  });

  app.get("/leave-requests", { preHandler: [requireModule(controlPlane, "leave"), requirePermission("leave:request")] }, async (request, reply) => {
    const wantsAll = (request.query as { scope?: string }).scope === "all";
    if (wantsAll && !hasPermission(request.auth!.roles, "leave:approve")) {
      return reply.code(403).send({ error: 'Missing permission "leave:approve"' });
    }
    return reply.send(await service.listLeave(
      request.tenant!.tenantId,
      wantsAll ? undefined : request.auth!.userId,
    ));
  });

  app.get("/leave-balances", { preHandler: [requireModule(controlPlane, "leave"), requirePermission("leave:request")] }, async (request, reply) =>
    reply.send(await service.balances(request.tenant!.tenantId, request.auth!.userId)));

  app.post<{ Params: { id: string } }>("/leave-requests/:id/approve", { preHandler: [requireModule(controlPlane, "leave"), requirePermission("leave:approve")] }, async (request, reply) => {
    try {
      const leave = await service.approveLeave(
        request.tenant!.tenantId,
        request.params.id,
        request.auth!.userId,
        optionalNote((request.body as { note?: unknown })?.note),
      );
      await auditLog.record({
        tenantId: leave.tenantId,
        actorUserId: request.auth!.userId,
        action: "leave.approved",
        targetType: "leave_request",
        targetId: leave.id,
        metadata: {
          requesterUserId: leave.requesterUserId,
          requesterEmployeeId: leave.requesterEmployeeId,
          workingDays: leave.workingDays,
        },
      });
      return reply.send(leave);
    } catch (error) { return respondToDomainError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/leave-requests/:id/reject", { preHandler: [requireModule(controlPlane, "leave"), requirePermission("leave:approve")] }, async (request, reply) => {
    try {
      const leave = await service.rejectLeave(
        request.tenant!.tenantId,
        request.params.id,
        request.auth!.userId,
        optionalNote((request.body as { note?: unknown })?.note),
      );
      await auditLog.record({
        tenantId: leave.tenantId,
        actorUserId: request.auth!.userId,
        action: "leave.rejected",
        targetType: "leave_request",
        targetId: leave.id,
        metadata: {
          requesterUserId: leave.requesterUserId,
          requesterEmployeeId: leave.requesterEmployeeId,
        },
      });
      return reply.send(leave);
    } catch (error) { return respondToDomainError(reply, error); }
  });

  app.post<{ Params: { id: string } }>("/leave-requests/:id/cancel", { preHandler: [requireModule(controlPlane, "leave"), requirePermission("leave:request")] }, async (request, reply) => {
    try {
      const leave = await service.cancelLeave(request.tenant!.tenantId, request.params.id, request.auth!.userId);
      await auditLog.record({
        tenantId: leave.tenantId,
        actorUserId: request.auth!.userId,
        action: "leave.cancelled",
        targetType: "leave_request",
        targetId: leave.id,
        metadata: { requesterEmployeeId: leave.requesterEmployeeId },
      });
      return reply.send(leave);
    } catch (error) { return respondToDomainError(reply, error); }
  });

  app.post("/lifecycle-plans", { preHandler: [requireModule(controlPlane, "lifecycle"), requirePermission("lifecycle:manage")] }, async (request, reply) => {
    const body = request.body as {
      subjectEmployeeId?: unknown;
      subjectUserId?: unknown;
      kind?: unknown;
      title?: unknown;
      dueAt?: unknown;
      steps?: unknown;
    };
    const subjectEmployeeId = optionalSubject(body?.subjectEmployeeId);
    const subjectUserId = optionalSubject(body?.subjectUserId);
    if (
      typeof body?.kind !== "string" || !LIFECYCLE_KINDS.has(body.kind as LifecycleKind) ||
      (!subjectEmployeeId && !subjectUserId)
    ) return reply.code(400).send({ error: "subjectEmployeeId or subjectUserId and a valid kind are required" });

    const steps = Array.isArray(body.steps)
      ? body.steps.map((step) => {
          const value = step as { title?: unknown; ownerRole?: unknown };
          return {
            title: typeof value.title === "string" ? value.title : "",
            ownerRole: typeof value.ownerRole === "string" ? value.ownerRole : undefined,
          };
        })
      : undefined;

    try {
      const plan = await service.createLifecyclePlan({
        tenantId: request.tenant!.tenantId,
        subjectEmployeeId,
        subjectUserId,
        kind: body.kind as LifecycleKind,
        title: typeof body.title === "string" ? body.title : undefined,
        dueAt: typeof body.dueAt === "string" ? new Date(body.dueAt) : null,
        steps,
        createdByUserId: request.auth!.userId,
      });
      await auditLog.record({
        tenantId: plan.tenantId,
        actorUserId: request.auth!.userId,
        action: `${plan.kind}.plan_created`,
        targetType: "lifecycle_plan",
        targetId: plan.id,
        metadata: {
          subjectEmployeeId: plan.subjectEmployeeId,
          subjectUserId: plan.subjectUserId,
          steps: plan.steps.length,
        },
      });
      return reply.code(201).send(plan);
    } catch (error) { return respondToDomainError(reply, error); }
  });

  app.get("/lifecycle-plans", { preHandler: [requireModule(controlPlane, "lifecycle"), requirePermission("lifecycle:view")] }, async (request, reply) => {
    const canManage = hasPermission(request.auth!.roles, "lifecycle:manage");
    return reply.send(await service.listLifecyclePlans(
      request.tenant!.tenantId,
      canManage ? undefined : request.auth!.userId,
    ));
  });

  app.post<{ Params: { planId: string; stepId: string } }>(
    "/lifecycle-plans/:planId/steps/:stepId/complete",
    { preHandler: [requireModule(controlPlane, "lifecycle"), requirePermission("lifecycle:manage")] },
    async (request, reply) => {
      try {
        const plan = await service.completeLifecycleStep(
          request.tenant!.tenantId,
          request.params.planId,
          request.params.stepId,
          request.auth!.userId,
        );
        await auditLog.record({
          tenantId: plan.tenantId,
          actorUserId: request.auth!.userId,
          action: `${plan.kind}.step_completed`,
          targetType: "lifecycle_plan",
          targetId: plan.id,
          metadata: {
            subjectEmployeeId: plan.subjectEmployeeId,
            stepId: request.params.stepId,
            status: plan.status,
          },
        });
        return reply.send(plan);
      } catch (error) { return respondToDomainError(reply, error); }
    },
  );

  app.post<{ Params: { id: string } }>("/lifecycle-plans/:id/cancel", { preHandler: [requireModule(controlPlane, "lifecycle"), requirePermission("lifecycle:manage")] }, async (request, reply) => {
    try {
      const plan = await service.cancelLifecyclePlan(
        request.tenant!.tenantId,
        request.params.id,
        request.auth!.userId,
      );
      await auditLog.record({
        tenantId: plan.tenantId,
        actorUserId: request.auth!.userId,
        action: `${plan.kind}.plan_cancelled`,
        targetType: "lifecycle_plan",
        targetId: plan.id,
        metadata: { subjectEmployeeId: plan.subjectEmployeeId },
      });
      return reply.send(plan);
    } catch (error) { return respondToDomainError(reply, error); }
  });
}
