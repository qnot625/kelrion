import type { CreateUserInput, User } from "./user.js";

export interface UserRepository {
  create(input: CreateUserInput): Promise<User>;
  findById(tenantId: string, id: string): Promise<User | undefined>;
  findByEmail(tenantId: string, email: string): Promise<User | undefined>;
  hasAnyForTenant(tenantId: string): Promise<boolean>;
}

export class DuplicateUserEmailError extends Error {
  constructor(email: string) {
    super(`A user with email "${email}" already exists in this tenant`);
    this.name = "DuplicateUserEmailError";
  }
}
