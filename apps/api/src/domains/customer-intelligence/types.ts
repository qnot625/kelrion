export type CasePriority = "low" | "normal" | "high" | "urgent";
export type CaseStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type CaseCommentVisibility = "public" | "internal";
export type CaseSlaState = "on_track" | "due_soon" | "breached" | "met" | "missed";

export interface CustomerCase {
  readonly id: string;
  readonly tenantId: string;
  readonly reference: string;
  readonly customerEmail: string;
  readonly subject: string;
  readonly description: string;
  readonly category: string;
  readonly priority: CasePriority;
  readonly status: CaseStatus;
  readonly ownerUserId: string | null;
  readonly slaDueAt: Date;
  readonly firstResponseAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly resolution: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CaseComment {
  readonly id: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly visibility: CaseCommentVisibility;
  readonly createdAt: Date;
}

export interface CaseWithSla extends CustomerCase {
  readonly slaState: CaseSlaState;
  readonly remainingMinutes: number;
}

export interface ExecutiveSummary {
  readonly generatedAt: string;
  readonly cases: {
    readonly total: number;
    readonly active: number;
    readonly breached: number;
    readonly resolved: number;
    readonly slaCompliancePercent: number;
    readonly averageResolutionHours: number;
  };
  readonly appointments: {
    readonly total: number;
    readonly completed: number;
    readonly checkedIn: number;
    readonly noShow: number;
    readonly cancelled: number;
    readonly completionPercent: number;
  };
  readonly priorityMix: Readonly<Record<CasePriority, number>>;
  readonly topCategories: readonly { category: string; count: number }[];
  readonly trend: readonly {
    date: string;
    casesCreated: number;
    casesResolved: number;
    appointments: number;
  }[];
}

export class CustomerCaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerCaseValidationError";
  }
}

export class CustomerCaseNotFoundError extends Error {
  constructor(id: string) {
    super(`Customer case "${id}" was not found for this tenant`);
    this.name = "CustomerCaseNotFoundError";
  }
}

export class InvalidCaseTransitionError extends Error {
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`Cannot move a customer case from "${from}" to "${to}"`);
    this.name = "InvalidCaseTransitionError";
  }
}
