# Boundaries

## TypeScript / npm

```
@warden/web  →  @warden/api, @warden/shared, @warden/ui
@warden/api  →  @warden/db, @warden/shared
@warden/db   →  (none)
@warden/shared → (none)
@warden/ui   →  (none)
```

Forbidden:

- Any import from `packages/**` into `apps/**` paths (packages → apps)
- `apps/web` importing `apps/agent` sources or vice versa
- `new PrismaClient()` outside `packages/db`
- Domain/tRPC/Prisma imports inside `packages/ui`

## .NET

```
Warden.Core          (leaf)
Warden.LockUI     → Core
Warden.Tray       → Core, LockUI
Warden.Agent      → Core, LockUI
```

All projects live under `apps/agent/`. See [ADR-0002](../decisions/0002-keep-dotnet-libraries-in-apps-agent.md).

## Enforcement

Run `npm run check:boundaries` (`scripts/check-boundaries.mjs`). Included in `npm run verify`.

Checks:

- No `packages → apps` imports
- No cross-app source imports (`web` ↔ `agent`)
- Acyclic `@warden/*` graph matching allowed edges
- Every `@warden/*` import is declared in the consumer `package.json`
- `PrismaClient` construction only in `packages/db` (root `scripts/` exempt)
- `apps/web` source must not import `@warden/db` / `@prisma/client`
- `packages/ui` free of domain/tRPC/Prisma
- .NET `ProjectReference` paths stay under `apps/agent`; `Warden.Core` is a leaf
