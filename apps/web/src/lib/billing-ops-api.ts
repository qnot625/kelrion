import type { ApiSubscription } from "./api";
import type { PlatformSession } from "./platform-session";
import type { KlerionSession, ModuleKey } from "./session";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export interface ApiBillingPaymentProviderStatus {
  readonly provider: "stripe";
  readonly configured: boolean;
  readonly usingRestrictedKey: boolean;
  readonly missing: readonly string[];
}

export interface ApiBillingCheckout {
  readonly provider: "stripe";
  readonly sessionId: string;
  readonly checkoutUrl: string;
}

export interface ApiBillingReconciliationResult {
  readonly trialsActivated: number;
  readonly renewalsCreated: number;
  readonly invoicesOverdue: number;
  readonly subscriptionsPastDue: number;
}

export interface ApiPlatformOperationalReport {
  readonly generatedAt: string;
  readonly organisations: {
    readonly total: number;
    readonly active: number;
    readonly suspended: number;
  };
  readonly subscriptions: {
    readonly total: number;
    readonly byStatus: Readonly<Record<ApiSubscription["status"], number>>;
    readonly monthly: number;
    readonly annual: number;
    readonly trialsEndingWithin30Days: number;
    readonly renewalsWithin30Days: number;
  };
  readonly currencies: readonly {
    readonly currency: ApiSubscription["currency"];
    readonly activeRecurringMonthlyEquivalent: number;
    readonly activeRecurringAnnualEquivalent: number;
    readonly trialRecurringMonthlyEquivalent: number;
    readonly invoiced: number;
    readonly paid: number;
    readonly outstanding: number;
    readonly overdue: number;
    readonly overdueInvoices: number;
  }[];
  readonly moduleAdoption: readonly {
    readonly key: ModuleKey;
    readonly name: string;
    readonly enabledOrganisations: number;
  }[];
  readonly invoices: {
    readonly total: number;
    readonly paid: number;
    readonly open: number;
    readonly overdue: number;
    readonly void: number;
  };
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `Request failed with HTTP ${response.status}`);
  return payload;
}

function tenantHeaders(session: KlerionSession): HeadersInit {
  return {
    Authorization: `Bearer ${session.token ?? ""}`,
    "X-Tenant-Slug": session.tenantSlug,
    "Content-Type": "application/json",
  };
}

function platformHeaders(session: PlatformSession): HeadersInit {
  return {
    Authorization: `Bearer ${session.token}`,
    "Content-Type": "application/json",
  };
}

export function getBillingPaymentProvider(session: KlerionSession): Promise<ApiBillingPaymentProviderStatus> {
  return request<ApiBillingPaymentProviderStatus>("/billing/payment-provider", { headers: tenantHeaders(session) });
}

export function createBillingCheckout(session: KlerionSession, invoiceId: string): Promise<ApiBillingCheckout> {
  return request<ApiBillingCheckout>(`/billing/invoices/${encodeURIComponent(invoiceId)}/checkout`, {
    method: "POST",
    headers: tenantHeaders(session),
  });
}

export function getPlatformOperationalReport(session: PlatformSession): Promise<ApiPlatformOperationalReport> {
  return request<ApiPlatformOperationalReport>("/platform/reporting/overview", { headers: platformHeaders(session) });
}

export function reconcilePlatformBilling(session: PlatformSession): Promise<ApiBillingReconciliationResult> {
  return request<ApiBillingReconciliationResult>("/platform/billing/reconcile", {
    method: "POST",
    headers: platformHeaders(session),
  });
}
