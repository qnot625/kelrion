import { randomUUID } from "node:crypto";
import { normalizeEmail } from "@adminops/identity";
import type { BillingInvoice } from "./invoice.js";
import type { CreatePlatformAdministratorInput, PlatformAdministrator } from "./platform-admin.js";
import { DuplicatePlatformAdministratorError, type ControlPlaneRepository } from "./repository.js";
import type { OrganisationSubscription } from "./subscription.js";

export class InMemoryControlPlaneRepository implements ControlPlaneRepository {
  private readonly subscriptionsByTenant = new Map<string, OrganisationSubscription>();
  private readonly invoicesById = new Map<string, BillingInvoice>();
  private readonly administratorsById = new Map<string, PlatformAdministrator>();
  private readonly administratorIdByEmail = new Map<string, string>();

  async saveSubscription(subscription: OrganisationSubscription): Promise<OrganisationSubscription> {
    this.subscriptionsByTenant.set(subscription.tenantId, subscription);
    return subscription;
  }

  async findSubscriptionByTenant(tenantId: string): Promise<OrganisationSubscription | undefined> {
    return this.subscriptionsByTenant.get(tenantId);
  }

  async listSubscriptions(): Promise<OrganisationSubscription[]> {
    return [...this.subscriptionsByTenant.values()];
  }

  async createInvoice(invoice: BillingInvoice): Promise<BillingInvoice> {
    this.invoicesById.set(invoice.id, invoice);
    return invoice;
  }

  async updateInvoice(invoice: BillingInvoice): Promise<BillingInvoice> {
    this.invoicesById.set(invoice.id, invoice);
    return invoice;
  }

  async findInvoiceById(id: string): Promise<BillingInvoice | undefined> {
    return this.invoicesById.get(id);
  }

  async listInvoices(tenantId?: string): Promise<BillingInvoice[]> {
    return [...this.invoicesById.values()]
      .filter((invoice) => !tenantId || invoice.tenantId === tenantId)
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
  }

  async createPlatformAdministrator(input: CreatePlatformAdministratorInput): Promise<PlatformAdministrator> {
    const email = normalizeEmail(input.email);
    if (this.administratorIdByEmail.has(email)) throw new DuplicatePlatformAdministratorError(email);
    const administrator: PlatformAdministrator = {
      id: randomUUID(),
      email,
      passwordHash: input.passwordHash,
      roles: input.roles ?? ["god_admin"],
      createdAt: new Date(),
    };
    this.administratorsById.set(administrator.id, administrator);
    this.administratorIdByEmail.set(email, administrator.id);
    return administrator;
  }

  async findPlatformAdministratorByEmail(email: string): Promise<PlatformAdministrator | undefined> {
    const id = this.administratorIdByEmail.get(normalizeEmail(email));
    return id ? this.administratorsById.get(id) : undefined;
  }

  async findPlatformAdministratorById(id: string): Promise<PlatformAdministrator | undefined> {
    return this.administratorsById.get(id);
  }

  async hasPlatformAdministrators(): Promise<boolean> {
    return this.administratorsById.size > 0;
  }
}
