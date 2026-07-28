import { randomUUID } from "node:crypto";
import { normalizeEmail, type CreateUserInput, type User } from "./user.js";
import type { Role } from "./permission.js";
import { DuplicateUserEmailError, type UserRepository } from "./user-repository.js";

function tenantKey(tenantId: string, email: string): string {
  return `${tenantId}:${normalizeEmail(email)}`;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();
  private readonly idByTenantEmail = new Map<string, string>();
  private readonly userIdsByTenant = new Map<string, Set<string>>();

  async create(input: CreateUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    const key = tenantKey(input.tenantId, email);
    if (this.idByTenantEmail.has(key)) {
      throw new DuplicateUserEmailError(email);
    }

    const user: User = {
      id: randomUUID(),
      tenantId: input.tenantId,
      email,
      passwordHash: input.passwordHash,
      roles: input.roles ?? ["member"],
      createdAt: new Date(),
    };

    this.byId.set(user.id, user);
    this.idByTenantEmail.set(key, user.id);
    const tenantUsers = this.userIdsByTenant.get(input.tenantId) ?? new Set<string>();
    tenantUsers.add(user.id);
    this.userIdsByTenant.set(input.tenantId, tenantUsers);
    return user;
  }

  async findById(tenantId: string, id: string): Promise<User | undefined> {
    const user = this.byId.get(id);
    return user && user.tenantId === tenantId ? user : undefined;
  }

  async findByEmail(tenantId: string, email: string): Promise<User | undefined> {
    const id = this.idByTenantEmail.get(tenantKey(tenantId, email));
    return id ? this.byId.get(id) : undefined;
  }

  async listByTenant(tenantId: string): Promise<User[]> {
    const ids = this.userIdsByTenant.get(tenantId) ?? new Set<string>();
    return [...ids]
      .map((id) => this.byId.get(id))
      .filter((user): user is User => Boolean(user));
  }

  async updateRoles(tenantId: string, id: string, roles: readonly Role[]): Promise<User | undefined> {
    const existing = await this.findById(tenantId, id);
    if (!existing) return undefined;
    const updated: User = { ...existing, roles: [...roles] };
    this.byId.set(id, updated);
    return updated;
  }

  async hasAnyForTenant(tenantId: string): Promise<boolean> {
    return (this.userIdsByTenant.get(tenantId)?.size ?? 0) > 0;
  }
}
