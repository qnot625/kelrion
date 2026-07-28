export interface User {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly roles: readonly string[];
  readonly createdAt: Date;
}

export interface CreateUserInput {
  tenantId: string;
  email: string;
  passwordHash: string;
  roles?: readonly string[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function assertValidEmail(email: string): void {
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error(`Invalid email address: "${email}"`);
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
