const PENDING_KEY = "warden_pending_push_path";

export function storePendingPushPath(path: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, path);
  } catch {
    // private mode / quota
  }
}

export function consumePendingPushPath(): string | null {
  try {
    const path = sessionStorage.getItem(PENDING_KEY);
    if (path) {
      sessionStorage.removeItem(PENDING_KEY);
      return path;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Capacitor FCM data values are strings; payload shape varies by event. */
export function extractPathFromPushPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;

  const fromData = (data: unknown): string | null => {
    if (!data || typeof data !== "object") return null;
    const path = (data as Record<string, unknown>).path;
    return typeof path === "string" && path.length > 0 ? path : null;
  };

  const notification = root.notification;
  if (notification && typeof notification === "object") {
    const nested = fromData((notification as Record<string, unknown>).data);
    if (nested) return nested;
  }

  return fromData(root.data);
}

export function isSafeDashboardPath(path: string): boolean {
  return path.startsWith("/dashboard") && !path.startsWith("//");
}
