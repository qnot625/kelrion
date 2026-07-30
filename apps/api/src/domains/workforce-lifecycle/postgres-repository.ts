import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@adminops/persistence";
import type { WorkforceLifecycleRepository } from "./repository.js";
import { leaveRequests, lifecyclePlans } from "./postgres-schema.js";
import type {
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  LifecycleKind,
  LifecyclePlan,
  LifecycleStatus,
} from "./types.js";

type LeaveRow = typeof leaveRequests.$inferSelect;
type PlanRow = typeof lifecyclePlans.$inferSelect;

function toLeaveRequest(row: LeaveRow): LeaveRequest {
  return {
    id: row.id,
    tenantId: row.tenantId,
    requesterUserId: row.requesterUserId,
    type: row.type as LeaveType,
    startDate: row.startDate,
    endDate: row.endDate,
    workingDays: row.workingDays,
    reason: row.reason,
    status: row.status as LeaveStatus,
    decidedByUserId: row.decidedByUserId,
    decisionNote: row.decisionNote,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLifecyclePlan(row: PlanRow): LifecyclePlan {
  return {
    id: row.id,
    tenantId: row.tenantId,
    subjectUserId: row.subjectUserId,
    kind: row.kind as LifecycleKind,
    title: row.title,
    dueAt: row.dueAt,
    status: row.status as LifecycleStatus,
    steps: row.steps.map((step) => ({
      ...step,
      completedAt: step.completedAt ? new Date(step.completedAt) : null,
    })),
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export class PostgresWorkforceLifecycleRepository implements WorkforceLifecycleRepository {
  constructor(private readonly db: Database) {}

  async saveLeaveRequest(request: LeaveRequest): Promise<void> {
    await this.db
      .insert(leaveRequests)
      .values({
        id: request.id,
        tenantId: request.tenantId,
        requesterUserId: request.requesterUserId,
        type: request.type,
        startDate: request.startDate,
        endDate: request.endDate,
        workingDays: request.workingDays,
        reason: request.reason,
        status: request.status,
        decidedByUserId: request.decidedByUserId,
        decisionNote: request.decisionNote,
        decidedAt: request.decidedAt,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      })
      .onConflictDoUpdate({
        target: leaveRequests.id,
        set: {
          status: request.status,
          decidedByUserId: request.decidedByUserId,
          decisionNote: request.decisionNote,
          decidedAt: request.decidedAt,
          updatedAt: request.updatedAt,
        },
      });
  }

  async findLeaveRequest(tenantId: string, id: string): Promise<LeaveRequest | undefined> {
    const [row] = await this.db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id)))
      .limit(1);
    return row ? toLeaveRequest(row) : undefined;
  }

  async listLeaveRequests(tenantId: string, requesterUserId?: string): Promise<LeaveRequest[]> {
    const condition = requesterUserId
      ? and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.requesterUserId, requesterUserId))
      : eq(leaveRequests.tenantId, tenantId);
    const rows = await this.db
      .select()
      .from(leaveRequests)
      .where(condition)
      .orderBy(desc(leaveRequests.createdAt));
    return rows.map(toLeaveRequest);
  }

  async saveLifecyclePlan(plan: LifecyclePlan): Promise<void> {
    await this.db
      .insert(lifecyclePlans)
      .values({
        id: plan.id,
        tenantId: plan.tenantId,
        subjectUserId: plan.subjectUserId,
        kind: plan.kind,
        title: plan.title,
        dueAt: plan.dueAt,
        status: plan.status,
        steps: plan.steps.map((step) => ({
          ...step,
          completedAt: step.completedAt?.toISOString() ?? null,
        })),
        createdByUserId: plan.createdByUserId,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        completedAt: plan.completedAt,
      })
      .onConflictDoUpdate({
        target: lifecyclePlans.id,
        set: {
          title: plan.title,
          dueAt: plan.dueAt,
          status: plan.status,
          steps: plan.steps.map((step) => ({
            ...step,
            completedAt: step.completedAt?.toISOString() ?? null,
          })),
          updatedAt: plan.updatedAt,
          completedAt: plan.completedAt,
        },
      });
  }

  async findLifecyclePlan(tenantId: string, id: string): Promise<LifecyclePlan | undefined> {
    const [row] = await this.db
      .select()
      .from(lifecyclePlans)
      .where(and(eq(lifecyclePlans.tenantId, tenantId), eq(lifecyclePlans.id, id)))
      .limit(1);
    return row ? toLifecyclePlan(row) : undefined;
  }

  async listLifecyclePlans(tenantId: string, subjectUserId?: string): Promise<LifecyclePlan[]> {
    const condition = subjectUserId
      ? and(eq(lifecyclePlans.tenantId, tenantId), eq(lifecyclePlans.subjectUserId, subjectUserId))
      : eq(lifecyclePlans.tenantId, tenantId);
    const rows = await this.db
      .select()
      .from(lifecyclePlans)
      .where(condition)
      .orderBy(desc(lifecyclePlans.createdAt));
    return rows.map(toLifecyclePlan);
  }
}
