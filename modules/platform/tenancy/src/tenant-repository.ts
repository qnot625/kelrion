import type { CreateTenantInput, Tenant } from "./tenant.js";

export interface TenantRepository {
  create(input: CreateTenantInput): Promise<Tenant>;
  findById(id: string): Promise<Tenant | undefined>;
  findBySlug(slug: string): Promise<Tenant | undefined>;
  list(): Promise<Tenant[]>;
  updateStatus(id: string, status: Tenant["status"]): Promise<Tenant | undefined>;
}

export class DuplicateTenantSlugError extends Error {
  constructor(slug: string) {
    super(`Tenant slug "${slug}" is already in use`);
    this.name = "DuplicateTenantSlugError";
  }
}
