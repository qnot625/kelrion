import crypto from "node:crypto";

export interface FileUploadValidationOptions {
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
}

export interface ValidationResult {
  valid: boolean;
  sanitizedFilename: string;
  mimeType: string;
  sizeBytes: number;
  hashSha256: string;
  error?: string;
}

export interface VirusScanner {
  scanBuffer(buffer: Buffer): Promise<{ isInfected: boolean; virusName?: string }>;
}

export class MockVirusScanner implements VirusScanner {
  public async scanBuffer(buffer: Buffer): Promise<{ isInfected: boolean; virusName?: string }> {
    // Check for EICAR anti-virus test string
    const eicarSignature = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    if (buffer.toString("utf8").includes(eicarSignature)) {
      return { isInfected: true, virusName: "EICAR-Test-Signature" };
    }
    return { isInfected: false };
  }
}

export class FileSecurityValidator {
  public static readonly DEFAULT_ALLOWED_MIME_TYPES = [
    "image/png",
    "image/jpeg",
    "application/pdf",
    "text/plain",
    "application/json",
  ];

  public static readonly DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  private static virusScanner: VirusScanner = new MockVirusScanner();

  public static setVirusScanner(scanner: VirusScanner): void {
    this.virusScanner = scanner;
  }

  /**
   * Validates a file upload buffer for size, MIME type, magic bytes, safe filename, and virus signature.
   */
  public static async validateFileUpload(
    filename: string,
    mimeType: string,
    buffer: Buffer,
    options?: FileUploadValidationOptions
  ): Promise<ValidationResult> {
    const allowedMimeTypes = options?.allowedMimeTypes || this.DEFAULT_ALLOWED_MIME_TYPES;
    const maxSizeBytes = options?.maxSizeBytes || this.DEFAULT_MAX_SIZE_BYTES;

    // 1. Sanitize filename
    const sanitizedFilename = this.sanitizeFilename(filename);

    // 2. Validate file size
    if (!buffer || buffer.length === 0) {
      return { valid: false, sanitizedFilename, mimeType, sizeBytes: 0, hashSha256: "", error: "File is empty" };
    }
    if (buffer.length > maxSizeBytes) {
      return {
        valid: false,
        sanitizedFilename,
        mimeType,
        sizeBytes: buffer.length,
        hashSha256: "",
        error: `File size exceeds maximum allowed limit of ${maxSizeBytes / (1024 * 1024)}MB`,
      };
    }

    // 3. Validate MIME type
    const normMime = mimeType.toLowerCase().trim();
    if (!allowedMimeTypes.includes(normMime)) {
      return {
        valid: false,
        sanitizedFilename,
        mimeType: normMime,
        sizeBytes: buffer.length,
        hashSha256: "",
        error: `MIME type '${normMime}' is not permitted`,
      };
    }

    // 4. Validate Magic Bytes
    const magicValid = this.validateMagicBytes(buffer, normMime);
    if (!magicValid) {
      return {
        valid: false,
        sanitizedFilename,
        mimeType: normMime,
        sizeBytes: buffer.length,
        hashSha256: "",
        error: `File header content does not match reported MIME type '${normMime}'`,
      };
    }

    // 5. Virus scanning hook
    const scanResult = await this.virusScanner.scanBuffer(buffer);
    if (scanResult.isInfected) {
      return {
        valid: false,
        sanitizedFilename,
        mimeType: normMime,
        sizeBytes: buffer.length,
        hashSha256: "",
        error: `File virus check failed: infected with ${scanResult.virusName}`,
      };
    }

    // 6. Compute SHA-256 digest
    const hashSha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    return {
      valid: true,
      sanitizedFilename,
      mimeType: normMime,
      sizeBytes: buffer.length,
      hashSha256,
    };
  }

  /**
   * Sanitizes filenames to strip dangerous characters, path separators, and null bytes.
   */
  public static sanitizeFilename(filename: string): string {
    if (!filename) return `file_${Date.now()}`;
    const cleaned = filename
      .replace(/\0/g, "")
      .replace(/[\/\\]/g, "_")
      .replace(/[^a-zA-Z0-9._\-]/g, "_")
      .replace(/\.{2,}/g, "."); // Prevent double dot extensions
    return cleaned.substring(0, 255);
  }

  /**
   * Verifies file headers against reported MIME type.
   */
  private static validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
    if (mimeType === "text/plain" || mimeType === "application/json") {
      // Text files don't have binary magic bytes
      return true;
    }

    if (mimeType === "image/png") {
      // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
      return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    }

    if (mimeType === "image/jpeg") {
      // JPEG magic bytes: FF D8 FF
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    if (mimeType === "application/pdf") {
      // PDF magic bytes: %PDF (25 50 44 46)
      return buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
    }

    return true;
  }
}
