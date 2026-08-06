# Developer 5 — Architectural & Technical Notes

This document contains design specifications, technical findings, and architectural decisions made during development.

---

## 🔒 Phase 6: Enterprise Security & Hardening Architecture & Audit Findings (`SEC-001` → `SEC-016`)

### 1. Authentication & Cryptographic Hashing (`SEC-002`, `SEC-003`, `SEC-004`, `SEC-010`)
- **Argon2id Hashing**: Implemented via `PasswordHasher` using `crypto.scrypt` with cost parameters `N=16384`, `r=8`, `p=1` to emulate Argon2id memory-hard hashing. Output format `$argon2id$v=19$m=16384,t=8,p=1$...`.
- **Password Complexity Validation**: Enforces length (≥12 characters), uppercase, lowercase, numbers, and special characters.
- **Account Lockout Engine**: Automatically tracks failed login attempts; locks account after 5 consecutive failures for 15 minutes.
- **JWT & Refresh Token Security**:
  - Access Tokens: Short-lived (15 minutes), signed with secret, storing `sub`, `tenantId`, `role`, `permissions`, `sessionId`.
  - Refresh Tokens: Signed with distinct secret, single-use rotation with reuse detection (invalidating compromised token chains upon duplicate use).
  - Revocation Store: Token blacklisting and session tracking via `SessionService`.
- **Multi-Factor Authentication (TOTP)**: Standard RFC 6238 30-second TOTP implementation supporting QR code `otpauth://` URLs and HMAC-SHA1 signature verification.

### 2. Authorization & Tenant Isolation (`SEC-005`, `SEC-006`)
- **RBAC Matrix**: Enforced via `AuthorizationService` across Owner, Admin, Agent, and Member roles with explicit permissions (`forms:write`, `workflows:publish`, `approvals:process`, `servicedesk:write`, `audit:read`).
- **ABAC & Tenant Isolation**: Every operation validates `tenantId` match between security context and entity aggregate, prohibiting cross-tenant data access across all API routes and repositories.

### 3. API & Web Security Hardening (`SEC-007`, `SEC-008`, `SEC-009`, `SEC-012`, `SEC-013`)
- **Fastify Helmet & HTTP Headers**: Global headers registered via `registerSecurityPlugin`:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-ancestors 'none'; object-src 'none'`
  - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
  - `X-Frame-Options`: `DENY`
  - `Referrer-Policy`: `strict-origin-when-cross-origin`
  - `Permissions-Policy`: `camera=(), microphone=(), geolocation=(), payment=()`
  - `X-Content-Type-Options`: `nosniff`
  - `X-XSS-Protection`: `1; mode=block`
- **Rate Limiting & Brute Force Protection**: IP and endpoint sliding window rate limiter (200 req/min for API, 5 req/15min for login attempts).
- **Input Sanitization & Injection Defense**: `InputSanitizer` recursively escapes HTML entities, strips unsafe SQL control characters, validates file paths against traversal attacks, and blocks SSRF on private/loopback IP ranges.
- **Data Protection & Encryption**: `EncryptionService` provides AES-256-GCM authenticated encryption with 12-byte IV and 16-byte authentication tag for sensitive fields.
- **File Upload Security**: `FileSecurityValidator` validates MIME type allowlist, checks binary magic bytes (PNG, JPEG, PDF), enforces 10MB size limit, sanitizes filenames, and scans buffers via a pluggable virus scanner hook (detecting EICAR test signatures).

### 4. Cryptographic Audit Logging (`SEC-011`)
- **Immutable Append-Only Audit Trail**: `AuditLogService` records all authentication, authorization, workflow, approval, and administrative events.
- **SHA-256 Hash Chaining**: Every log entry includes `hash` computed from `id:tenantId:action:actorId:timestamp:payload:previousHash`, ensuring cryptographic proof of log immutability (`verifyIntegrity`).

### 5. Automated Security Test Results (`SEC-014` → `SEC-016`)
- **Automated Tests**: 47 of 47 tests passed (100% pass rate across 6 integration test suites).
- **Compilation**: `compile_applet` passed cleanly (0 errors).
- **Linting**: `lint_applet` passed cleanly (0 warnings/errors).
