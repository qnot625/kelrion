import crypto from "node:crypto";

export class EncryptionService {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly IV_LENGTH = 12; // 96 bits for GCM
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly SECRET_KEY = Buffer.from(
    (process.env.ENCRYPTION_KEY || "klerion_adminops_master_key_32b_2026!").padEnd(32, "0").substring(0, 32)
  );

  /**
   * Encrypts plain text using AES-256-GCM with authenticated tag.
   */
  public static encrypt(plainText: string, customKey?: Buffer): string {
    const key = customKey || this.SECRET_KEY;
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, { authTagLength: this.AUTH_TAG_LENGTH });

    let encrypted = cipher.update(plainText, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    // Format: iv_b64:authTag_b64:encrypted_b64
    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
  }

  /**
   * Decrypts AES-256-GCM encrypted payload and verifies authenticity.
   */
  public static decrypt(cipherText: string, customKey?: Buffer): string {
    const key = customKey || this.SECRET_KEY;
    const parts = cipherText.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid cipher text format");
    }

    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encryptedText = parts[2];

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, { authTagLength: this.AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Generates SHA-256 HMAC signature for data integrity.
   */
  public static generateHmac(data: string, secret?: string): string {
    const hmacKey = secret || this.SECRET_KEY.toString("hex");
    return crypto.createHmac("sha256", hmacKey).update(data).digest("hex");
  }
}
