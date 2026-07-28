# Local core mechanics testing (no Supabase)

Test time limits, lockout, and extension approval with only Postgres and optional auth bypass.

## Prerequisites

- Node.js 20+
- .NET SDK (8+ or 10)
- Docker Desktop (for Postgres), or a local Postgres install

## 1. Start Postgres

```bash
docker compose up -d
```

Verify: `docker compose ps` shows `warden-postgres` running.

## 2. Apply database schema

Ensure [`packages/db/.env`](packages/db/.env) exists (copy from `.env.example` if needed).

```bash
npm run db:push
```

## 3. Start the parent dashboard

```bash
npm run dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) — with auth bypass, sign-in is skipped.

Required env in [`apps/web/.env.local`](apps/web/.env.local):

```
NEXT_PUBLIC_DEV_AUTH_BYPASS=true
DEV_BYPASS_USER_ID=dev-parent
DEV_BYPASS_FAMILY_ID=dev-family
AUTH_JWT_SECRET=local-dev-jwt-secret-change-me-32chars-min
```

Without bypass, create an account at `/sign-up` (requires `AUTH_JWT_SECRET`).

## 4. Create a child and set a short limit

1. **Children** → Add child (e.g. "Alex")
2. Open the child profile → **Screen time policy**
3. Set **daily limit** to **1–2 minutes** for fast testing
4. Leave allowed windows empty
5. Save policy

## 5. Pair the Windows agent

1. Click **Generate pairing code** on the child page
2. Run the agent:

```bash
cd apps/agent
dotnet run --project Warden.Tray
```

3. In the pairing form:
   - **API URL:** `http://localhost:3000`
   - **Supabase URL / Anon key:** leave blank (optional for this phase)
   - **Code:** enter the 6-digit code

## Clean retest after leftover data

If usage shows leftover minutes or `(+15 bonus)` from earlier tests:

```bash
npm run test:reset
```

Then restart the agent (`Warden.Tray`), set a **1–2 minute** daily limit on a child, and keep using the PC. Usage should climb every ~15s; lock should appear after the limit.

## 6. Test lockout

- Use the PC actively (mouse/keyboard). Idle time (~5 min) does not count toward the limit.
- With a **2-minute** limit, expect a full-screen lock overlay within a few minutes of active use.
- Lock screen shows **Request more time** (+15 / +30 / +60 min).

## 7. Test extension request + approval

1. On the **locked PC:** click **+15 min**
2. On the **dashboard:** **Requests** → **Approve**
3. Within ~10 seconds the agent polls while locked, picks up bonus minutes, and unlocks.

## 8. Test parent PIN shutdown (onsite)

1. In the dashboard **Settings**, set a parent PIN (4–8 chars) and wait for a heartbeat (~15s) or use tray **Refresh policy now**
2. When locked, on the **primary** monitor enter the PIN and click **Shut down Warden**
3. All overlays dismiss and the agent exits completely (no more enforcement until you start it again)

No Supabase Realtime required for this flow.

## Ignore during this phase

- **Snapshots** page and capture buttons (require Supabase Storage)
- Use **`Warden.Tray`** on child PCs — it shows time remaining and runs from the system tray
- `Warden.Agent` Windows Service is optional (no child UI)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `DIRECT_URL` not found on `db:push` | Create `packages/db/.env` |
| Can't connect to Postgres | Run `docker compose up -d` |
| Dashboard errors on load | Check `DATABASE_URL` in `apps/web/.env.local` matches Postgres |
| Agent won't pair | Confirm web app is running; code expires in 15 minutes |
| Unlock slow after approve | Normal — agent polls every ~10s while locked |
| `AUTH_JWT_SECRET` errors | Set a 32+ character secret in `.env.local` |
