import { asc, eq } from "drizzle-orm";
import {
  assertValidSlug,
  DuplicateTenantSlugError,
  type CreateTenantInput,
  type Tenant,
  type TenantRepository,
  type TenantStatus,
} from "@adminops/tenancy";
import type { Database } from "./database.js";
import { isUniqueViolation } from "./pg-errors.js";
import { tenants } from "./schema.js";

type TenantRow = typeof tenants.$inferSelect;

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as TenantStatus,
    createdAt: row.createdAt,
  };
}

export class PostgresTenantRepository implements TenantRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateTenantInput): Promise<Tenant> {
    assertValidSlug(input.slug);
    try {
      const [row] = await this.db
        .insert(tenants)
        .values({ name: input.name, slug: input.slug, status: "active" })
        .returning();
      return toTenant(row!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateTenantSlugError(input.slug);
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Tenant | undefined> {
    const [row] = await this.db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return row ? toTenant(row) : undefined;
  }

  async findBySlug(slug: string): Promise<Tenant | undefined> {
    const [row] = await this.db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    return row ? toTenant(row) : undefined;
  }

  async list(): Promise<Tenant[]> {
    const rows = await this.db.select().from(tenants).orderBy(asc(tenants.createdAt));
    return rows.map(toTenant);
  }

  async updateStatus(id: string, status: TenantStatus): Promise<Tenant | undefined> {
    const [row] = await this.db.update(tenants).set({ status }).where(eq(tenants.id, id)).returning();
    return row ? toTenant(row) : undefined;
  }
}
