import { AsyncLocalStorage } from "node:async_hooks";

export interface TenantContextValue {
  readonly tenantId: string;
  readonly tenantSlug: string;
}

const storage = new AsyncLocalStorage<TenantContextValue>();

/** Runs `fn` with the given tenant bound to the current async execution context. */
export function runWithTenantContext<T>(context: TenantContextValue, fn: () => T): T {
  return storage.run(context, fn);
}

/** Returns the current tenant context, or undefined outside a tenant-scoped call. */
export function getTenantContext(): TenantContextValue | undefined {
  return storage.getStore();
}

/**
 * Returns the current tenant context or throws. Every repository method that
 * reads or writes tenant-owned data must call this first, per the platform
 * rule that no tenant-owned query may run without an established tenant.
 */
export function requireTenantContext(): TenantContextValue {
  const context = storage.getStore();
  if (!context) {
    throw new Error("No tenant context is set for this operation");
  }
  return context;
}
