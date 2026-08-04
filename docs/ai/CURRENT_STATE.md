# Current state

**Last updated:** 2026-07-29 (repository restructure complete)

## Branch / git

- Branch: `main` (ahead of origin; not pushed unless requested)
- Checkpoint commits from this work: see archive task record

## Post-restructure validation (Phase 6)

| Command | Result | Classification |
|---------|--------|----------------|
| `npm run typecheck` | PASS | OK |
| `npm run lint` | PASS (exit 0; existing `<img>` / hooks warnings) | Improved vs baseline FAIL |
| `npm run test` | PASS | OK (now wired via turbo) |
| `npm run build` | PASS | OK |
| `npm run check:boundaries` | PASS | New |
| `npm run db:validate` | PASS | Fixed environmental root validate via package script |
| `dotnet build apps/agent/Warden.sln` | PASS | OK |
| `docker compose config --quiet` | PASS | OK |
| `git diff --check` | PASS | OK |

## Structure

Application and package directories **unchanged** (ADR-0001). Added AI guardrails, docs, ignore rules, ESLint config, turbo/test/verify scripts, and `scripts/check-boundaries.mjs`. One doc move: `DEV-TESTING.md` → `docs/development/local-testing.md`.

## Remaining non-blocking issues

- Product naming: Guardian folder vs `warden` npm vs `guardian` DB name
- `@warden/db` declared on web for `serverExternalPackages` but unused in `src/`
- `class-variance-authority` unused in `packages/ui` source
- Root `scripts/*.mjs` import hoisted `@prisma/client`
- No CI workflows yet
- No .NET test projects
- `next lint` deprecated toward Next 16 ESLint CLI migration
- Lint warnings in snapshots page (`no-img-element`) and `realtime.ts` (`exhaustive-deps`) — pre-existing, not introduced

## Active work

- [Mobile Capacitor Android shell](../work/active/mobile-capacitor-android.md) — `apps/mobile`, remote URL `https://warden-alpha.vercel.app/sign-in`, package `com.warden.gard`, FCM client wired (needs `google-services.json`).

Completed task: [docs/work/archive/repository-restructure.md](../work/archive/repository-restructure.md).
