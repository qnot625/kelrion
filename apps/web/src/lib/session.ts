export type SessionMode = "live" | "demo";

export type ModuleKey =
  | "branches"
  | "appointments"
  | "queue"
  | "notifications"
  | "employees"
  | "attendance"
  | "leave"
  | "lifecycle"
  | "forms"
  | "workflow"
  | "approvals"
  | "service-desk"
  | "cases"
  | "analytics"
  | "recruitment";

export interface KlerionSession {
  readonly mode: SessionMode;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly email: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly enabledModules: readonly ModuleKey[];
  readonly token?: string;
}

const STORAGE_KEY = "klerion.session.v2";

export function loadSession(): KlerionSession | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<KlerionSession>;
    if (
      (parsed.mode !== "live" && parsed.mode !== "demo") ||
      typeof parsed.tenantSlug !== "string" ||
      typeof parsed.tenantName !== "string" ||
      typeof parsed.email !== "string" ||
      typeof parsed.userId !== "string" ||
      !Array.isArray(parsed.roles) ||
      !Array.isArray(parsed.enabledModules)
    ) return null;
    return parsed as KlerionSession;
  } catch {
    return null;
  }
}

export function saveSession(session: KlerionSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("klerion.session.v1");
}

export function decodeTokenRoles(token: string): string[] {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return [];
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized)) as { roles?: unknown };
    return Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is string => typeof role === "string")
      : [];
  } catch {
    return [];
  }
}

export function displayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] ?? "Administrator";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
