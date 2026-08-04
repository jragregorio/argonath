/**
 * Detect Capacitor native WebView without importing `@capacitor/core`.
 * Remote-URL shells inject `window.Capacitor`; the npm package can crash the
 * Next client bundle when loaded outside a Capacitor runtime build.
 */
export function isNativeCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}

export function getCapacitorPlugins(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const capacitor = (window as Window & {
    Capacitor?: { Plugins?: Record<string, unknown> };
  }).Capacitor;
  return capacitor?.Plugins ?? null;
}
