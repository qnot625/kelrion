import type { BillingCycle } from "./subscription.js";
import type { ModuleKey, SupportedCurrency } from "./module-catalogue.js";

export type InvoiceStatus = "draft" | "open" | "paid" | "overdue" | "void";

export interface InvoiceLineItem {
  readonly moduleKey: ModuleKey;
  readonly description: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly amount: number;
}

export interface BillingInvoice {
  readonly id: string;
  readonly tenantId: string;
  readonly number: string;
  readonly currency: SupportedCurrency;
  readonly billingCycle: BillingCycle;
  readonly status: InvoiceStatus;
  readonly lineItems: readonly InvoiceLineItem[];
  readonly amountDue: number;
  readonly amountPaid: number;
  readonly issuedAt: Date;
  readonly dueAt: Date;
  readonly paidAt: Date | null;
  readonly paymentReference: string | null;
}
