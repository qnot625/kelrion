const UNIQUE_VIOLATION = "23505";

/** Drizzle wraps driver errors, so the Postgres code can sit on `cause`. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current === "object" && "code" in current && current.code === UNIQUE_VIOLATION) {
      return true;
    }
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
  return false;
}
