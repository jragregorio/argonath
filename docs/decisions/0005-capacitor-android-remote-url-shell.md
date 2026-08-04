# ADR-0005: Capacitor remote-URL Android shell

## Status

Accepted

## Date

2026-08-04

## Context

Parents need a native Android installable for the Warden dashboard without duplicating the Next.js UI or maintaining a separate React Native codebase. The dashboard already deploys to Vercel (`https://warden-alpha.vercel.app`) with cookie auth, tRPC, and middleware.

Options considered: static export of Next.js (rejected — breaks server features), Expo/React Native rewrite (rejected — scope), embedding a WebView pointed at production (selected).

## Decision

1. Add **`apps/mobile`** (`@warden/mobile`) as a **Capacitor 8** project with **remote URL mode**: `server.url` loads the live Vercel deployment at **`https://warden-alpha.vercel.app/dashboard`** (middleware refreshes session or redirects to sign-in); `webDir` holds only a minimal local placeholder and shell bootstrap JS.
2. **Android only** for v1; `applicationId` / `appId` **`com.warden.gard`**, display name **Warden**.
3. **Push / FCM** enabled for both debug and release builds via `@capacitor/push-notifications` + `google-services.json` (same package id). Web bootstraps registration inside the Capacitor WebView (`NativePushBootstrap`); backend send path is a follow-up.
4. **Independent version line** — `@warden/mobile` `package.json` version is not tied to `@warden/web` or the Windows agent (`ADR-0004` pattern).
5. **Boundary:** mobile must not import `apps/web` or `packages/*` sources; it is not a deployable web app and does not participate in the `@warden` API graph. Web may detect the injected Capacitor bridge at runtime (no native source imports).

## Consequences

- Dashboard content updates without a store release when Vercel deploys; store releases are needed for native shell / config / permission changes only.
- WebView must trust the Vercel origin (`allowNavigation` for production + `*.vercel.app` previews).
- Contributors need JDK 21+, Android SDK, and documented Gradle paths for debug APK / release AAB.
- FCM requires a real `android/app/google-services.json` for package `com.warden.gard` (gitignored; example provided). Without it, builds still succeed but push does not work.
- iOS can follow the same pattern later without changing the web app architecture.

## Alternatives considered

- **Next.js static export** — rejected: loses SSR, API routes, and auth middleware on-device.
- **Bundling `next build` output in the APK** — rejected: stale content and large binaries; remote URL keeps one source of truth.
- **Shared npm dependency on `@warden/shared`** — rejected for v1: unnecessary coupling for a URL shell.
