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

## Decision

1. **Separate version lines.** The Windows agent version is owned solely by
   `apps/agent/Directory.Build.props` (`$(Version)` → `AssemblyVersion` /
   `FileVersion` / MSI `ProductVersion`). Web and `packages/*` versions live in
   their own `package.json` files and must never be edited as part of an agent
   release (and vice versa).
2. **Monotonic forever.** Agent versions only increase (continue the existing
   `0.5.x` series). Do not reset, restart at `1.0.0` for decoupling, or reuse a
   lower number — downgrades are blocked by the MSI and field agents already
   compare versions on heartbeat.
3. **No hand-maintained agent version literals.** Runtime code reads
   `AgentVersionInfo.Current` from the assembly. Request DTOs leave
   `AgentVersion` empty until the API client fills it from that property.

## Consequences

- Agent release checklist: bump only `apps/agent/Directory.Build.props`, build
  MSI, ship SHA-256 — leave `apps/web/package.json` alone.
- Web release checklist: bump web/packages only — leave
  `Directory.Build.props` alone.
- Contributors see the ownership split in `AGENTS.md` and `apps/agent/AGENTS.md`.

## Alternatives considered

- Keep a single shared version across the monorepo — rejected: coupling caused
  accidental desync and forced unnecessary dual bumps.
- Reset agent numbering (e.g. `1.0.0`) when decoupling — rejected: breaks
  monotonic compare for installed agents and MSI downgrade protection.
