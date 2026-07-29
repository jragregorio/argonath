/**
 * In-process cache for Supabase storage signed URLs.
 * Warm Vercel instances reuse entries across snapshot.list polls so we
 * avoid re-signing every ready thumb on every request.
 *
 * Also tracks "missing" keys so we do not keep POSTing createSignedUrl
 * for objects that are gone from the bucket (orphan ready rows).
 */
const SIGNED_URL_TTL_SECONDS = 3600;
/** Refresh a bit before expiry so the client never gets a nearly-dead URL. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
/** How long to skip re-signing after we learn an object is missing. */
const MISSING_TTL_MS = 30 * 60 * 1000;

type CacheEntry =
  | { kind: "url"; url: string; expiresAtMs: number }
  | { kind: "missing"; expiresAtMs: number };

const cache = new Map<string, CacheEntry>();

export function isMissingStorageObjectError(
  error: { message?: string; statusCode?: string | number } | null | undefined
): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  const code = String(error.statusCode ?? "");
  if (code === "404") return true;
  return (
    msg.includes("object not found") ||
    msg.includes("not found") ||
    msg.includes("does not exist")
  );
}

export async function getCachedSignedSnapshotUrl(
  storageKey: string,
  createSignedUrl: () => Promise<string | null>
): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(storageKey);
  if (hit) {
    if (hit.kind === "missing" && hit.expiresAtMs > now) {
      return null;
    }
    if (hit.kind === "url" && hit.expiresAtMs - REFRESH_BUFFER_MS > now) {
      return hit.url;
    }
  }

  const url = await createSignedUrl();
  if (!url) {
    cache.delete(storageKey);
    return null;
  }

  cache.set(storageKey, {
    kind: "url",
    url,
    expiresAtMs: now + SIGNED_URL_TTL_SECONDS * 1000,
  });
  return url;
}

/** Remember that this key has no object so list polls stop re-signing it. */
export function markSignedSnapshotUrlMissing(storageKey: string) {
  cache.set(storageKey, {
    kind: "missing",
    expiresAtMs: Date.now() + MISSING_TTL_MS,
  });
}

export function invalidateSignedSnapshotUrl(storageKey: string) {
  cache.delete(storageKey);
}
