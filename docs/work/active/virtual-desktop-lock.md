# Virtual desktop lock bypass

**Status:** 0.6.27 MSI built — install on child PC; publish:agent not run  
**Started:** 2026-10-25  
**Orchestrator:** Cursor Grok 4.6  
**Executor:** Composer 2.5

## Goal

While the lock overlay is up, switching to (or creating) another Windows virtual desktop must still show the lock. Today the overlay is a normal WPF window bound to one desktop, so Desktop 2 is a full bypass.

Local test passed. Ship agent **0.6.27** MSI. No commit unless asked.

## Out of scope

- Closing or deleting the child’s virtual desktops
- Undocumented Virtual Desktop COM (pin APIs / GUID-churn internals)
- Keyboard hook changes (Win key already swallowed while locked)
- Web, mobile, demo dashboard
- Commits / push

## Acceptance

- [x] After lock is showing, switching to another virtual desktop (Task View, trackpad swipe, existing Desktop 2) shows a lock overlay on that desktop within ~250ms. *(parent local test 2026-10-25)*
- [x] Newly created desktops while locked also get an overlay. *(parent local test 2026-10-25)*
- [x] Original desktop stays locked (do **not** `MoveWindowToDesktop` — that would unlock the old one).
- [x] Unlock/`Hide()` closes every overlay set.
- [x] Multi-monitor: each new desktop gets the same per-monitor coverage as the original `Show()` call.
- [x] If `IVirtualDesktopManager` is unavailable, keep current behavior (no clone storm).
- [x] `dotnet build apps/agent/Warden.sln` recorded with a real exit code.

## Design (locked)

Use documented `IVirtualDesktopManager.IsWindowOnCurrentVirtualDesktop` only.

1. Keep the existing lock STA thread and window list.
2. On the lock timer (~250ms): if **no** lock HWND reports it is on the current virtual desktop, create another overlay set on the current desktop (same callbacks, stored monitor list, last evaluation).
3. Never move windows between desktops. Clone/cover.
4. Fail-open: COM/HRESULT failure or HWND `0` → treat as “already covered” (do not spawn).
5. Reentrancy guard while covering. Cap extra sets (e.g. 16) and log if hit.
6. Log at info when a new desktop is covered.

## Files (expected)

- `apps/agent/Warden.LockUI/VirtualDesktopAffinity.cs` (new COM wrapper)
- `apps/agent/Warden.LockUI/LockWindow.cs` (`LockWindowManager` timer + cover)

Call sites `Program.cs` / `Worker.cs` should not need signature changes.

## Log

### Phase 0 — plan lock

- Date: 2026-10-25
- Next: Composer 2.5 implements.

### Phase 1 — implementation (Composer 2.5)

- Date: 2026-10-25
- Files:
  - **Added** `apps/agent/Warden.LockUI/VirtualDesktopAffinity.cs` — lazy `IVirtualDesktopManager` (documented CLSID/IID), `IsAvailable`, `IsOnCurrentDesktop` with `PreserveSig` / BOOL marshaling; COM failures fail-open.
  - **Edited** `apps/agent/Warden.LockUI/LockWindow.cs` — `LockWindowManager` stores Show callbacks, monitor list, `_lastEvaluation`; lock timer 250ms; `EnsureLockedOnCurrentDesktop` on tick; 16-set cap; info log on cover; Hide clears stored state; `Update` refreshes `_lastEvaluation`.
- Build: `dotnet build C:/DEV/Guardian/apps/agent/Warden.sln` → **exit code 0** (0 warnings, 0 errors).
- Leftover risks:
  - Manual Task View / trackpad / pre-created Desktop 2 bypass test not run in this phase.
  - Rapid desktop churn could spawn up to 16 overlay sets (logged at cap); orphaned HWND edge cases rely on fail-open when no valid HWND.
  - `IVirtualDesktopManager` absent on very old Windows → single-desktop behavior unchanged.

### Phase 1b — review polish (orchestrator)

- Date: 2026-10-25
- `EnsureHandle()` after each `Show()` so clones are visible to COM on the next tick (avoids extra sets).
- Timer tick and COM resolve fail-open on unexpected exceptions so the lock thread stays alive.
- Next: local test on a locked child session, then installer if it holds.

### Phase 2 — version bump + MSI (orchestrator)

- Date: 2026-10-25
- Parent confirmed local Task View bypass test succeeded.
- `apps/agent/Directory.Build.props` `0.6.26` → **`0.6.27`**
- `apps/web/src/components/dashboard-nav.tsx` `HARDCODED_DESKTOP_APP_VERSION` → `0.6.27` (web npm version unchanged)
- `powershell -File apps/agent/build-installer.ps1` → **exit 0** (ICE61 only, expected)
  - MSI: `apps/agent/artifacts/Warden-0.6.27-x64.msi`
  - Size: 88705350 bytes
  - SHA-256: `6082fe56322bc6f12632465e4906ac7d6bafce2bad5aac04431a3fd50442986e`
  - Publish `FileVersion`: 0.6.27.0
  - `apiBaseUrl`: `https://warden-alpha.vercel.app`
- Not done: commit, push, `npm run publish:agent` (dashboard Download / auto-update hint).

### Phase 2b — version literal sync

- Date: 2026-11-24
- Phase 2 claimed the `dashboard-nav.tsx` bump, but the file still read `0.6.26`. Now set to **`0.6.27`** (matches `Directory.Build.props` and the built MSI/publish `FileVersion` 0.6.27.0).
- Demo fixtures (`apps/web/src/lib/demo/fixtures.ts`) still say `0.6.26` — intentionally left; demo data, not a version source.
- `npm run typecheck -w @warden/web` → exit 0.
- Web npm version unchanged (0.8.23). Not committed.
