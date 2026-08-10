import { randomUUID } from "node:crypto";
import type { BillingInvoice, InvoiceLineItem } from "./invoice.js";
import { getModuleDefinition } from "./module-catalogue.js";
import type { ControlPlaneRepository } from "./repository.js";
import type { BillingCycle, OrganisationSubscription } from "./subscription.js";

const PAYMENT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function periodEnd(start: Date, billingCycle: BillingCycle): Date {
  const value = new Date(start);
  if (billingCycle === "annual") value.setUTCFullYear(value.getUTCFullYear() + 1);
  else value.setUTCMonth(value.getUTCMonth() + 1);
  return value;
}

function buildRenewalInvoice(subscription: OrganisationSubscription, now: Date): BillingInvoice {
  const lineItems: InvoiceLineItem[] = subscription.enabledModules.map((moduleKey) => {
    const module = getModuleDefinition(moduleKey);
    const monthlyUnit = module.prices[subscription.currency];
    const amount = subscription.billingCycle === "annual" ? monthlyUnit * 10 : monthlyUnit;
    return { moduleKey, description: module.name, quantity: 1, unitAmount: amount, amount };
  });
  const stamp = now.toISOString().slice(0, 7).replace("-", "");
  return {
    id: randomUUID(),
    tenantId: subscription.tenantId,
    number: `KLR-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`,
    currency: subscription.currency,
    billingCycle: subscription.billingCycle,
    status: "open",
    lineItems,
    amountDue: lineItems.reduce((total, line) => total + line.amount, 0),
    amountPaid: 0,
    issuedAt: now,
    dueAt: new Date(now.getTime() + PAYMENT_GRACE_MS),
    paidAt: null,
    paymentReference: null,
  };
}

export interface BillingReconciliationResult {
  readonly trialsActivated: number;
  readonly renewalsCreated: number;
  readonly invoicesOverdue: number;
  readonly subscriptionsPastDue: number;
}

export class BillingLifecycleService {
  constructor(private readonly repository: ControlPlaneRepository) {}

  getInvoice(id: string): Promise<BillingInvoice | undefined> {
    return this.repository.findInvoiceById(id);
  }

  async markInvoicePaid(id: string, paymentReference: string, paidAt = new Date()): Promise<BillingInvoice | undefined> {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) return undefined;
    if (invoice.status === "paid") return invoice;
    if (invoice.status === "void") throw new Error("A void invoice cannot be paid");
    const paid = await this.repository.updateInvoice({
      ...invoice,
      status: "paid",
      amountPaid: invoice.amountDue,
      paidAt,
      paymentReference: paymentReference.trim() || invoice.paymentReference,
    });
    const subscription = await this.repository.findSubscriptionByTenant(invoice.tenantId);
    if (subscription?.status === "past_due") {
      await this.repository.saveSubscription({ ...subscription, status: "active", updatedAt: paidAt });
    }
    return paid;
  }

  async reconcile(now = new Date()): Promise<BillingReconciliationResult> {
    const subscriptions = await this.repository.listSubscriptions();
    const invoices = await this.repository.listInvoices();
    let trialsActivated = 0;
    let renewalsCreated = 0;
    let invoicesOverdue = 0;
    let subscriptionsPastDue = 0;

    for (const subscription of subscriptions) {
      if (subscription.status === "trialing" && subscription.trialEndsAt && subscription.trialEndsAt.getTime() <= now.getTime()) {
        const draft = invoices.find((invoice) => invoice.tenantId === subscription.tenantId && invoice.status === "draft");
        if (draft) {
          await this.repository.updateInvoice({ ...draft, status: "open", dueAt: new Date(now.getTime() + PAYMENT_GRACE_MS) });
        }
        await this.repository.saveSubscription({ ...subscription, status: "active", updatedAt: now });
        trialsActivated += 1;
        continue;
      }

      if (subscription.status === "active" && subscription.currentPeriodEnd.getTime() <= now.getTime()) {
        const periodStart = new Date(subscription.currentPeriodEnd);
        const advanced: OrganisationSubscription = {
          ...subscription,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd(periodStart, subscription.billingCycle),
          updatedAt: now,
        };
        await this.repository.saveSubscription(advanced);
        const renewal = buildRenewalInvoice(advanced, now);
        await this.repository.createInvoice(renewal);
        invoices.push(renewal);
        renewalsCreated += 1;
      }
    }

    for (const invoice of await this.repository.listInvoices()) {
      if (invoice.status !== "open" || invoice.dueAt.getTime() >= now.getTime()) continue;
      await this.repository.updateInvoice({ ...invoice, status: "overdue" });
      invoicesOverdue += 1;
      const subscription = await this.repository.findSubscriptionByTenant(invoice.tenantId);
      if (subscription?.status === "active") {
        await this.repository.saveSubscription({ ...subscription, status: "past_due", updatedAt: now });
        subscriptionsPastDue += 1;
      }
    }

    return { trialsActivated, renewalsCreated, invoicesOverdue, subscriptionsPastDue };
  }
}

export const BILLING_PAYMENT_GRACE_DAYS = 7;
