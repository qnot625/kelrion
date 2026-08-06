import type { BillingInvoice } from "./invoice.js";
import type { CreatePlatformAdministratorInput, PlatformAdministrator } from "./platform-admin.js";
import type { OrganisationSubscription } from "./subscription.js";

export interface ControlPlaneRepository {
  saveSubscription(subscription: OrganisationSubscription): Promise<OrganisationSubscription>;
  findSubscriptionByTenant(tenantId: string): Promise<OrganisationSubscription | undefined>;
  listSubscriptions(): Promise<OrganisationSubscription[]>;
  createInvoice(invoice: BillingInvoice): Promise<BillingInvoice>;
  updateInvoice(invoice: BillingInvoice): Promise<BillingInvoice>;
  findInvoiceById(id: string): Promise<BillingInvoice | undefined>;
  listInvoices(tenantId?: string): Promise<BillingInvoice[]>;
  createPlatformAdministrator(input: CreatePlatformAdministratorInput): Promise<PlatformAdministrator>;
  findPlatformAdministratorByEmail(email: string): Promise<PlatformAdministrator | undefined>;
  findPlatformAdministratorById(id: string): Promise<PlatformAdministrator | undefined>;
  hasPlatformAdministrators(): Promise<boolean>;
}

export class DuplicatePlatformAdministratorError extends Error {
  constructor(email: string) {
    super(`A platform administrator with email "${email}" already exists`);
    this.name = "DuplicatePlatformAdministratorError";
  }
}
