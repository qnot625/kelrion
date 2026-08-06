import { expandModuleSelection, getModuleDefinition, type ModuleKey, type SupportedCurrency } from "./module-catalogue.js";

export type BillingCycle = "monthly" | "annual";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "cancelled";

export interface OrganisationSubscription {
  readonly id: string;
  readonly tenantId: string;
  readonly enabledModules: readonly ModuleKey[];
  readonly billingCycle: BillingCycle;
  readonly currency: SupportedCurrency;
  readonly status: SubscriptionStatus;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly unitAmount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateSubscriptionInput {
  tenantId: string;
  enabledModules: readonly ModuleKey[];
  billingCycle?: BillingCycle;
  currency?: SupportedCurrency;
  trialDays?: number;
}

export interface UpdateSubscriptionInput {
  enabledModules?: readonly ModuleKey[];
  billingCycle?: BillingCycle;
  currency?: SupportedCurrency;
  status?: SubscriptionStatus;
}

export function calculateSubscriptionAmount(
  modules: readonly ModuleKey[],
  currency: SupportedCurrency,
  billingCycle: BillingCycle,
): number {
  const monthly = expandModuleSelection(modules).reduce(
    (total, key) => total + getModuleDefinition(key).prices[currency],
    0,
  );
  return billingCycle === "annual" ? monthly * 10 : monthly;
}

export function periodEnd(start: Date, cycle: BillingCycle): Date {
  const result = new Date(start);
  if (cycle === "annual") result.setUTCFullYear(result.getUTCFullYear() + 1);
  else result.setUTCMonth(result.getUTCMonth() + 1);
  return result;
}
