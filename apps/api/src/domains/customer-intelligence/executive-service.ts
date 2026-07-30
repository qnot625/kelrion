import type { AppointmentService } from "@adminops/branch-flow";
import type { CustomerIntelligenceRepository } from "./repository.js";
import { decorateCase } from "./service.js";
import type { CasePriority, ExecutiveSummary } from "./types.js";

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export class ExecutiveSummaryService {
  constructor(
    private readonly repository: CustomerIntelligenceRepository,
    private readonly appointments: AppointmentService,
  ) {}

  async summary(tenantId: string, now = new Date()): Promise<ExecutiveSummary> {
    const [cases, appointments] = await Promise.all([
      this.repository.listCases(tenantId),
      this.appointments.list(tenantId),
    ]);
    const decorated = cases.map((item) => decorateCase(item, now));
    const active = decorated.filter((item) => !["resolved", "closed"].includes(item.status));
    const breached = active.filter((item) => item.slaState === "breached");
    const resolved = decorated.filter((item) => item.resolvedAt !== null);
    const slaMet = resolved.filter((item) => item.slaState === "met").length;
    const averageResolutionHours = resolved.length
      ? resolved.reduce((total, item) => total + ((item.resolvedAt!.getTime() - item.createdAt.getTime()) / 3_600_000), 0) / resolved.length
      : 0;

    const priorityMix: Record<CasePriority, number> = { low: 0, normal: 0, high: 0, urgent: 0 };
    const categories = new Map<string, number>();
    for (const customerCase of decorated) {
      priorityMix[customerCase.priority] += 1;
      categories.set(customerCase.category, (categories.get(customerCase.category) ?? 0) + 1);
    }

    const trend = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(now);
      date.setUTCDate(date.getUTCDate() - (6 - offset));
      const key = dateKey(date);
      return {
        date: key,
        casesCreated: decorated.filter((item) => dateKey(item.createdAt) === key).length,
        casesResolved: decorated.filter((item) => item.resolvedAt && dateKey(item.resolvedAt) === key).length,
        appointments: appointments.filter((item) => dateKey(item.startAt) === key).length,
      };
    });

    const completedAppointments = appointments.filter((item) => item.status === "completed").length;
    return {
      generatedAt: now.toISOString(),
      cases: {
        total: decorated.length,
        active: active.length,
        breached: breached.length,
        resolved: resolved.length,
        slaCompliancePercent: resolved.length ? Math.round((slaMet / resolved.length) * 100) : 100,
        averageResolutionHours: Math.round(averageResolutionHours * 10) / 10,
      },
      appointments: {
        total: appointments.length,
        completed: completedAppointments,
        checkedIn: appointments.filter((item) => item.status === "checked_in").length,
        noShow: appointments.filter((item) => item.status === "no_show").length,
        cancelled: appointments.filter((item) => item.status === "cancelled").length,
        completionPercent: appointments.length ? Math.round((completedAppointments / appointments.length) * 100) : 0,
      },
      priorityMix,
      topCategories: [...categories.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      trend,
    };
  }
}
