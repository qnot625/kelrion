import path from "node:path";

export class InputSanitizer {
  /**
   * Sanitizes text to prevent Cross-Site Scripting (XSS) attacks.
   */
  public static sanitizeHtml(input: string): string {
    if (typeof input !== "string") return input;
    return input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
      .replace(/javascript:/gi, "")
      .replace(/onerror=/gi, "")
      .replace(/onload=/gi, "");
  }

  /**
   * Sanitizes deep objects recursively for API input payload security.
   */
  public static sanitizeObject<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return this.sanitizeHtml(obj) as unknown as T;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item)) as unknown as T;
    }
    if (typeof obj === "object") {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Prevent prototype pollution attacks
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized as unknown as T;
    }
    return obj;
  }

  /**
   * Prevents SQL Injection by escaping single quotes, backslashes, and semicolon control sequences.
   */
  public static sanitizeSqlInput(input: string): string {
    if (typeof input !== "string") return input;
    return input
      .replace(/'/g, "''")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "")
      .replace(/--/g, "")
      .replace(/\/\*/g, "")
      .replace(/\*\//g, "");
  }

  /**
   * Validates and sanitizes file paths to prevent Path Traversal attacks.
   */
  public static sanitizeFilePath(basePath: string, userPath: string): string {
    // Remove null bytes
    const cleanUserPath = userPath.replace(/\0/g, "");
    const normalized = path.normalize(cleanUserPath);
    const resolvedPath = path.resolve(basePath, normalized);

    // Enforce that resolvedPath stays within basePath
    const resolvedBase = path.resolve(basePath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error("Path traversal attempt detected");
    }

    return resolvedPath;
  }

  /**
   * Validates target URLs to prevent Server-Side Request Forgery (SSRF) attacks.
   */
  public static validateUrlForSsrf(urlStr: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(urlStr);

      // Protocol allowlist
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return { valid: false, error: `Disallowed protocol '${parsed.protocol}'` };
      }

      const hostname = parsed.hostname.toLowerCase();

      // Block local/private IP addresses & cloud metadata services
      const blockedHostnames = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "169.254.169.254", // AWS/GCP Metadata Service
        "metadata.google.internal",
      ];

      if (blockedHostnames.includes(hostname)) {
        return { valid: false, error: `Access to restricted local/metadata address '${hostname}' is prohibited` };
      }

      // Block private IP ranges
      if (
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        /^192\.168\./.test(hostname)
      ) {
        return { valid: false, error: `Access to private IP range '${hostname}' is prohibited` };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: "Invalid URL format" };
    }
  }
}
