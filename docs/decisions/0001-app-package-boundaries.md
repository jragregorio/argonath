# ADR-0001: Keep existing apps/packages layout

## Status

Accepted

## Date

2026-07-29

## Context

A repository restructure audit evaluated whether applications and packages should be moved for clearer boundaries.

Verified facts:

- `apps/web` and `apps/agent` are independently deployable.
- `packages/{api,db,shared,ui}` are reusable with an acyclic graph.
- No packages→apps imports; Prisma owned only by `@warden/db`.
- `apps/web/vercel.json` assumes `apps/web` is two levels below the repo root.

## Decision

Do **not** move application or package directories. Document and enforce the existing structure; fix missing AI docs, ignore rules, lint config, and boundary checks instead.

## Consequences

- Lower risk of breaking Vercel, .NET paths, and imports.
- Restructuring work focuses on guardrails and hygiene, not file moves.
- One doc move (`DEV-TESTING.md` → `docs/development/local-testing.md`) is allowed.

## Alternatives considered

- Relocating packages under different names for visual symmetry — rejected (no deploy/boundary gain; renames out of scope).
- Splitting agent into a top-level `apps/tray` — rejected (breaks documented `cd apps/agent` workflows without benefit).
