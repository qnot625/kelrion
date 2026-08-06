import { User } from "./user.js";

export interface UserRepository {
  save(user: User): Promise<void>;
  findById(tenantId: string, userId: string): Promise<User | null>;
  findByEmail(tenantId: string, email: string): Promise<User | null>;
  findByResetToken(tokenHash: string): Promise<User | null>;
  delete(tenantId: string, userId: string): Promise<boolean>;
  clear(): void;
}

export class InMemoryUserRepository implements UserRepository {
  private users: Map<string, User> = new Map();

  private getKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  public async save(user: User): Promise<void> {
    const key = this.getKey(user.tenantId, user.id);
    this.users.set(key, user);
  }

  public async findById(tenantId: string, userId: string): Promise<User | null> {
    const key = this.getKey(tenantId, userId);
    return this.users.get(key) || null;
  }

  public async findByEmail(tenantId: string, email: string): Promise<User | null> {
    const normEmail = email.toLowerCase().trim();
    for (const user of this.users.values()) {
      if (user.tenantId === tenantId && user.email === normEmail) {
        return user;
      }
    }
    return null;
  }

  public async findByResetToken(tokenHash: string): Promise<User | null> {
    for (const user of this.users.values()) {
      if (user.resetTokenHash === tokenHash) {
        return user;
      }
    }
    return null;
  }

  public async delete(tenantId: string, userId: string): Promise<boolean> {
    const key = this.getKey(tenantId, userId);
    return this.users.delete(key);
  }

  public clear(): void {
    this.users.clear();
  }
}
