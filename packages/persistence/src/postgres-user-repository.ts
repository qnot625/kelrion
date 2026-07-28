import { and, eq, sql } from "drizzle-orm";
import {
  DuplicateUserEmailError,
  normalizeEmail,
  type CreateUserInput,
  type Role,
  type User,
  type UserRepository,
} from "@adminops/identity";
import type { Database } from "./database.js";
import { isUniqueViolation } from "./pg-errors.js";
import { users } from "./schema.js";

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    passwordHash: row.passwordHash,
    roles: row.roles,
    createdAt: row.createdAt,
  };
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    try {
      const [row] = await this.db
        .insert(users)
        .values({
          tenantId: input.tenantId,
          email,
          passwordHash: input.passwordHash,
          roles: [...(input.roles ?? ["member"])],
        })
        .returning();
      return toUser(row!);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateUserEmailError(email);
      }
      throw error;
    }
  }

  async findById(tenantId: string, id: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
      .limit(1);
    return row ? toUser(row) : undefined;
  }

  async findByEmail(tenantId: string, email: string): Promise<User | undefined> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, normalizeEmail(email))))
      .limit(1);
    return row ? toUser(row) : undefined;
  }

  async listByTenant(tenantId: string): Promise<User[]> {
    const rows = await this.db.select().from(users).where(eq(users.tenantId, tenantId));
    return rows.map(toUser);
  }

  async updateRoles(tenantId: string, id: string, roles: readonly Role[]): Promise<User | undefined> {
    const [row] = await this.db
      .update(users)
      .set({ roles: [...roles] })
      .where(and(eq(users.tenantId, tenantId), eq(users.id, id)))
      .returning();
    return row ? toUser(row) : undefined;
  }

  async hasAnyForTenant(tenantId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.tenantId, tenantId));
    return (row?.count ?? 0) > 0;
  }
}
