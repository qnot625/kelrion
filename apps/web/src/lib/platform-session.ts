export interface PlatformSession {
  readonly adminId: string;
  readonly email: string;
  readonly token: string;
}

const STORAGE_KEY = "klerion.platform.session.v1";

export function loadPlatformSession(): PlatformSession | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<PlatformSession> | null;
    return parsed && typeof parsed.adminId === "string" && typeof parsed.email === "string" && typeof parsed.token === "string"
      ? parsed as PlatformSession
      : null;
  } catch {
    return null;
  }
}

export function savePlatformSession(session: PlatformSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearPlatformSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
