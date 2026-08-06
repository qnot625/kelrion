import type { KlerionSession } from "../../lib/session";

export type CustomerCaseStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export type CustomerCasePriority = "low" | "normal" | "high" | "urgent";

export interface CustomerCaseRecord {
  readonly id: string;
  readonly reference: string;
  readonly customerEmail: string;
  readonly subject: string;
  readonly description: string;
  readonly category: string;
  readonly priority: CustomerCasePriority;
  readonly status: CustomerCaseStatus;
  readonly ownerUserId: string | null;
  readonly slaDueAt: string;
  readonly slaState: "on_track" | "due_soon" | "breached" | "met" | "missed";
  readonly remainingMinutes: number;
  readonly resolution: string | null;
  readonly createdAt: string;
}

export interface ExecutiveSummaryRecord {
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
  readonly priorityMix: Readonly<Record<CustomerCasePriority, number>>;
  readonly topCategories: readonly { category: string; count: number }[];
  readonly trend: readonly { date: string; casesCreated: number; casesResolved: number; appointments: number }[];
}

class CustomerIntelligenceApi {
  private async request<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
    if (!session.token) throw new Error("A live API session is required for this action.");
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
        "X-Tenant-Slug": session.tenantSlug,
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => null) as { error?: unknown } | T | null;
    if (!response.ok) {
      throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error : `Request failed with status ${response.status}`);
    }
    return body as T;
  }

  listCases(session: KlerionSession): Promise<CustomerCaseRecord[]> {
    return this.request(session, "/cases");
  }

  createCase(session: KlerionSession, input: {
    customerEmail: string;
    subject: string;
    description: string;
    category: string;
    priority: CustomerCasePriority;
  }): Promise<CustomerCaseRecord> {
    return this.request(session, "/cases", { method: "POST", body: JSON.stringify(input) });
  }

  assignToMe(session: KlerionSession, id: string): Promise<CustomerCaseRecord> {
    return this.request(session, `/cases/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ ownerUserId: session.userId }),
    });
  }

  changeStatus(session: KlerionSession, id: string, status: CustomerCaseStatus, resolution?: string): Promise<CustomerCaseRecord> {
    return this.request(session, `/cases/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, resolution }),
    });
  }

  summary(session: KlerionSession): Promise<ExecutiveSummaryRecord> {
    return this.request(session, "/executive/summary");
  }
}

export const customerIntelligenceApi = new CustomerIntelligenceApi();
