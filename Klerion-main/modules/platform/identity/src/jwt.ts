import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { Role, Permission } from "./rbac.js";

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: Role;
  permissions: Permission[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface RefreshTokenRecord {
  tokenHash: string;
  userId: string;
  tenantId: string;
  sessionId: string;
  expiresAt: Date;
  revoked: boolean;
}

export class JwtService {
  private static readonly SECRET = process.env.JWT_SECRET || "klerion-adminops-enterprise-secret-key-2026";
  private static readonly ACCESS_TOKEN_EXPIRATION = "15m";
  private static readonly REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  private static revokedTokens: Set<string> = new Set();
  private static refreshTokenStore: Map<string, RefreshTokenRecord> = new Map();

  /**
   * Signs a JWT access token valid for 15 minutes.
   */
  public static signAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
    return jwt.sign(payload, this.SECRET, { expiresIn: this.ACCESS_TOKEN_EXPIRATION });
  }

  /**
   * Verifies a JWT access token and checks revocation list.
   */
  public static verifyAccessToken(token: string): JwtPayload {
    if (this.revokedTokens.has(token)) {
      throw new Error("Token has been revoked");
    }
    const decoded = jwt.verify(token, this.SECRET) as JwtPayload;
    return decoded;
  }

  /**
   * Generates a refresh token, stores its hash, and binds it to user/session.
   */
  public static createRefreshToken(userId: string, tenantId: string, sessionId: string): string {
    const rawToken = `rt_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + this.REFRESH_TOKEN_TTL_MS);

    this.refreshTokenStore.set(tokenHash, {
      tokenHash,
      userId,
      tenantId,
      sessionId,
      expiresAt,
      revoked: false,
    });

    return rawToken;
  }

  /**
   * Rotates refresh token: invalidates old token and returns a new token pair.
   */
  public static rotateRefreshToken(
    rawRefreshToken: string,
    userRole: Role,
    userPermissions: Permission[]
  ): TokenPair {
    const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
    const record = this.refreshTokenStore.get(tokenHash);

    if (!record || record.revoked || record.expiresAt.getTime() < Date.now()) {
      if (record) {
        // Reuse detection trigger: revoke all tokens for this session
        record.revoked = true;
      }
      throw new Error("Invalid or expired refresh token");
    }

    // Immediately revoke the used refresh token (Rotation)
    record.revoked = true;

    // Issue new refresh token
    const newRefreshToken = this.createRefreshToken(record.userId, record.tenantId, record.sessionId);

    // Issue new access token (15 mins)
    const newAccessToken = this.signAccessToken({
      sub: record.userId,
      tenantId: record.tenantId,
      role: userRole,
      permissions: userPermissions,
      sessionId: record.sessionId,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresInSeconds: 15 * 60,
    };
  }

  /**
   * Revokes an access token or refresh token on logout.
   */
  public static revokeToken(accessToken?: string, rawRefreshToken?: string): void {
    if (accessToken) {
      this.revokedTokens.add(accessToken);
    }
    if (rawRefreshToken) {
      const tokenHash = crypto.createHash("sha256").update(rawRefreshToken).digest("hex");
      const record = this.refreshTokenStore.get(tokenHash);
      if (record) {
        record.revoked = true;
      }
    }
  }

  /**
   * Clears token store (useful for tests).
   */
  public static clear(): void {
    this.revokedTokens.clear();
    this.refreshTokenStore.clear();
  }
}
