export type PlatformAdminRole = "god_admin" | "platform_support" | "billing_admin";

export interface PlatformAdministrator {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly roles: readonly PlatformAdminRole[];
  readonly createdAt: Date;
}

export interface CreatePlatformAdministratorInput {
  email: string;
  passwordHash: string;
  roles?: readonly PlatformAdminRole[];
}

export interface PlatformAdminClaims {
  readonly adminId: string;
  readonly roles: readonly PlatformAdminRole[];
}
