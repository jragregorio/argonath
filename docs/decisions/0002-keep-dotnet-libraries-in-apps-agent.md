# ADR-0002: Keep .NET libraries under `apps/agent`

## Status

Accepted

## Date

2026-07-29

## Context

`Warden.Core` and `Warden.LockUI` are libraries used only by `Warden.Tray` and `Warden.Agent`. A visual monorepo convention might place them under `packages/`.

## Decision

Keep `Warden.Core` and `Warden.LockUI` inside `apps/agent` next to the solution and executables.

## Consequences

- Sibling `ProjectReference` paths and `Warden.sln` stay valid.
- npm workspaces do not attempt to treat .NET projects as packages.
- Document clearly that `packages/` is JS/TS only.

## Alternatives considered

- Move Core/LockUI to `packages/warden-core` style folders — rejected: breaks solution paths, README publish instructions, and confuses workspace globs for no reuse outside the agent.
