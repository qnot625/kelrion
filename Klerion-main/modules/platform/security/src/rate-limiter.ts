export interface RateLimitStatus {
  allowed: boolean;
  currentRequests: number;
  remaining: number;
  resetTimeMs: number;
}

export class RateLimiter {
  private static requests: Map<string, number[]> = new Map();

  /**
   * Evaluates rate limit for a given key (e.g., IP address, user ID, tenant ID).
   * @param key Unique identifier for rate limiting bucket
   * @param maxRequests Maximum allowed requests in window
   * @param windowMs Window size in milliseconds
   */
  public static checkRateLimit(
    key: string,
    maxRequests: number = 100,
    windowMs: number = 60 * 1000
  ): RateLimitStatus {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.requests.get(key) || [];
    // Filter timestamps within current window
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= maxRequests) {
      const oldestInWindow = timestamps[0];
      const resetTimeMs = oldestInWindow + windowMs - now;
      this.requests.set(key, timestamps);
      return {
        allowed: false,
        currentRequests: timestamps.length,
        remaining: 0,
        resetTimeMs: Math.max(resetTimeMs, 0),
      };
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);

    return {
      allowed: true,
      currentRequests: timestamps.length,
      remaining: maxRequests - timestamps.length,
      resetTimeMs: windowMs,
    };
  }

  /**
   * Clears rate limit store (useful for test resets).
   */
  public static clear(): void {
    this.requests.clear();
  }
}
