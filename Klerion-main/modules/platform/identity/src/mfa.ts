import crypto from "node:crypto";

export class MfaService {
  /**
   * Base32 character set per RFC 4648.
   */
  private static readonly BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

  /**
   * Generates a random Base32 TOTP Secret key (16 characters / 80 bits).
   */
  public static generateSecret(): string {
    const buffer = crypto.randomBytes(10);
    let secret = "";
    for (let i = 0; i < buffer.length; i++) {
      const val = buffer[i];
      secret += this.BASE32_CHARS[val % 32];
    }
    return secret;
  }

  /**
   * Generates a standard OTPAuth URI for QR code generation or authenticator apps.
   */
  public static generateOtpauthUrl(label: string, secret: string, issuer: string = "KlerionAdminOps"): string {
    const encodedLabel = encodeURIComponent(label);
    const encodedIssuer = encodeURIComponent(issuer);
    return `otpauth://totp/${encodedIssuer}:${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
  }

  /**
   * Verifies a 6-digit TOTP code against a Base32 secret at current time (allowing +/- 1 window drift).
   */
  public static verifyCode(secret: string, code: string, window: number = 1): boolean {
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) return false;

    const currentStep = Math.floor(Date.now() / 1000 / 30);

    for (let i = -window; i <= window; i++) {
      const step = currentStep + i;
      const generatedCode = this.generateTotpCode(secret, step);
      if (crypto.timingSafeEqual(Buffer.from(generatedCode), Buffer.from(code))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generates a 6-digit TOTP code for a specific time step.
   */
  private static generateTotpCode(secret: string, timeStep: number): string {
    const key = this.base32ToBuffer(secret);
    const msg = Buffer.alloc(8);
    for (let i = 7; i >= 0; i--) {
      msg[i] = timeStep & 0xff;
      timeStep = timeStep >> 8;
    }

    const hmac = crypto.createHmac("sha1", key).update(msg).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = binary % 1000000;
    return otp.toString().padStart(6, "0");
  }

  /**
   * Decodes Base32 string into Buffer.
   */
  private static base32ToBuffer(base32: string): Buffer {
    const cleaned = base32.toUpperCase().replace(/=/g, "");
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < cleaned.length; i++) {
      const index = this.BASE32_CHARS.indexOf(cleaned[i]);
      if (index === -1) continue;
      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }
}
