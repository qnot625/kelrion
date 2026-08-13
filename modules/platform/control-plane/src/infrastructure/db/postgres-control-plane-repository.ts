import { desc, eq } from "drizzle-orm";
import {
  DuplicatePlatformAdministratorError,
  type BillingInvoice,
  type BillingCycle,
  type ControlPlaneRepository,
  type CreatePlatformAdministratorInput,
  type InvoiceLineItem,
  type InvoiceStatus,
  type ModuleKey,
  type OrganisationSubscription,
  type PlatformAdministrator,
  type PlatformAdminRole,
  type SubscriptionStatus,
  type SupportedCurrency,
} from "../../index.js";
import { normalizeEmail } from "@adminops/identity";
import type { Database } from "@adminops/persistence";
import { isUniqueViolation } from "@adminops/persistence";
import { billingInvoices, organisationSubscriptions, platformAdministrators } from "./schema.js";

type SubscriptionRow = typeof organisationSubscriptions.$inferSelect;
type InvoiceRow = typeof billingInvoices.$inferSelect;
type PlatformAdminRow = typeof platformAdministrators.$inferSelect;

function toSubscription(row: SubscriptionRow): OrganisationSubscription {
  return {
    id: row.id,
    tenantId: row.tenantId,
    enabledModules: row.enabledModules as ModuleKey[],
    billingCycle: row.billingCycle as BillingCycle,
    currency: row.currency as SupportedCurrency,
    status: row.status as SubscriptionStatus,
    trialEndsAt: row.trialEndsAt,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    unitAmount: row.unitAmount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toInvoice(row: InvoiceRow): BillingInvoice {
  return {
    id: row.id,
    tenantId: row.tenantId,
    number: row.number,
    currency: row.currency as SupportedCurrency,
    billingCycle: row.billingCycle as BillingCycle,
    status: row.status as InvoiceStatus,
    lineItems: row.lineItems as unknown as InvoiceLineItem[],
    amountDue: row.amountDue,
    amountPaid: row.amountPaid,
    issuedAt: row.issuedAt,
    dueAt: row.dueAt,
    paidAt: row.paidAt,
    paymentReference: row.paymentReference,
  };
}

function toAdministrator(row: PlatformAdminRow): PlatformAdministrator {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    roles: row.roles as PlatformAdminRole[],
    createdAt: row.createdAt,
  };
}

export class PostgresControlPlaneRepository implements ControlPlaneRepository {
  constructor(private readonly db: Database) {}

  async saveSubscription(subscription: OrganisationSubscription): Promise<OrganisationSubscription> {
    const [row] = await this.db
      .insert(organisationSubscriptions)
      .values({
        id: subscription.id,
        tenantId: subscription.tenantId,
        enabledModules: [...subscription.enabledModules],
        billingCycle: subscription.billingCycle,
        currency: subscription.currency,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        unitAmount: subscription.unitAmount,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
      })
      .onConflictDoUpdate({
        target: organisationSubscriptions.tenantId,
        set: {
          enabledModules: [...subscription.enabledModules],
          billingCycle: subscription.billingCycle,
          currency: subscription.currency,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          unitAmount: subscription.unitAmount,
          updatedAt: subscription.updatedAt,
        },
      })
      .returning();
    return toSubscription(row!);
  }

  async findSubscriptionByTenant(tenantId: string): Promise<OrganisationSubscription | undefined> {
    const [row] = await this.db.select().from(organisationSubscriptions).where(eq(organisationSubscriptions.tenantId, tenantId)).limit(1);
    return row ? toSubscription(row) : undefined;
  }

  async listSubscriptions(): Promise<OrganisationSubscription[]> {
    const rows = await this.db.select().from(organisationSubscriptions).orderBy(desc(organisationSubscriptions.createdAt));
    return rows.map(toSubscription);
  }

  async createInvoice(invoice: BillingInvoice): Promise<BillingInvoice> {
    const [row] = await this.db.insert(billingInvoices).values({
      id: invoice.id,
      tenantId: invoice.tenantId,
      number: invoice.number,
      currency: invoice.currency,
      billingCycle: invoice.billingCycle,
      status: invoice.status,
      lineItems: invoice.lineItems as unknown as Array<Record<string, unknown>>,
      amountDue: invoice.amountDue,
      amountPaid: invoice.amountPaid,
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      paidAt: invoice.paidAt,
      paymentReference: invoice.paymentReference,
    }).returning();
    return toInvoice(row!);
  }

  async updateInvoice(invoice: BillingInvoice): Promise<BillingInvoice> {
    const [row] = await this.db.update(billingInvoices).set({
      status: invoice.status,
      amountPaid: invoice.amountPaid,
      paidAt: invoice.paidAt,
      paymentReference: invoice.paymentReference,
    }).where(eq(billingInvoices.id, invoice.id)).returning();
    if (!row) throw new Error("Invoice not found");
    return toInvoice(row);
  }

  async findInvoiceById(id: string): Promise<BillingInvoice | undefined> {
    const [row] = await this.db.select().from(billingInvoices).where(eq(billingInvoices.id, id)).limit(1);
    return row ? toInvoice(row) : undefined;
  }

  async listInvoices(tenantId?: string): Promise<BillingInvoice[]> {
    const rows = tenantId
      ? await this.db.select().from(billingInvoices).where(eq(billingInvoices.tenantId, tenantId)).orderBy(desc(billingInvoices.issuedAt))
      : await this.db.select().from(billingInvoices).orderBy(desc(billingInvoices.issuedAt));
    return rows.map(toInvoice);
  }

  async createPlatformAdministrator(input: CreatePlatformAdministratorInput): Promise<PlatformAdministrator> {
    const email = normalizeEmail(input.email);
    try {
      const [row] = await this.db.insert(platformAdministrators).values({
        email,
        passwordHash: input.passwordHash,
        roles: [...(input.roles ?? ["god_admin"])],
      }).returning();
      return toAdministrator(row!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicatePlatformAdministratorError(email);
      throw error;
    }
  }

  async findPlatformAdministratorByEmail(email: string): Promise<PlatformAdministrator | undefined> {
    const [row] = await this.db.select().from(platformAdministrators).where(eq(platformAdministrators.email, normalizeEmail(email))).limit(1);
    return row ? toAdministrator(row) : undefined;
  }

  async findPlatformAdministratorById(id: string): Promise<PlatformAdministrator | undefined> {
    const [row] = await this.db.select().from(platformAdministrators).where(eq(platformAdministrators.id, id)).limit(1);
    return row ? toAdministrator(row) : undefined;
  }

  async hasPlatformAdministrators(): Promise<boolean> {
    const [row] = await this.db.select({ id: platformAdministrators.id }).from(platformAdministrators).limit(1);
    return Boolean(row);
  }
}
