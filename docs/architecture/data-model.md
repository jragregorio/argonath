# Data model (Prisma)

Source of truth: `packages/db/prisma/schema.prisma`.

## Enums

- `FamilyRole`: `Admin`, `Parent`, `Child`

## Models (names)

| Model | Notes |
|-------|--------|
| `User` | Email/password (hash) |
| `Family` | Optional `parentPin`; `timezone` (IANA) for allowed hours and “today” usage |
| `FamilyMember` | User↔Family + role |
| `RefreshToken` | Rotating refresh families |
| `Child` | Display name under family |
| `Device` | Pairing code/token, lock flags, agent metadata; `runningApps` / `runningAppsAt` hold the latest visible-window snapshot from heartbeat (not history) |
| `ScreenTimePolicy` | Daily limit + allowed windows JSON; `blockedProcessNames` JSON array (process names to close on relaunch) |
| `UsageLog` | Per device/date active/idle minutes |
| `ExtensionRequest` | Pending/approved time requests |
| `ExtensionOverride` | Active bonus minutes |
| `Snapshot` | Capture metadata + storage key |
| `Nudge` | Parent attention prompts |
| `AuditLog` | Family actions |
| `CaptureRateLimit` | Per-device hourly capture counts |

Schema uses PostgreSQL with `DATABASE_URL` + `DIRECT_URL`.
