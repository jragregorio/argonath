/** Fired when a modal / bottom sheet opens so toasts can clear and not cover CTAs. */
export const BLOCKING_OVERLAY_EVENT = "warden:blocking-overlay";

let openCount = 0;

export function isBlockingOverlayOpen() {
  return openCount > 0;
}

export function notifyBlockingOverlayOpen() {
  openCount += 1;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(BLOCKING_OVERLAY_EVENT));
}

export function notifyBlockingOverlayClose() {
  openCount = Math.max(0, openCount - 1);
}
