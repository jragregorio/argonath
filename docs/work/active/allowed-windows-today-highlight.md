# Allowed windows — today highlight

## Goal

Highlight the current day card in Allowed windows so parents can find today faster. Works in both dashboard themes (Maiev dark + Blackberry light).

## Acceptance

- [x] Current day card has a clear highlight border
- [x] Day is computed in family timezone when available (ISO 1=Mon … 7=Sun)
- [x] Applies in dialog and inline editor usages
- [x] Maiev → gold; Blackberry → primary green; single outline (no ring)

## Changes

### `apps/web/src/components/allowed-windows-editor.tsx`
- `todayDay` via `getZonedTimeParts` + optional `timeZone` prop
- Today: class `allowed-windows-day-today` (no default `border-border`)
- Non-today: `border border-border/70`
- `aria-current="date"` + subtle `Today` label

### `apps/web/src/app/globals.css`
Today highlight CSS lives **after** `* { border-color: var(--color-border) }`:

```css
.allowed-windows-day-today {
  border-width: 3px !important;
  border-style: solid !important;
  border-color: #c5a059 !important; /* Maiev gold / --color-brand */
}
html[data-dashboard-theme="blackberry"] .allowed-windows-day-today {
  border-color: #148057 !important; /* Blackberry --color-primary */
}
```

### Call sites
- Dialog + child policy section pass `family?.timezone`

## Investigation (why prior fix looked worse)

1. TSX correctly applied `allowed-windows-day-today` and removed the default border → today looked borderless when CSS failed to paint.
2. Custom rule used `var(--color-brand)` and sat *before* the global `* { border-color }` reset in source; compiled CSS kept that order.
3. Tailwind never emitted a `.border-brand` utility (only `.border-primary*`), so earlier utility-based attempts silently failed for gold.
4. Fix: explicit hex + `!important`, rule placed after the universal border-color reset.

## Release

- Web/shared bumped **0.8.12 → 0.8.13**

## Archive when

Deployed and confirmed on production.
