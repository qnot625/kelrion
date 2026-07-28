import { SignJWT, jwtVerify } from "jose";

export interface SessionClaims {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly string[];
}

const ISSUER = "adminops-os";
const TOKEN_TTL = "12h";

export async function signSessionToken(claims: SessionClaims, secret: Uint8Array): Promise<string> {
  return new SignJWT({ tenantId: claims.tenantId, roles: claims.roles })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(secret);
}

export async function verifySessionToken(token: string, secret: Uint8Array): Promise<SessionClaims> {
  const { payload } = await jwtVerify(token, secret, { issuer: ISSUER });
  if (typeof payload.sub !== "string" || typeof payload.tenantId !== "string") {
    throw new Error("Session token is missing required claims");
  }
  return {
    userId: payload.sub,
    tenantId: payload.tenantId,
    roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
  };
}
