# Mobile: enlarge Nudge compose sheet

**Status:** ready for owner visual test (second type bump)

## Locked — second pass (2026-09-12)

Owner: still too small. Bump again; desktop Modal unchanged.

| Piece | Mobile | Desktop |
|--------|--------|---------|
| Title | `text-xl` | Modal unchanged |
| Subtitle | keep `text-base leading-relaxed` | — |
| Message label | `text-lg md:text-sm` | md:text-sm |
| Input | `min-h-14 text-lg md:h-10 md:min-h-10 md:text-sm` | h-10 text-sm |
| Hint | `text-base md:text-xs` | text-xs |
| Preset chips | `min-h-12 px-3 py-2 text-base md:min-h-0 md:px-2.5 md:py-1.5 md:text-xs` | small |
| Send / Cancel | `text-lg` (mobileFooter only) | desktopFooter unchanged |

Mobile-first `text-lg md:text-sm` — not `max-md:` vs `text-sm`.

## Goal

Match ConfirmDialog / policy glance type on the **Nudge with a message** bottom sheet. Desktop Modal unchanged. No bump/push until asked.

## Locked

| Piece | Mobile | Desktop |
|--------|--------|---------|
| Title | `titleClassName="text-lg"` | Modal unchanged |
| Subtitle | `descriptionClassName="text-base leading-relaxed"` (add prop on BottomSheet, default stays `text-xs`) | Modal unchanged |
| Message label | `text-base md:text-sm` | `md:text-sm` |
| Input | `min-h-12 text-base md:h-10 md:min-h-10 md:text-sm` | keep h-10 |
| Hint | `text-sm md:text-xs` | text-xs |
| Preset chips | `min-h-11 px-3 text-sm md:min-h-0 md:px-2.5 md:py-1.5 md:text-xs` | keep small |
| Footer | Split: mobile Cancel + Send use `text-base`; desktop footer unchanged | |

Use mobile-first `text-base md:text-sm` (not `max-md:text-base` vs `text-sm`).

## Files

- `apps/web/src/components/ui/bottom-sheet.tsx` — optional `descriptionClassName`
- `apps/web/src/components/nudge-controls.tsx` — sheet props, form sizes, split footers

## Acceptance

- [ ] Phone: larger title, subtitle, field, chips, Send/Cancel (owner visual test)
- [ ] Desktop nudge modal still compact (owner visual test)
- [x] `npm run typecheck -w @warden/web` exit 0

## Phase log

### 2026-09-12 — Implement

**Changes:**
- `bottom-sheet.tsx`: added optional `descriptionClassName`; description uses `cn("mt-0.5 text-muted-foreground", descriptionClassName ?? "text-xs")`.
- `nudge-controls.tsx`: BottomSheet gets `titleClassName="text-lg"`, `descriptionClassName="text-base leading-relaxed"`; NudgeMessageForm mobile-first type (`text-base md:text-sm`, etc.); split `desktopFooter` / `mobileFooter` (mobile Cancel/Send `text-base`, Send icon `h-5 w-5`).

**Validation:**
```bash
npm run typecheck -w @warden/web
# exit 0
```

### 2026-09-12 — Second type bump

**Changes:**
- `nudge-controls.tsx` only: BottomSheet `titleClassName="text-xl"`; NudgeMessageForm label `text-lg md:text-sm`, input `min-h-14 text-lg`, hint `text-base`, preset chips `min-h-12 text-base`; mobileFooter Cancel/Send `text-lg` (Bell stays `h-5 w-5`). Desktop Modal/footer unchanged.

**Validation:**
```bash
npm run typecheck -w @warden/web
# exit 0
```

## Next step

Owner local visual test of Nudge with a message sheet (phone + desktop).
