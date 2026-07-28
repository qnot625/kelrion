import { randomUUID } from "node:crypto";
import { assertValidSlug, type CreateTenantInput, type Tenant } from "./tenant.js";
import { DuplicateTenantSlugError, type TenantRepository } from "./tenant-repository.js";

export class InMemoryTenantRepository implements TenantRepository {
  private readonly byId = new Map<string, Tenant>();
  private readonly idBySlug = new Map<string, string>();

  async create(input: CreateTenantInput): Promise<Tenant> {
    assertValidSlug(input.slug);
    if (this.idBySlug.has(input.slug)) {
      throw new DuplicateTenantSlugError(input.slug);
    }

    const tenant: Tenant = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      status: "active",
      createdAt: new Date(),
    };

    this.byId.set(tenant.id, tenant);
    this.idBySlug.set(tenant.slug, tenant.id);
    return tenant;
  }

  async findById(id: string): Promise<Tenant | undefined> {
    return this.byId.get(id);
  }

  async findBySlug(slug: string): Promise<Tenant | undefined> {
    const id = this.idBySlug.get(slug);
    return id ? this.byId.get(id) : undefined;
  }
}
