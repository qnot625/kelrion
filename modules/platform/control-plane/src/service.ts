import { randomUUID } from "node:crypto";
import { assertValidEmail, hashPassword, type AuthService, type UserRepository } from "@adminops/identity";
import type { TenantRepository, TenantStatus } from "@adminops/tenancy";
import type { BillingInvoice, InvoiceLineItem } from "./invoice.js";
import {
  MODULE_CATALOGUE,
  assertLiveModuleSelection,
  expandModuleSelection,
  getModuleDefinition,
  type ModuleKey,
  type SupportedCurrency,
} from "./module-catalogue.js";
import type { ControlPlaneRepository } from "./repository.js";
import {
  calculateSubscriptionAmount,
  periodEnd,
  type BillingCycle,
  type OrganisationSubscription,
  type SubscriptionStatus,
} from "./subscription.js";

const LEGACY_DEFAULT_MODULES: readonly ModuleKey[] = ["appointments", "leave", "lifecycle", "cases", "analytics"];
const PAYMENT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export class ModuleNotEnabledError extends Error {
  constructor(moduleKey: ModuleKey) {
    super(`The ${moduleKey} module is not enabled for this organisation`);
    this.name = "ModuleNotEnabledError";
  }
}

export interface OrganisationSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: TenantStatus;
  readonly createdAt: Date;
  readonly subscription: OrganisationSubscription | null;
}

export class ControlPlaneService {
  constructor(
    private readonly repository: ControlPlaneRepository,
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
  ) {}

  listModules() {
    return MODULE_CATALOGUE;
  }

  async provisionTenant(input: {
    name: string;
    slug: string;
    enabledModules?: readonly ModuleKey[];
    billingCycle?: BillingCycle;
    currency?: SupportedCurrency;
    trialDays?: number;
  }) {
    const tenant = await this.tenants.create({ name: input.name, slug: input.slug });
    const subscription = await this.createSubscription({
      tenantId: tenant.id,
      enabledModules: input.enabledModules ?? LEGACY_DEFAULT_MODULES,
      billingCycle: input.billingCycle ?? "monthly",
      currency: input.currency ?? "NGN",
      trialDays: input.trialDays ?? 14,
    });
    return { tenant, subscription };
  }

  async selfServiceSignUp(
    authService: AuthService,
    input: {
      name: string;
      slug: string;
      ownerEmail: string;
      ownerPassword: string;
      enabledModules: readonly ModuleKey[];
      billingCycle?: BillingCycle;
      currency?: SupportedCurrency;
      trialDays?: number;
    },
  ) {
    assertValidEmail(input.ownerEmail);
    if (input.ownerPassword.length < 8) throw new Error("Password must be at least 8 characters");
    const { tenant, subscription } = await this.provisionTenant({
      name: input.name,
      slug: input.slug,
      enabledModules: input.enabledModules,
      billingCycle: input.billingCycle,
      currency: input.currency,
      trialDays: input.trialDays,
    });
    const auth = await authService.signUp({
      tenantId: tenant.id,
      email: input.ownerEmail,
      password: input.ownerPassword,
    });
    return { tenant, subscription, auth };
  }

