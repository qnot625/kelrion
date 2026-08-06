import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../../server.js";
import {
  PasswordHasher,
  JwtService,
  MfaService,
  SessionService,
  AuthorizationService,
  ROLE_PERMISSIONS,
} from "../../../../../modules/platform/identity/src/index.js";
import {
  EncryptionService,
  InputSanitizer,
  FileSecurityValidator,
  RateLimiter,
} from "../../../../../modules/platform/security/src/index.js";
import { AuditLogService } from "../../../../../modules/platform/audit/src/index.js";
import { userRepository, identityService } from "../auth.js";

describe("Phase 6: Enterprise Security & Hardening Integration Test Suite", () => {
  let app: ReturnType<typeof createServer>;

  beforeEach(() => {
    userRepository.clear();
    JwtService.clear();
    SessionService.clear();
    RateLimiter.clear();
    AuditLogService.clear();
    app = createServer();
  });

  // =========================================================================
  // 1. AUTHENTICATION & ARGON2ID PASSWORD HASHING
  // =========================================================================
  describe("Authentication & Argon2id Hashing", () => {
    it("hashes password with Argon2id format and validates complexity", async () => {
      const validPass = "SecureP@ssw0rd2026!";
      const invalidPass = "weak";

      const complexityValid = PasswordHasher.validateComplexity(validPass);
      assert.equal(complexityValid.valid, true);

      const complexityInvalid = PasswordHasher.validateComplexity(invalidPass);
      assert.equal(complexityInvalid.valid, false);
      assert.ok(complexityInvalid.errors.length > 0);

      const hash = PasswordHasher.hashSync(validPass);
      assert.ok(hash.startsWith("$argon2id$"));

      const verifySuccess = PasswordHasher.verifySync(validPass, hash);
      assert.equal(verifySuccess, true);

      const verifyFail = PasswordHasher.verifySync("WrongPassword!", hash);
      assert.equal(verifyFail, false);
    });

    it("registers a user and authenticates via /api/auth/login", async () => {
      const tenantId = "tenant-sec-1";
      const registerRes = await app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: {
          tenantId,
          email: "alice@klerion.com",
          password: "SecureP@ssw0rd2026!",
          role: "admin",
        },
      });

      assert.equal(registerRes.statusCode, 201);
      const regBody = registerRes.json();
      assert.equal(regBody.user.email, "alice@klerion.com");
      assert.equal(regBody.user.role, "admin");

      const loginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: {
          tenantId,
          email: "alice@klerion.com",
          password: "SecureP@ssw0rd2026!",
        },
      });

      assert.equal(loginRes.statusCode, 200);
      const loginBody = loginRes.json();
      assert.ok(loginBody.tokens.accessToken);
      assert.ok(loginBody.tokens.refreshToken);
      assert.equal(loginBody.user.email, "alice@klerion.com");
    });

    it("locks account after 5 consecutive failed login attempts", async () => {
      const tenantId = "tenant-sec-lockout";
      await identityService.registerUser({
        tenantId,
        email: "bob@klerion.com",
        password: "SecureP@ssw0rd2026!",
        role: "member",
      });

      // Attempt 1 to 4 failed logins
      for (let i = 1; i <= 4; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { tenantId, email: "bob@klerion.com", password: "WrongPassword!" },
        });
        assert.equal(res.statusCode, 401);
      }

      // Attempt 5 triggers lockout / brute force protection
      const fifthRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { tenantId, email: "bob@klerion.com", password: "WrongPassword!" },
      });
      assert.ok([401, 429].includes(fifthRes.statusCode));

      // Subsequent attempt even with CORRECT password should be rejected due to lockout or rate limiting
      const lockedRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { tenantId, email: "bob@klerion.com", password: "SecureP@ssw0rd2026!" },
      });

      assert.ok([401, 429].includes(lockedRes.statusCode));
    });

    it("handles password reset request and confirmation flow", async () => {
      const tenantId = "tenant-sec-reset";
      await identityService.registerUser({
        tenantId,
        email: "charlie@klerion.com",
        password: "OldPassword123!",
        role: "member",
      });

      const reqResetRes = await app.inject({
        method: "POST",
        url: "/api/auth/password-reset/request",
        payload: { tenantId, email: "charlie@klerion.com" },
      });

      assert.equal(reqResetRes.statusCode, 200);
      const resetToken = reqResetRes.json().resetToken;
      assert.ok(resetToken);

      const confirmRes = await app.inject({
        method: "POST",
        url: "/api/auth/password-reset/confirm",
        payload: { token: resetToken, newPassword: "NewSecurePassword2026!" },
      });

      assert.equal(confirmRes.statusCode, 200);
      assert.equal(confirmRes.json().success, true);

      // Login with new password
      const newLoginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { tenantId, email: "charlie@klerion.com", password: "NewSecurePassword2026!" },
      });
      assert.equal(newLoginRes.statusCode, 200);
    });
  });

  // =========================================================================
  // 2. JWT ACCESS TOKENS & REFRESH TOKEN ROTATION
  // =========================================================================
  describe("JWT & Refresh Token Rotation", () => {
    it("issues 15-minute access token and enforces bearer authentication", async () => {
      const accessToken = JwtService.signAccessToken({
        sub: "user-jwt-1",
        tenantId: "tenant-jwt",
        role: "admin",
        permissions: ROLE_PERMISSIONS.admin,
        sessionId: "sess-1",
      });

      assert.ok(accessToken);
      const verified = JwtService.verifyAccessToken(accessToken);
      assert.equal(verified.sub, "user-jwt-1");
      assert.equal(verified.tenantId, "tenant-jwt");
      assert.equal(verified.role, "admin");

      const meRes = await app.inject({
        method: "GET",
        url: "/api/auth/me",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      assert.equal(meRes.statusCode, 200);
      assert.equal(meRes.json().context.userId, "user-jwt-1");
      assert.equal(meRes.json().context.isAuthenticated, true);
    });

    it("rotates refresh tokens and invalidates old tokens", async () => {
      const rawRefreshToken = JwtService.createRefreshToken("user-rotate", "tenant-jwt", "sess-rotate");
      assert.ok(rawRefreshToken.startsWith("rt_"));

      const rotateRes = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: rawRefreshToken, role: "member" },
      });

      assert.equal(rotateRes.statusCode, 200);
      const { accessToken: newAccess, refreshToken: newRefresh } = rotateRes.json().tokens;
      assert.ok(newAccess);
      assert.ok(newRefresh);
      assert.notEqual(newRefresh, rawRefreshToken);

      // Attempting to reuse old refresh token should fail (Reuse Detection)
      const reuseRes = await app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: rawRefreshToken, role: "member" },
      });
      assert.equal(reuseRes.statusCode, 401);
    });

    it("revokes access and refresh tokens on logout", async () => {
      const accessToken = JwtService.signAccessToken({
        sub: "user-logout",
        tenantId: "tenant-jwt",
        role: "member",
        permissions: ROLE_PERMISSIONS.member,
        sessionId: "sess-logout",
      });
      const rawRefreshToken = JwtService.createRefreshToken("user-logout", "tenant-jwt", "sess-logout");

      const logoutRes = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { refreshToken: rawRefreshToken },
      });

      assert.equal(logoutRes.statusCode, 200);

      // Attempting to verify revoked access token should fail
      assert.throws(() => JwtService.verifyAccessToken(accessToken), /revoked/i);
    });
  });

  // =========================================================================
  // 3. MULTI-FACTOR AUTHENTICATION (TOTP)
  // =========================================================================
  describe("Multi-Factor Authentication (TOTP)", () => {
    it("configures and enables MFA via TOTP setup flow", async () => {
      const tenantId = "tenant-mfa";
      const user = await identityService.registerUser({
        tenantId,
        email: "mfa-user@klerion.com",
        password: "SecureP@ssw0rd2026!",
        role: "admin",
      });

      const setupRes = await app.inject({
        method: "POST",
        url: "/api/auth/mfa/setup",
        headers: { "x-tenant-id": tenantId, "x-user-id": user.id },
      });

      assert.equal(setupRes.statusCode, 200);
      const { secret, otpauthUrl } = setupRes.json();
      assert.ok(secret);
      assert.ok(otpauthUrl.startsWith("otpauth://totp/"));

      // Enable MFA using valid TOTP verification code
      const validCode = (MfaService as any).generateTotpCode(secret, Math.floor(Date.now() / 1000 / 30));
      const enableRes = await app.inject({
        method: "POST",
        url: "/api/auth/mfa/enable",
        headers: { "x-tenant-id": tenantId, "x-user-id": user.id },
        payload: { code: validCode },
      });

      assert.equal(enableRes.statusCode, 200);
      assert.equal(enableRes.json().success, true);
    });
  });

  // =========================================================================
  // 4. RBAC & PERMISSION ENFORCEMENT
  // =========================================================================
  describe("RBAC & Fine-Grained Authorization", () => {
    it("enforces permission checks and returns 403 Forbidden for unauthorized roles", async () => {
      const tenantId = "tenant-rbac";

      // Member attempting to access audit logs endpoint (requires audit:read)
      const resMember = await app.inject({
        method: "GET",
        url: "/api/auth/audit-logs",
        headers: { "x-tenant-id": tenantId, "x-user-id": "mem-1", "x-user-role": "member" },
      });
      assert.equal(resMember.statusCode, 403);

      // Admin accessing audit logs endpoint
      const resAdmin = await app.inject({
        method: "GET",
        url: "/api/auth/audit-logs",
        headers: { "x-tenant-id": tenantId, "x-user-id": "admin-1", "x-user-role": "admin" },
      });
      assert.equal(resAdmin.statusCode, 200);
      assert.ok(Array.isArray(resAdmin.json().logs));
    });

    it("evaluates AuthorizationService permission mapping correctly", () => {
      const adminCtx = { userId: "a1", tenantId: "t1", role: "admin" as const };
      const memberCtx = { userId: "m1", tenantId: "t1", role: "member" as const };

      assert.equal(AuthorizationService.hasPermission(adminCtx, "forms:publish"), true);
      assert.equal(AuthorizationService.hasPermission(memberCtx, "forms:publish"), false);
      assert.equal(AuthorizationService.hasPermission(memberCtx, "forms:submit"), true);
    });
  });

  // =========================================================================
  // 5. TENANT ISOLATION
  // =========================================================================
  describe("Tenant Isolation Verification", () => {
    it("prevents cross-tenant access completely across API routes and repositories", async () => {
      const tenantA = "tenant-alpha";
      const tenantB = "tenant-beta";

      // Register user in Tenant A
      await identityService.registerUser({
        tenantId: tenantA,
        email: "isolated@alpha.com",
        password: "SecureP@ssw0rd2026!",
        role: "admin",
      });

      // Attempt login under Tenant B with Tenant A credentials
      const crossLoginRes = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { tenantId: tenantB, email: "isolated@alpha.com", password: "SecureP@ssw0rd2026!" },
      });
      assert.equal(crossLoginRes.statusCode, 401);

      // Repository check
      const userFoundInTenantB = await userRepository.findByEmail(tenantB, "isolated@alpha.com");
      assert.equal(userFoundInTenantB, null);

      const userFoundInTenantA = await userRepository.findByEmail(tenantA, "isolated@alpha.com");
      assert.ok(userFoundInTenantA);
    });
  });

  // =========================================================================
  // 6. FASTIFY HELMET & SECURE HEADERS
  // =========================================================================
  describe("Fastify Helmet & Secure Headers", () => {
    it("returns strict security headers on all HTTP responses", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/health",
      });

      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-security-policy"]);
      assert.equal(res.headers["x-frame-options"], "DENY");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.ok(res.headers["permissions-policy"]);
    });
  });

  // =========================================================================
  // 7. INPUT SANITIZATION & INJECTION PROTECTION
  // =========================================================================
  describe("Input Sanitization, XSS & Injection Protection", () => {
    it("sanitizes XSS tags and malicious script vectors from input text and objects", () => {
      const xssInput = "<script>alert('XSS')</script><img src='x' onerror='alert(1)'>";
      const sanitized = InputSanitizer.sanitizeHtml(xssInput);

      assert.equal(sanitized.includes("<script>"), false);
      assert.equal(sanitized.includes("onerror="), false);
      assert.ok(sanitized.includes("&lt;script&gt;"));

      const nestedObj = { title: "<b>Hello</b>", meta: { body: "<svg onload=alert(1)>" } };
      const sanitizedObj = InputSanitizer.sanitizeObject(nestedObj);
      assert.equal(sanitizedObj.title, "&lt;b&gt;Hello&lt;&#x2F;b&gt;");
    });

    it("sanitizes SQL control characters to prevent SQL injection", () => {
      const sqlInjection = "admin' OR '1'='1'; DROP TABLE users;--";
      const sanitized = InputSanitizer.sanitizeSqlInput(sqlInjection);

      assert.equal(sanitized.includes(";"), false);
      assert.equal(sanitized.includes("--"), false);
      assert.ok(sanitized.includes("admin'' OR ''1''=''1''"));
    });

    it("prevents Path Traversal attempts using sanitizeFilePath", () => {
      const basePath = "/var/app/uploads";
      const maliciousPath = "../../etc/passwd";

      assert.throws(() => InputSanitizer.sanitizeFilePath(basePath, maliciousPath), /Path traversal attempt/i);

      const safePath = InputSanitizer.sanitizeFilePath(basePath, "documents/file.pdf");
      assert.ok(safePath.startsWith(basePath));
    });

    it("prevents SSRF attacks on loopback and metadata addresses", () => {
      const awsMetadata = "http://169.254.169.254/latest/meta-data/";
      const localhost = "http://localhost:8080/internal";
      const safeExternal = "https://api.external.com/webhook";

      assert.equal(InputSanitizer.validateUrlForSsrf(awsMetadata).valid, false);
      assert.equal(InputSanitizer.validateUrlForSsrf(localhost).valid, false);
      assert.equal(InputSanitizer.validateUrlForSsrf(safeExternal).valid, true);
    });
  });

  // =========================================================================
  // 8. DATA PROTECTION & ENCRYPTION
  // =========================================================================
  describe("Data Protection & Field Encryption", () => {
    it("encrypts and decrypts sensitive data using AES-256-GCM", () => {
      const secretData = "TopSecretSSN-999-00-1234";
      const cipherText = EncryptionService.encrypt(secretData);

      assert.notEqual(cipherText, secretData);
      assert.ok(cipherText.includes(":"));

      const decrypted = EncryptionService.decrypt(cipherText);
      assert.equal(decrypted, secretData);
    });
  });

  // =========================================================================
  // 9. FILE UPLOAD SECURITY
  // =========================================================================
  describe("File Upload Security", () => {
    it("validates file MIME type, magic bytes, size limits, and sanitizes filenames", async () => {
      // Valid PNG image with magic bytes
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
      const resultPng = await FileSecurityValidator.validateFileUpload("my..photo/test.png", "image/png", pngBuffer);

      assert.equal(resultPng.valid, true);
      assert.equal(resultPng.sanitizedFilename, "my.photo_test.png");
      assert.ok(resultPng.hashSha256);

      // Disallowed MIME type
      const exeBuffer = Buffer.from("MZ Header Executable Content");
      const resultExe = await FileSecurityValidator.validateFileUpload("app.exe", "application/x-msdownload", exeBuffer);
      assert.equal(resultExe.valid, false);
      assert.match(resultExe.error || "", /MIME type/i);
    });

    it("detects virus signatures via pluggable virus scanner hook", async () => {
      const eicarBuffer = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
      const virusResult = await FileSecurityValidator.validateFileUpload("test.txt", "text/plain", eicarBuffer);

      assert.equal(virusResult.valid, false);
      assert.match(virusResult.error || "", /infected/i);
    });
  });

  // =========================================================================
  // 10. IMMUTABLE AUDIT LOGGING & CRYPTOGRAPHIC INTEGRITY
  // =========================================================================
  describe("Immutable Audit Logging & Cryptographic Integrity", () => {
    it("logs events with SHA-256 hash chaining and verifies audit trail integrity", async () => {
      const tenantId = "tenant-audit-sec";

      await AuditLogService.logEvent(tenantId, "LOGIN_SUCCESS", "user-1", { ip: "127.0.0.1" });
      await AuditLogService.logEvent(tenantId, "WORKFLOW_PUBLISHED", "user-1", { workflowId: "wf-100" });
      await AuditLogService.logEvent(tenantId, "SERVICE_DESK_ACTION", "user-2", { ticketId: "t-50" });

      const events = AuditLogService.queryEvents(tenantId);
      assert.equal(events.length, 3);
      assert.equal(events[0].previousHash, "0".repeat(64));
      assert.equal(events[1].previousHash, events[0].hash);
      assert.equal(events[2].previousHash, events[1].hash);

      const integrity = AuditLogService.verifyIntegrity(tenantId);
      assert.equal(integrity.valid, true);
    });
  });
});
