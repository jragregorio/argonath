/** Shared hover/focus pad for homepage header icon + text controls. */
export const homeHeaderNavInteractiveClassName =
  "inline-flex shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-sm text-muted-foreground no-underline transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Theme toggle — square hit target. */
export const homeHeaderNavToggleClassName = `${homeHeaderNavInteractiveClassName} h-9 w-9`;

/** Sign in — same chrome as toggle, text width. */
export const homeHeaderSignInClassName = `${homeHeaderNavInteractiveClassName} h-9 px-3 sm:px-4`;

/** Primary CTA — matched height / centerline with toggle + Sign in. */
export const homeHeaderCtaClassName =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground no-underline transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Right-side header action cluster. */
export const homeHeaderActionsClassName = "flex items-center gap-1.5 sm:gap-2";
