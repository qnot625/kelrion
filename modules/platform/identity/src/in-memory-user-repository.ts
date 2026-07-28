import { randomUUID } from "node:crypto";
import { normalizeEmail, type CreateUserInput, type User } from "./user.js";
import { DuplicateUserEmailError, type UserRepository } from "./user-repository.js";

function tenantKey(tenantId: string, email: string): string {
  return `${tenantId}:${normalizeEmail(email)}`;
}

export class InMemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, User>();
  private readonly idByTenantEmail = new Map<string, string>();

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
}
