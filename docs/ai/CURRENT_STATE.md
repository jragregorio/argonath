# Current state

**Last updated:** 2026-07-29 (repository restructure in progress)

## Branch / git

- Branch: `main`
- Pre-restructure tip: `5f75181` (v0.4.0 attention overlays)

## Baseline validation (Phase 0 reconfirm)

| Command | Result |
|---------|--------|
| `npx turbo typecheck` | PASS |
| `npm test --workspace @warden/shared` | PASS (4 tests) |
| `dotnet build apps/agent/Warden.sln` | PASS |
| `docker compose config --quiet` | PASS |
| `git diff --check` | PASS |
| `npx turbo build` | PASS (recorded in audit) |
| `npx turbo lint` | FAIL pre-existing — no ESLint config (fix in Phase 4) |
| `prisma validate` from repo root | FAIL environmental — needs `packages/db/.env` cwd (script in Phase 4) |

## Structure decision

No app/package directory moves. Boundaries already correct. Work focuses on AI guardrails, docs, hygiene, config normalization, and `scripts/check-boundaries.mjs`.

## Active work

See [docs/work/active/repository-restructure.md](../work/active/repository-restructure.md).

## Known non-blocking issues (documented, not necessarily fixed this task)

- Product naming Guardian vs warden vs guardian DB
- `@warden/db` declared on web but unused in `src/`
- `class-variance-authority` unused in `packages/ui` source
- Root `scripts/*.mjs` import hoisted `@prisma/client`
- No CI workflows yet
- No .NET test projects
