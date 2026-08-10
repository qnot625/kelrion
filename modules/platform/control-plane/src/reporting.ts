import type { BillingInvoice } from "./invoice.js";
import { MODULE_CATALOGUE, type ModuleKey, type SupportedCurrency } from "./module-catalogue.js";
import type { OrganisationSubscription, SubscriptionStatus } from "./subscription.js";

export interface CurrencyOperationalMetrics {
  readonly currency: SupportedCurrency;
  readonly activeRecurringMonthlyEquivalent: number;
  readonly activeRecurringAnnualEquivalent: number;
  readonly trialRecurringMonthlyEquivalent: number;
  readonly invoiced: number;
  readonly paid: number;
  readonly outstanding: number;
  readonly overdue: number;
  readonly overdueInvoices: number;
}

export interface ModuleAdoptionMetric {
  readonly key: ModuleKey;
  readonly name: string;
  readonly enabledOrganisations: number;
}

export interface PlatformOperationalReport {
  readonly generatedAt: Date;
  readonly organisations: {
    readonly total: number;
    readonly active: number;
    readonly suspended: number;
  };
  readonly subscriptions: {
    readonly total: number;
    readonly byStatus: Readonly<Record<SubscriptionStatus, number>>;
    readonly monthly: number;
    readonly annual: number;
    readonly trialsEndingWithin30Days: number;
    readonly renewalsWithin30Days: number;
  };
  readonly currencies: readonly CurrencyOperationalMetrics[];
  readonly moduleAdoption: readonly ModuleAdoptionMetric[];
  readonly invoices: {
    readonly total: number;
    readonly paid: number;
    readonly open: number;
    readonly overdue: number;
    readonly void: number;
  };
}

const CURRENCIES: readonly SupportedCurrency[] = ["NGN", "USD", "GBP", "EUR"];
const STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due", "suspended", "cancelled"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function buildPlatformOperationalReport(input: {
  now?: Date;
  organisationStatuses: readonly string[];
  subscriptions: readonly OrganisationSubscription[];
  invoices: readonly BillingInvoice[];
}): PlatformOperationalReport {
  const now = input.now ? new Date(input.now) : new Date();
  const horizon = now.getTime() + THIRTY_DAYS_MS;
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<SubscriptionStatus, number>;
  for (const subscription of input.subscriptions) byStatus[subscription.status] += 1;

  const currencies = CURRENCIES.map((currency): CurrencyOperationalMetrics => {
    const subscriptions = input.subscriptions.filter((subscription) => subscription.currency === currency);
    const invoices = input.invoices.filter((invoice) => invoice.currency === currency);
    const active = subscriptions.filter((subscription) => subscription.status === "active");
    const trial = subscriptions.filter((subscription) => subscription.status === "trialing");
    const monthlyEquivalent = (subscription: OrganisationSubscription) => subscription.billingCycle === "monthly" ? subscription.unitAmount : Math.round(subscription.unitAmount / 12);
    const annualEquivalent = (subscription: OrganisationSubscription) => subscription.billingCycle === "annual" ? subscription.unitAmount : subscription.unitAmount * 12;
    const overdueInvoices = invoices.filter((invoice) => invoice.status !== "paid" && invoice.status !== "void" && invoice.dueAt.getTime() < now.getTime());
    return {
      currency,
      activeRecurringMonthlyEquivalent: active.reduce((sum, subscription) => sum + monthlyEquivalent(subscription), 0),
      activeRecurringAnnualEquivalent: active.reduce((sum, subscription) => sum + annualEquivalent(subscription), 0),
      trialRecurringMonthlyEquivalent: trial.reduce((sum, subscription) => sum + monthlyEquivalent(subscription), 0),
      invoiced: invoices.reduce((sum, invoice) => sum + invoice.amountDue, 0),
      paid: invoices.reduce((sum, invoice) => sum + invoice.amountPaid, 0),
      outstanding: invoices.filter((invoice) => invoice.status !== "void").reduce((sum, invoice) => sum + Math.max(0, invoice.amountDue - invoice.amountPaid), 0),
      overdue: overdueInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amountDue - invoice.amountPaid), 0),
      overdueInvoices: overdueInvoices.length,
    };
  });

  const moduleAdoption = MODULE_CATALOGUE.map((definition) => ({
    key: definition.key,
    name: definition.name,
    enabledOrganisations: input.subscriptions.filter((subscription) => subscription.enabledModules.includes(definition.key)).length,
  })).sort((a, b) => b.enabledOrganisations - a.enabledOrganisations || a.name.localeCompare(b.name));

  const invoiceIsOverdue = (invoice: BillingInvoice) => invoice.status !== "paid" && invoice.status !== "void" && invoice.dueAt.getTime() < now.getTime();
  return {
    generatedAt: now,
    organisations: {
      total: input.organisationStatuses.length,
      active: input.organisationStatuses.filter((status) => status === "active").length,
      suspended: input.organisationStatuses.filter((status) => status === "suspended").length,
    },
    subscriptions: {
      total: input.subscriptions.length,
      byStatus,
      monthly: input.subscriptions.filter((subscription) => subscription.billingCycle === "monthly").length,
      annual: input.subscriptions.filter((subscription) => subscription.billingCycle === "annual").length,
      trialsEndingWithin30Days: input.subscriptions.filter((subscription) => subscription.status === "trialing" && subscription.trialEndsAt && subscription.trialEndsAt.getTime() >= now.getTime() && subscription.trialEndsAt.getTime() <= horizon).length,
      renewalsWithin30Days: input.subscriptions.filter((subscription) => subscription.status === "active" && subscription.currentPeriodEnd.getTime() >= now.getTime() && subscription.currentPeriodEnd.getTime() <= horizon).length,
    },
    currencies,
    moduleAdoption,
    invoices: {
      total: input.invoices.length,
      paid: input.invoices.filter((invoice) => invoice.status === "paid").length,
      open: input.invoices.filter((invoice) => invoice.status === "open" && !invoiceIsOverdue(invoice)).length,
      overdue: input.invoices.filter(invoiceIsOverdue).length,
      void: input.invoices.filter((invoice) => invoice.status === "void").length,
    },
  };
}
