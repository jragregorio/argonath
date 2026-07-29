/**
 * In-process cache for Supabase storage signed URLs.
 * Warm Vercel instances reuse entries across snapshot.list polls so we
 * avoid re-signing every ready thumb on every request.
 */
const SIGNED_URL_TTL_SECONDS = 3600;
/** Refresh a bit before expiry so the client never gets a nearly-dead URL. */
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CacheEntry = {
  url: string;
  expiresAtMs: number;
};

const cache = new Map<string, CacheEntry>();

export async function getCachedSignedSnapshotUrl(
  storageKey: string,
  createSignedUrl: () => Promise<string | null>
): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(storageKey);
  if (hit && hit.expiresAtMs - REFRESH_BUFFER_MS > now) {
    return hit.url;
  }

  const url = await createSignedUrl();
  if (!url) {
    cache.delete(storageKey);
    return null;
  }

  cache.set(storageKey, {
    url,
    expiresAtMs: now + SIGNED_URL_TTL_SECONDS * 1000,
  });
  return url;
}

export function invalidateSignedSnapshotUrl(storageKey: string) {
  cache.delete(storageKey);
}