  async createOrganisation(input: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerPassword: string;
    enabledModules: readonly ModuleKey[];
    billingCycle?: BillingCycle;
    currency?: SupportedCurrency;
    trialDays?: number;
  }): Promise<OrganisationSummary> {
    assertValidEmail(input.ownerEmail);
    if (input.ownerPassword.length < 8) throw new Error("Password must be at least 8 characters");
    const { tenant, subscription } = await this.provisionTenant(input);
    await this.users.create({
      tenantId: tenant.id,
      email: input.ownerEmail,
      passwordHash: await hashPassword(input.ownerPassword),
      roles: ["owner"],
    });
    return { ...tenant, subscription };
  }

  async listOrganisations(): Promise<OrganisationSummary[]> {
    const tenants = await this.tenants.list();
    const subscriptions = new Map((await this.repository.listSubscriptions()).map((item) => [item.tenantId, item]));
    return tenants.map((tenant) => ({ ...tenant, subscription: subscriptions.get(tenant.id) ?? null }));
  }

  async updateOrganisationStatus(tenantId: string, status: TenantStatus): Promise<OrganisationSummary | undefined> {
    const tenant = await this.tenants.updateStatus(tenantId, status);
    if (!tenant) return undefined;
    return { ...tenant, subscription: (await this.repository.findSubscriptionByTenant(tenantId)) ?? null };
  }

  async updateSubscription(
    tenantId: string,
    input: {
      enabledModules?: readonly ModuleKey[];
      billingCycle?: BillingCycle;
      currency?: SupportedCurrency;
      status?: SubscriptionStatus;
    },
  ): Promise<OrganisationSubscription> {
    const existing = await this.repository.findSubscriptionByTenant(tenantId);
    if (!existing) throw new Error("Subscription not found");
    if (input.enabledModules) assertLiveModuleSelection(input.enabledModules);
    const enabledModules = expandModuleSelection(input.enabledModules ?? existing.enabledModules);
    const billingCycle = input.billingCycle ?? existing.billingCycle;
    const currency = input.currency ?? existing.currency;
    const updated: OrganisationSubscription = {
      ...existing,
      enabledModules,
      billingCycle,
      currency,
      status: input.status ?? existing.status,
      unitAmount: calculateSubscriptionAmount(enabledModules, currency, billingCycle),
      currentPeriodEnd: periodEnd(existing.currentPeriodStart, billingCycle),
      updatedAt: new Date(),
    };
    await this.repository.saveSubscription(updated);
    return updated;
  }

  async getSubscription(tenantId: string): Promise<OrganisationSubscription | undefined> {
    return this.repository.findSubscriptionByTenant(tenantId);
  }

  async getEntitlements(tenantId: string) {
    const subscription = await this.repository.findSubscriptionByTenant(tenantId);
    return {
      subscriptionStatus: subscription?.status ?? "cancelled",
      enabledModules: subscription?.enabledModules ?? [],
      modules: MODULE_CATALOGUE.map((module) => ({
        ...module,
        enabled: Boolean(subscription?.enabledModules.includes(module.key)) && subscription?.status !== "cancelled" && subscription?.status !== "suspended",
      })),
    };
  }

  async assertModuleEnabled(tenantId: string, moduleKey: ModuleKey): Promise<void> {
    const subscription = await this.repository.findSubscriptionByTenant(tenantId);
    const active = subscription && ["trialing", "active", "past_due"].includes(subscription.status);
    if (!active || !subscription.enabledModules.includes(moduleKey)) throw new ModuleNotEnabledError(moduleKey);
  }

  async listInvoices(tenantId?: string): Promise<BillingInvoice[]> {
    return this.repository.listInvoices(tenantId);
  }

  async markInvoicePaid(id: string, paymentReference: string): Promise<BillingInvoice | undefined> {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) return undefined;
    const paid: BillingInvoice = {
      ...invoice,
      status: "paid",
      amountPaid: invoice.amountDue,
      paidAt: new Date(),
      paymentReference,
    };
    return this.repository.updateInvoice(paid);
  }

  private async createSubscription(input: {
    tenantId: string;
    enabledModules: readonly ModuleKey[];
    billingCycle: BillingCycle;
    currency: SupportedCurrency;
    trialDays: number;
  }): Promise<OrganisationSubscription> {
    if (!Number.isInteger(input.trialDays) || input.trialDays < 0 || input.trialDays > 90) {
      throw new Error("trialDays must be an integer between 0 and 90");
    }
    assertLiveModuleSelection(input.enabledModules);
    const enabledModules = expandModuleSelection(input.enabledModules);
    const now = new Date();
    const trialEndsAt = input.trialDays > 0 ? new Date(now.getTime() + input.trialDays * 86_400_000) : null;
    const subscription: OrganisationSubscription = {
      id: randomUUID(),
      tenantId: input.tenantId,
      enabledModules,
      billingCycle: input.billingCycle,
      currency: input.currency,
      status: trialEndsAt ? "trialing" : "active",
      trialEndsAt,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd(trialEndsAt ?? now, input.billingCycle),
      unitAmount: calculateSubscriptionAmount(enabledModules, input.currency, input.billingCycle),
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveSubscription(subscription);
    const invoiceDueAt = trialEndsAt ?? new Date(now.getTime() + PAYMENT_GRACE_MS);
    await this.repository.createInvoice(this.buildInvoice(subscription, invoiceDueAt));
    return subscription;
  }

  private buildInvoice(subscription: OrganisationSubscription, dueAt: Date): BillingInvoice {
    const lineItems: InvoiceLineItem[] = subscription.enabledModules.map((moduleKey) => {
      const module = getModuleDefinition(moduleKey);
      const monthlyUnit = module.prices[subscription.currency];
      const amount = subscription.billingCycle === "annual" ? monthlyUnit * 10 : monthlyUnit;
      return { moduleKey, description: module.name, quantity: 1, unitAmount: amount, amount };
    });
    const stamp = new Date().toISOString().slice(0, 7).replace("-", "");
    return {
      id: randomUUID(),
      tenantId: subscription.tenantId,
      number: `KLR-${stamp}-${randomUUID().slice(0, 8).toUpperCase()}`,
      currency: subscription.currency,
      billingCycle: subscription.billingCycle,
      status: subscription.status === "trialing" ? "draft" : "open",
      lineItems,
      amountDue: lineItems.reduce((total, line) => total + line.amount, 0),
      amountPaid: 0,
      issuedAt: new Date(),
      dueAt,
      paidAt: null,
      paymentReference: null,
    };
  }
}
