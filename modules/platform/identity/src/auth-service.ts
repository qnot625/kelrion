import { assertValidEmail, normalizeEmail } from "./user.js";
import type { UserRepository } from "./user-repository.js";
import { hashPassword, verifyPassword } from "./password.js";
import { signSessionToken, verifySessionToken, type SessionClaims } from "./session-token.js";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export interface AuthResult {
  readonly userId: string;
  readonly token: string;
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly tokenSecret: Uint8Array,
  ) {}

  async signUp(input: { tenantId: string; email: string; password: string }): Promise<AuthResult> {
    assertValidEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({
      tenantId: input.tenantId,
      email: input.email,
      passwordHash,
    });
    return this.issueToken({ userId: user.id, tenantId: user.tenantId, roles: user.roles });
  }

  async login(input: { tenantId: string; email: string; password: string }): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.tenantId, normalizeEmail(input.email));
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new InvalidCredentialsError();
    }
    return this.issueToken({ userId: user.id, tenantId: user.tenantId, roles: user.roles });
  }

  async verifyToken(token: string): Promise<SessionClaims> {
    return verifySessionToken(token, this.tokenSecret);
  }

  private async issueToken(claims: SessionClaims): Promise<AuthResult> {
    const token = await signSessionToken(claims, this.tokenSecret);
    return { userId: claims.userId, token };
  }
}
