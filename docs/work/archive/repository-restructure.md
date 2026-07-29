# Task: Repository restructure and AI guardrails

## Status

**Completed** 2026-07-29 — archived from `docs/work/active/`.

## Goal

Establish AI guardrails, docs, hygiene, config normalization, and boundary checks without moving deployable apps/packages (ADR-0001).

## Acceptance criteria

- [x] AGENTS.md + nested AGENTS.md populated from verified facts
- [x] `.cursor/rules/*.mdc` present with scopes
- [x] `docs/ai`, architecture, development, operations, decisions, work populated
- [x] Hygiene: stray artifacts removed; ignore/indexing rules; `CRON_SECRET` in `.env.example`
- [x] `DEV-TESTING.md` moved to `docs/development/local-testing.md` with links updated
- [x] Lint fixed; turbo test/verify/db:validate/check:boundaries wired
- [x] Boundary script passes
- [x] Validation no worse than baseline; lint improved to PASS
- [x] `git diff --check` passes; no secrets in new files

## Baseline (Phase 0)

| Command | Result |
|---------|--------|
| `git status` / branch | Clean except `?? .cursor/`; `main` |
| `npx turbo typecheck` | PASS |
| `npm test -w @warden/shared` | PASS |
| `dotnet build apps/agent/Warden.sln` | PASS |
| `docker compose config --quiet` | PASS |
| `git diff --check` | PASS |
| `npx turbo lint` | FAIL pre-existing |
| Root `prisma validate` | FAIL environmental |

## Phase 6 validation

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | PASS | |
| `npm run lint` | PASS | Was FAIL; warnings remain (pre-existing) |
| `npm run test` | PASS | turbo test wired |
| `npm run build` | PASS | |
| `npm run check:boundaries` | PASS | New |
| `npm run db:validate` | PASS | Uses packages/db/.env |
| `dotnet build apps/agent/Warden.sln` | PASS | |
| `docker compose config --quiet` | PASS | |
| `git diff --check` | PASS | |

No restructuring-induced failures. Pre-existing lint warnings only.

## Log

### Phase 0 — Reconfirm baseline

- Read-only reconfirm; results as baseline table.

### Phase 1 — AI guardrails

- Commit: `1fe44f2` docs(repo): establish AI guardrails and project memory

### Phase 2 — Hygiene

- Commit: `a403443` chore(repo): clean repository artifacts and ignore rules

### Phase 3 — Structural

- Commit: `3bee2e8` refactor(repo): normalize application and package structure
- Moved: `DEV-TESTING.md` → `docs/development/local-testing.md`
- No app/package moves (ADR-0001)

### Phase 4 — Config

- Commit: `40ebb12` chore(config): normalize monorepo configuration

### Phase 5 — Boundaries

- Commit: `164bf43` test(architecture): enforce repository boundaries

### Phase 6 — Validation

- All commands above PASS

### Finalize

- Updated `docs/ai/CURRENT_STATE.md`; archived this task

## Final

### Moved paths

- `DEV-TESTING.md` → `docs/development/local-testing.md`

### Created (major)

- `AGENTS.md`, `apps/web/AGENTS.md`, `apps/agent/AGENTS.md`, `packages/api/AGENTS.md`, `packages/db/AGENTS.md`
- `.cursor/rules/*.mdc` (8 files)
- `.cursorignore`, `.cursorindexingignore`
- `docs/**` (ai, architecture, development, operations, decisions, work)
- `apps/web/.eslintrc.json`
- `scripts/check-boundaries.mjs`

### Deleted (untracked artifacts)

- `dist/Warden.Tray/`
- `.cursor/debug-8f2974.log`

### Checkpoint commits

1. `1fe44f2` docs(repo): establish AI guardrails and project memory
2. `a403443` chore(repo): clean repository artifacts and ignore rules
3. `3bee2e8` refactor(repo): normalize application and package structure
4. `40ebb12` chore(config): normalize monorepo configuration
5. `164bf43` test(architecture): enforce repository boundaries
6. (this finalize commit) docs(repo): finalize repository migration records

### Remaining pre-existing / external issues

- Naming inconsistency Guardian / warden / guardian DB
- Unused declared deps (`@warden/db` on web; CVA on ui)
- Scripts use hoisted `@prisma/client`
- No CI; no .NET tests
- Next lint deprecation; img/hooks lint warnings

### Operational status

Repository is **fully operational** for build/typecheck/lint/test/dotnet based on Phase 6 validation. Feature E2E (`test:core`) and live Supabase were not re-run (need running services); not required for restructuring acceptance.
