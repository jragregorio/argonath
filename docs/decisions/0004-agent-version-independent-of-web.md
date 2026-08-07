# ADR-0004: Agent version independent of web/packages

## Status

Accepted

## Date

2026-07-31

## Context

`apps/web/package.json` and `apps/agent/Directory.Build.props` historically shared
the same `0.5.x` numbers. Web commits often bump “the product version” for
dashboard releases; agent MSI releases bump for child-PC installs. Those lines
agreed only by coincidence — one extra web commit would desync them while the
MSI / heartbeat update check (`compareAgentVersions`) still needs a strict
monotonic agent version for machines already in the field (e.g. 0.5.14+).

Hardcoded literals in `AgentVersionInfo.Fallback` and `AgentModels` defaults also
rotted whenever `Directory.Build.props` was bumped by hand.

Patch numbers later drifted past `.9` (e.g. web `0.5.23`, agent `0.5.18`). A
short-lived product rule (2026-08-02) required base-10 carry so each component
stayed in `0–9`. That conflicted with [Semantic Versioning 2.0.0](https://semver.org/)
and with npm / MSI tooling expectations, so it was reversed on 2026-08-06 in
favor of full SemVer.

## Decision

1. **Separate version lines.** The Windows agent version is owned solely by
   `apps/agent/Directory.Build.props` (`$(Version)` → `AssemblyVersion` /
   `FileVersion` / MSI `ProductVersion`). Web and `packages/*` versions live in
   their own `package.json` files and must never be edited as part of an agent
   release (and vice versa). The Android shell (`apps/mobile/package.json`) is a
   third independent line.
2. **Monotonic forever.** Agent versions only increase. Do not reset, restart at
   a lower number for decoupling, or reuse a prior version — downgrades are
   blocked by the MSI and field agents already compare versions on heartbeat.
3. **Semantic Versioning 2.0.0 (all lines).** Versions follow
   [SemVer 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH` with optional
   prerelease / build metadata. Numeric components have **no single-digit cap**
   (`0.8.9` → `0.8.10` is valid). Routine releases increment `PATCH`; bump
   `MINOR` / `MAJOR` only when intentionally signaling a larger change (resetting
   lower components per SemVer). The former base-10 carry rule is **superseded**.
4. **No hand-maintained agent version literals.** Runtime code reads
   `AgentVersionInfo.Current` from the assembly. Request DTOs leave
   `AgentVersion` empty until the API client fills it from that property.

## Consequences

- Agent release checklist: bump only `apps/agent/Directory.Build.props` (SemVer),
  build MSI, ship SHA-256 — leave `apps/web/package.json` alone.
- Web release checklist: bump web/`packages/shared` (+ `APP_VERSION`) only
  (SemVer) — leave `Directory.Build.props` alone.
- Mobile shell checklist: bump `apps/mobile/package.json` only when the native
  shell changes.
- Contributors see the ownership split and SemVer rule in `AGENTS.md` and
  `apps/agent/AGENTS.md`.
- Version compare (`compareAgentVersions`) and npm both treat `0.5.10` as newer
  than `0.5.9`, matching SemVer precedence.

## Alternatives considered

- Keep a single shared version across the monorepo — rejected: coupling caused
  accidental desync and forced unnecessary dual bumps.
- Reset agent numbering (e.g. `1.0.0`) when decoupling — rejected: breaks
  monotonic compare for installed agents and MSI downgrade protection.
- Base-10 carry (`0.5.9` → `0.6.0`, never `*.*.10+`) — adopted 2026-08-02,
  **superseded 2026-08-06** in favor of full SemVer for tooling compatibility
  and simpler mental model.
- Letter micro-bumps (`0.8.0a` … `0.8.0g`) — rejected: not SemVer; npm treats
  letter suffixes as prereleases that sort *before* the plain release.
