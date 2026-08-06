import { User } from "./user.js";
import { PasswordHasher } from "./password.js";
import { JwtService, type TokenPair } from "./jwt.js";
import { MfaService } from "./mfa.js";
import { SessionService, type UserSession } from "./session.js";
import type { UserRepository } from "./user-repository.js";
import { ROLE_PERMISSIONS, type Role, type Permission } from "./rbac.js";

export interface RegisterUserParams {
  tenantId: string;
  email: string;
  password: string;
  role?: Role;
  permissions?: Permission[];
}

export interface LoginParams {
  tenantId: string;
  email: string;
  password: string;
  mfaCode?: string;
  ip?: string;
  userAgent?: string;
}

export interface LoginResult {
  user: {
    id: string;
    tenantId: string;
    email: string;
    role: Role;
    permissions: Permission[];
    mfaEnabled: boolean;
  };
  tokens: TokenPair;
  session: UserSession;
  mfaRequired?: boolean;
}

export class IdentityService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly auditLogger?: (action: string, payload: Record<string, unknown>) => Promise<void>
  ) {}

  public async registerUser(params: RegisterUserParams): Promise<User> {
    const existing = await this.userRepo.findByEmail(params.tenantId, params.email);
    if (existing) {
      throw new Error("User with this email already exists in tenant");
    }

    const complexity = PasswordHasher.validateComplexity(params.password);
    if (!complexity.valid) {
      throw new Error(`Password complexity validation failed: ${complexity.errors.join(", ")}`);
    }

    const passwordHash = await PasswordHasher.hash(params.password);
    const role: Role = params.role || "member";
    const permissions = params.permissions || ROLE_PERMISSIONS[role] || [];

    const user = new User({
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId: params.tenantId,
      email: params.email,
      passwordHash,
      role,
      permissions,
    });

    await this.userRepo.save(user);

    if (this.auditLogger) {
      await this.auditLogger("USER_REGISTERED", {
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    }

    return user;
  }

  public async login(params: LoginParams): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(params.tenantId, params.email);
    if (!user) {
      if (this.auditLogger) {
        await this.auditLogger("LOGIN_FAILED", {
          tenantId: params.tenantId,
          email: params.email,
          reason: "User not found",
        });
      }
      throw new Error("Invalid credentials");
    }

    if (user.isLockedOut()) {
      if (this.auditLogger) {
        await this.auditLogger("LOGIN_FAILED_LOCKOUT", {
          tenantId: params.tenantId,
          userId: user.id,
          email: user.email,
          lockoutUntil: user.lockoutUntil,
        });
      }
      throw new Error(`Account is locked out until ${user.lockoutUntil?.toISOString()}. Please try again later.`);
    }

    const passwordValid = await PasswordHasher.verify(params.password, user.passwordHash);
    if (!passwordValid) {
      user.recordFailedLogin();
      await this.userRepo.save(user);

      if (this.auditLogger) {
        await this.auditLogger("LOGIN_FAILED", {
          tenantId: params.tenantId,
          userId: user.id,
          email: user.email,
          failedAttempts: user.failedLoginAttempts,
          isLockedOut: user.isLockedOut(),
        });
      }

      if (user.isLockedOut()) {
        throw new Error(`Account locked out due to 5 failed login attempts. Try again in 15 minutes.`);
      }

      throw new Error("Invalid credentials");
    }

    // Handle MFA Verification if enabled
    if (user.mfaEnabled && user.mfaSecret) {
      if (!params.mfaCode) {
        return {
          user: {
            id: user.id,
            tenantId: user.tenantId,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
            mfaEnabled: true,
          },
          tokens: { accessToken: "", refreshToken: "", expiresInSeconds: 0 },
          session: {} as UserSession,
          mfaRequired: true,
        };
      }

      const mfaValid = MfaService.verifyCode(user.mfaSecret, params.mfaCode);
      if (!mfaValid) {
        user.recordFailedLogin();
        await this.userRepo.save(user);
        throw new Error("Invalid MFA code");
      }
    }

    user.recordSuccessfulLogin();
    await this.userRepo.save(user);

    const session = SessionService.createSession(
      user.id,
      user.tenantId,
      params.ip || "127.0.0.1",
      params.userAgent || "Unknown"
    );

    const accessToken = JwtService.signAccessToken({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      permissions: user.permissions,
      sessionId: session.sessionId,
    });

    const refreshToken = JwtService.createRefreshToken(user.id, user.tenantId, session.sessionId);

    if (this.auditLogger) {
      await this.auditLogger("LOGIN_SUCCESS", {
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        sessionId: session.sessionId,
      });
    }

    return {
      user: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
        mfaEnabled: user.mfaEnabled,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresInSeconds: 15 * 60,
      },
      session,
    };
  }

  public async setupMfa(tenantId: string, userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.userRepo.findById(tenantId, userId);
    if (!user) throw new Error("User not found");

    const secret = MfaService.generateSecret();
    const otpauthUrl = MfaService.generateOtpauthUrl(user.email, secret);

    user.mfaSecret = secret;
    await this.userRepo.save(user);

    return { secret, otpauthUrl };
  }

  public async enableMfa(tenantId: string, userId: string, code: string): Promise<boolean> {
    const user = await this.userRepo.findById(tenantId, userId);
    if (!user || !user.mfaSecret) throw new Error("MFA not configured");

    const valid = MfaService.verifyCode(user.mfaSecret, code);
    if (!valid) throw new Error("Invalid verification code");

    user.mfaEnabled = true;
    await this.userRepo.save(user);

    if (this.auditLogger) {
      await this.auditLogger("MFA_ENABLED", { tenantId, userId });
    }

    return true;
  }

  public async requestPasswordReset(tenantId: string, email: string): Promise<string> {
    const user = await this.userRepo.findByEmail(tenantId, email);
    if (!user) {
      // Return synthetic token hash to prevent account enumeration
      return PasswordHasher.generateResetToken().rawToken;
    }

    const { rawToken, tokenHash, expiresAt } = PasswordHasher.generateResetToken();
    user.resetTokenHash = tokenHash;
    user.resetTokenExpiresAt = expiresAt;
    await this.userRepo.save(user);

    if (this.auditLogger) {
      await this.auditLogger("PASSWORD_RESET_REQUESTED", { tenantId, userId: user.id, email });
    }

    return rawToken;
  }

  public async confirmPasswordReset(rawToken: string, newPassword: string): Promise<boolean> {
    const complexity = PasswordHasher.validateComplexity(newPassword);
    if (!complexity.valid) {
      throw new Error(`Password complexity validation failed: ${complexity.errors.join(", ")}`);
    }

    const tokenHash = PasswordHasher.hashToken(rawToken);
    const user = await this.userRepo.findByResetToken(tokenHash);
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
      throw new Error("Invalid or expired password reset token");
    }

    user.passwordHash = await PasswordHasher.hash(newPassword);
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.failedLoginAttempts = 0;
    user.lockoutUntil = null;
    await this.userRepo.save(user);

    if (this.auditLogger) {
      await this.auditLogger("PASSWORD_RESET_COMPLETED", { tenantId: user.tenantId, userId: user.id });
    }

    return true;
  }

  public async logout(accessToken?: string, refreshToken?: string, sessionId?: string): Promise<void> {
    JwtService.revokeToken(accessToken, refreshToken);
    if (sessionId) {
      SessionService.revokeSession(sessionId);
    }
  }
}
