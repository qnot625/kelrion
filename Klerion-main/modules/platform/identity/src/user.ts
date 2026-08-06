import type { Role, Permission } from "./rbac.js";

export interface UserProps {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: Role;
  permissions?: Permission[];
  failedLoginAttempts?: number;
  lockoutUntil?: Date | null;
  mfaSecret?: string | null;
  mfaEnabled?: boolean;
  resetTokenHash?: string | null;
  resetTokenExpiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User {
  public readonly id: string;
  public readonly tenantId: string;
  public readonly email: string;
  public passwordHash: string;
  public role: Role;
  public permissions: Permission[];
  public failedLoginAttempts: number;
  public lockoutUntil: Date | null;
  public mfaSecret: string | null;
  public mfaEnabled: boolean;
  public resetTokenHash: string | null;
  public resetTokenExpiresAt: Date | null;
  public readonly createdAt: Date;
  public updatedAt: Date;

  public static readonly MAX_FAILED_ATTEMPTS = 5;
  public static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  constructor(props: UserProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.email = props.email.toLowerCase().trim();
    this.passwordHash = props.passwordHash;
    this.role = props.role;
    this.permissions = props.permissions || [];
    this.failedLoginAttempts = props.failedLoginAttempts || 0;
    this.lockoutUntil = props.lockoutUntil || null;
    this.mfaSecret = props.mfaSecret || null;
    this.mfaEnabled = props.mfaEnabled || false;
    this.resetTokenHash = props.resetTokenHash || null;
    this.resetTokenExpiresAt = props.resetTokenExpiresAt || null;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
  }

  /**
   * Checks if user account is currently locked out.
   */
  public isLockedOut(): boolean {
    if (!this.lockoutUntil) return false;
    if (this.lockoutUntil.getTime() > Date.now()) {
      return true;
    }
    // Lockout has expired; reset lockout status
    this.lockoutUntil = null;
    this.failedLoginAttempts = 0;
    return false;
  }

  /**
   * Records a failed login attempt and locks account if threshold exceeded.
   */
  public recordFailedLogin(): void {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= User.MAX_FAILED_ATTEMPTS) {
      this.lockoutUntil = new Date(Date.now() + User.LOCKOUT_DURATION_MS);
    }
    this.updatedAt = new Date();
  }

  /**
   * Resets failed login attempts counter on successful authentication.
   */
  public recordSuccessfulLogin(): void {
    this.failedLoginAttempts = 0;
    this.lockoutUntil = null;
    this.updatedAt = new Date();
  }
}
