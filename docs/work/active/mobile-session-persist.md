# Mobile: persist login session across app relaunch

**Status:** complete (web v0.6.5 + mobile v0.1.2 — push for deploy / APK rebuild)  
**Started:** 2026-08-04  
**Completed:** 2026-08-04  
**Executor:** Composer 2.5

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Root cause to fix | Capacitor always launches `/sign-in` (public); page does not redirect when cookies are valid → looks logged out on every cold start |
| Launch URL | Change Capacitor `server.url` to **`https://warden-alpha.vercel.app/dashboard`** (middleware refreshes or redirects to sign-in) |
| Sign-in UX | If already authenticated (valid access **or** successful refresh), **`/sign-in` redirects to `next` / dashboard** |
| Refresh TTL | **Keep 30-day sliding** (`REFRESH_TOKEN_TTL_DAYS = 30`) — no TTL change |
| Native token storage | Out of scope |
| Access TTL | Keep 15 minutes — no change |

## Acceptance criteria

1. Android cold start with valid refresh cookie lands on dashboard (not an empty sign-in form).
2. Cold start with no cookies still reaches sign-in (via middleware redirect from `/dashboard`).
3. Visiting `/sign-in` while already signed in redirects to dashboard (or `?next=`).
4. No change to refresh TTL / rotation / cookie security attributes unless required for redirect.
5. Docs: update Capacitor README / ADR launch URL note if they hardcode `/sign-in`.
6. Record real validation: `npm run typecheck -w @warden/web -w @warden/mobile` (or equivalent), `npm run check:boundaries`; `npx cap sync` if config changed (note whether APK rebuild is needed — **yes** for Capacitor `server.url` change).

## Out of scope

- Extending refresh beyond 30 days
- Biometric / Preferences native credential store
- Changing access JWT from 15 minutes
- iOS

## Implementation hints

- [`apps/mobile/capacitor.config.ts`](apps/mobile/capacitor.config.ts) — `server.url` currently ends in `/sign-in`
- [`apps/web/src/middleware.ts`](apps/web/src/middleware.ts) — `/sign-in` is public; `/dashboard` already refreshes via `/api/auth/refresh`
- [`apps/web/src/app/sign-in/page.tsx`](apps/web/src/app/sign-in/page.tsx) — client form only; add server redirect or small bootstrap that checks session (prefer server component / middleware / route that does not flash the form). Clean options:
  - Middleware: if path is `/sign-in` and valid access → redirect to `next` or `/dashboard`; if only refresh cookie → same refresh redirect pattern used for protected pages
  - Or a server layout/page that reads cookies and redirects
- Prefer **middleware** so both web and Capacitor benefit without duplicating logic.
- After `capacitor.config.ts` change: `npm run build -w @warden/mobile` + `npx cap sync android` (or workspace `cap:sync`). **APK must be rebuilt** for launch URL; web deploy alone is not enough for the Capacitor config change. Sign-in redirect is web-only (Vercel deploy).

## Phase log

### Phase 0 — plan lock

- Owner: (1) yes launch `/dashboard` + signed-in redirect on `/sign-in`; (2) keep 30-day sliding refresh.

### Phase 1 — implementation (2026-08-04)

**Capacitor launch URL**
- `apps/mobile/capacitor.config.ts`: `server.url` → `https://warden-alpha.vercel.app/dashboard`

**Middleware signed-in redirect**
- `apps/web/src/middleware.ts`: `/sign-in` and `/sign-up` now redirect before page render when:
  - valid access cookie → safe `?next=` (must start with `/`) or `/dashboard`
  - refresh cookie only → GET `/api/auth/refresh?next=...` (same pattern as protected pages)
  - no cookies → show page as before
- `/api/auth/refresh` remains public; cookie security unchanged.

**Docs**
- `apps/mobile/README.md` — remote URL + launch URL note
- `docs/decisions/0005-capacitor-android-remote-url-shell.md` — decision URL
- `docs/work/active/mobile-capacitor-android.md` — server URL references

### Validation (exit codes)

| Command | Exit |
|---------|------|
| `npm run typecheck -w @warden/web` | 0 |
| `npm run typecheck -w @warden/mobile` | 0 |
| `npm run check:boundaries` | 0 |
| `npm run build -w @warden/mobile` | 0 |
| `npm run cap:sync -w @warden/mobile` | 0 |

**Deploy notes:** Web deploy required for middleware redirect. **APK rebuild required** for Capacitor `server.url` change (`assembleDebug` / reinstall).

## Files touched

- `apps/mobile/capacitor.config.ts`
- `apps/web/src/middleware.ts`
- `apps/mobile/README.md`
- `docs/decisions/0005-capacitor-android-remote-url-shell.md`
- `docs/work/active/mobile-capacitor-android.md`
- `docs/work/active/mobile-session-persist.md`

## Next steps (owner)

1. Deploy web to Vercel (middleware `/sign-in` redirect).
2. Rebuild and install debug APK (`npm run cap:sync -w @warden/mobile`, then `gradlew assembleDebug`).
3. Manual QA: cold start with valid refresh cookie → dashboard; no cookies → sign-in; visit `/sign-in` while signed in → dashboard.
