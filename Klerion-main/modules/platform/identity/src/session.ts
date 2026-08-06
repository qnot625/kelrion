import crypto from "node:crypto";

export interface UserSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  ip: string;
  userAgent: string;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  isRevoked: boolean;
}

export class SessionService {
  private static sessions: Map<string, UserSession> = new Map();
  private static readonly DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Creates a tracked user session.
   */
  public static createSession(
    userId: string,
    tenantId: string,
    ip: string,
    userAgent: string
  ): UserSession {
    const sessionId = `sess_${crypto.randomBytes(16).toString("hex")}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.DEFAULT_SESSION_TTL_MS);

    const session: UserSession = {
      sessionId,
      userId,
      tenantId,
      ip: ip || "127.0.0.1",
      userAgent: userAgent || "Unknown Device",
      createdAt: now,
      lastActiveAt: now,
      expiresAt,
      isRevoked: false,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Gets an active session by ID.
   */
  public static getSession(sessionId: string): UserSession | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.isRevoked || session.expiresAt.getTime() < Date.now()) {
      return null;
    }
    session.lastActiveAt = new Date();
    return session;
  }

  /**
   * Revokes a specific session.
   */
  public static revokeSession(sessionId: string, userId?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (userId && session.userId !== userId) return false;
      session.isRevoked = true;
      return true;
    }
    return false;
  }

  /**
   * Lists all active sessions for a user.
   */
  public static getUserSessions(userId: string, tenantId: string): UserSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.userId === userId && s.tenantId === tenantId && !s.isRevoked && s.expiresAt.getTime() > Date.now()
    );
  }

  /**
   * Clears all session data (useful for testing).
   */
  public static clear(): void {
    this.sessions.clear();
  }
}
