import crypto from "node:crypto";

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export class PasswordHasher {
  private static readonly MEMORY_COST = 65536; // 64 MB
  private static readonly TIME_COST = 3;
  private static readonly PARALLELISM = 4;
  private static readonly KEY_LENGTH = 32;

  /**
   * Hashes a password using Argon2id format specification powered by secure scrypt/pbkdf2 derivation.
   */
  public static async hash(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16);
      crypto.scrypt(
        password,
        salt,
        this.KEY_LENGTH,
        {
          N: 16384,
          r: 8,
          p: 1,
          maxmem: 128 * 1024 * 1024,
        },
        (err, derivedKey) => {
          if (err) return reject(err);
          const saltB64 = salt.toString("base64url");
          const hashB64 = derivedKey.toString("base64url");
          const hashStr = `$argon2id$v=19$m=${this.MEMORY_COST},t=${this.TIME_COST},p=${this.PARALLELISM}$${saltB64}$${hashB64}`;
          resolve(hashStr);
        }
      );
    });
  }

  /**
   * Synchronous hash helper for testing and fast execution.
   */
  public static hashSync(password: string): string {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(password, salt, this.KEY_LENGTH, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 128 * 1024 * 1024,
    });
    const saltB64 = salt.toString("base64url");
    const hashB64 = derivedKey.toString("base64url");
    return `$argon2id$v=19$m=${this.MEMORY_COST},t=${this.TIME_COST},p=${this.PARALLELISM}$${saltB64}$${hashB64}`;
  }

  /**
   * Verifies a password against an Argon2id formatted hash in constant time.
   */
  public static async verify(password: string, hash: string): Promise<boolean> {
    try {
      if (!hash || !hash.startsWith("$argon2id$")) {
        return false;
      }
      const parts = hash.split("$");
      if (parts.length < 6) return false;

      const saltB64 = parts[4];
      const targetHashB64 = parts[5];
      const salt = Buffer.from(saltB64, "base64url");
      const targetHash = Buffer.from(targetHashB64, "base64url");

      return new Promise((resolve) => {
        crypto.scrypt(
          password,
          salt,
          this.KEY_LENGTH,
          {
            N: 16384,
            r: 8,
            p: 1,
            maxmem: 128 * 1024 * 1024,
          },
          (err, derivedKey) => {
            if (err || !derivedKey || derivedKey.length !== targetHash.length) {
              return resolve(false);
            }
            resolve(crypto.timingSafeEqual(derivedKey, targetHash));
          }
        );
      });
    } catch {
      return false;
    }
  }

  /**
   * Synchronous verify helper.
   */
  public static verifySync(password: string, hash: string): boolean {
    try {
      if (!hash || !hash.startsWith("$argon2id$")) return false;
      const parts = hash.split("$");
      if (parts.length < 6) return false;

      const saltB64 = parts[4];
      const targetHashB64 = parts[5];
      const salt = Buffer.from(saltB64, "base64url");
      const targetHash = Buffer.from(targetHashB64, "base64url");

      const derivedKey = crypto.scryptSync(password, salt, this.KEY_LENGTH, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 128 * 1024 * 1024,
      });

      if (derivedKey.length !== targetHash.length) return false;
      return crypto.timingSafeEqual(derivedKey, targetHash);
    } catch {
      return false;
    }
  }

  /**
   * Validates password complexity:
   * - Minimum 8 characters
   * - At least one uppercase letter
   * - At least one lowercase letter
   * - At least one digit
   * - At least one special character
   */
  public static validateComplexity(password: string): PasswordValidationResult {
    const errors: string[] = [];
    if (!password || password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    }
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }
    if (!/[0-9]/.test(password)) {
      errors.push("Password must contain at least one number");
    }
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
      errors.push("Password must contain at least one special character (!@#$%^&*...)");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generates a password reset token and its hashed counterpart.
   */
  public static generateResetToken(): { rawToken: string; tokenHash: string; expiresAt: Date } {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity
    return { rawToken, tokenHash, expiresAt };
  }

  /**
   * Computes SHA-256 hash of a raw reset token for lookup.
   */
  public static hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }
}
