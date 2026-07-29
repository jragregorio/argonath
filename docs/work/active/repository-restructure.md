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

## Final

(pending)
