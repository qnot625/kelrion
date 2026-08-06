import { hashPassword, normalizeEmail, verifyPassword } from "@adminops/identity";
import { SignJWT, jwtVerify } from "jose";
import type { PlatformAdminClaims, PlatformAdminRole } from "./platform-admin.js";
import type { ControlPlaneRepository } from "./repository.js";

const ISSUER = "klerion-platform-admin";
const TOKEN_TTL = "8h";

export class PlatformAdminBootstrapClosedError extends Error {
  constructor() {
    super("Platform administrator bootstrap has already been completed");
    this.name = "PlatformAdminBootstrapClosedError";
  }
}

export class InvalidPlatformAdminCredentialsError extends Error {
  constructor() {
    super("Invalid platform administrator email or password");
    this.name = "InvalidPlatformAdminCredentialsError";
  }
}

export class PlatformAdminAuthService {
  constructor(
    private readonly repository: ControlPlaneRepository,
    private readonly tokenSecret: Uint8Array,
  ) {}

  async bootstrap(email: string, password: string): Promise<{ adminId: string; token: string }> {
    if (await this.repository.hasPlatformAdministrators()) throw new PlatformAdminBootstrapClosedError();
    const administrator = await this.repository.createPlatformAdministrator({
      email,
      passwordHash: await hashPassword(password),
      roles: ["god_admin"],
    });
    return { adminId: administrator.id, token: await this.issueToken(administrator.id, administrator.roles) };
  }

  async login(email: string, password: string): Promise<{ adminId: string; token: string }> {
    const administrator = await this.repository.findPlatformAdministratorByEmail(normalizeEmail(email));
    if (!administrator || !(await verifyPassword(password, administrator.passwordHash))) {
      throw new InvalidPlatformAdminCredentialsError();
    }
    return { adminId: administrator.id, token: await this.issueToken(administrator.id, administrator.roles) };
  }

  async verifyToken(token: string): Promise<PlatformAdminClaims> {
    const { payload } = await jwtVerify(token, this.tokenSecret, { issuer: ISSUER });
    if (typeof payload.sub !== "string") throw new Error("Platform admin token is missing a subject");
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((role: unknown): role is PlatformAdminRole =>
          role === "god_admin" || role === "platform_support" || role === "billing_admin",
        )
      : [];
    return { adminId: payload.sub, roles };
  }

  private issueToken(adminId: string, roles: readonly PlatformAdminRole[]): Promise<string> {
    return new SignJWT({ roles, scope: "platform" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(adminId)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(TOKEN_TTL)
      .sign(this.tokenSecret);
  }
}
