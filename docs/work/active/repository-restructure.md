# Task: Repository restructure and AI guardrails

## Goal

Establish AI guardrails, docs, hygiene, config normalization, and boundary checks without moving deployable apps/packages (ADR-0001).

## Acceptance criteria

- [ ] AGENTS.md + nested AGENTS.md populated from verified facts
- [ ] `.cursor/rules/*.mdc` present with scopes
- [ ] `docs/ai`, architecture, development, operations, decisions, work populated
- [ ] Hygiene: stray artifacts removed; ignore/indexing rules; `CRON_SECRET` in `.env.example`
- [ ] `DEV-TESTING.md` moved to `docs/development/local-testing.md` with links updated
- [ ] Lint fixed; turbo test/verify/db:validate/check:boundaries wired
- [ ] Boundary script passes
- [ ] Validation no worse than baseline; lint improved to PASS
- [ ] `git diff --check` passes; no secrets in new files

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

## Log

### Phase 0 — Reconfirm baseline

- Date: 2026-07-29
- Changes: none (read-only)
- Commands: git status/branch; turbo typecheck; shared vitest; dotnet build; docker compose config; git diff --check
- Results: as table above
- Next: Phase 1 AI guardrails and docs

### Phase 1 — AI guardrails and project memory

- Date: 2026-07-29
- Changes: Root + nested AGENTS.md; 8 `.cursor/rules/*.mdc`; full `docs/` tree (ai, architecture, development, operations, decisions with ADR-0001/0002, work + active task)
- Commands: `git diff --check` → PASS
- Results: documentation-only; no production source edits
- Decisions: document target commands (`verify`, `check:boundaries`) before scripts exist in later phases
- Risks: `docs/development/local-testing.md` linked but not moved until Phase 3
- Next: Phase 2 hygiene
- Commit: `1fe44f2`

### Phase 2 — Repository hygiene

- Date: 2026-07-29
- Changes: Deleted `dist/Warden.Tray/` and `.cursor/debug-8f2974.log`; updated `.gitignore` (removed incorrect migration_lock ignore; added `.cursor/*.log`, `publish/`); added `.cursorignore`, `.cursorindexingignore`; added `CRON_SECRET` name to `apps/web/.env.example`
- Commands: `git ls-files` for env secrets → none; `git diff --check`
- Results: no tracked secret-bearing env files
- Next: Phase 3 structural doc move
- Commit: `a403443`

### Phase 3 — Structural reorganization

- Date: 2026-07-29
- Changes: `git mv DEV-TESTING.md → docs/development/local-testing.md`; updated README link; fixed relative env links inside local-testing.md
- Evidence for no app/package moves: ADR-0001; `vercel.json` `cd ../..`; acyclic package graph already correct
- Commands: grep for `DEV-TESTING.md` path links → only historical mentions remain; `git diff --check` PASS
- Next: Phase 4 config normalization
- Commit: `3bee2e8`

### Phase 4 — Configuration normalization

- Date: 2026-07-29
- Changes: `apps/web/.eslintrc.json` (next/core-web-vitals); turbo `test`, `globalEnv`, `@warden/db#build` empty outputs; root scripts `test`/`verify`/`db:validate`; packages/db `db:validate`
- Commands: `npx turbo lint` → PASS (exit 0; pre-existing img/hooks warnings); `npm run db:validate` → PASS; package-lock.json untouched
- Note: `check:boundaries` wired in Phase 5 (avoid broken verify reference)
- Next: Phase 5 boundary script
- Commit: `40ebb12`

### Phase 5 — Boundary enforcement

- Date: 2026-07-29
- Changes: Added `scripts/check-boundaries.mjs`; wired `npm run check:boundaries` and updated `verify`; expanded `docs/architecture/boundaries.md`
- Commands: `node scripts/check-boundaries.mjs` → PASS
- Next: Phase 6 full validation

## Final

(pending)
