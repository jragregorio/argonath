# Family timezone

## Goal

Evaluate allowed hours and “today” usage in a configured family IANA timezone so the parent dashboard matches wall-clock schedules (not Vercel UTC).

## Acceptance

- [x] `Family.timezone` stored (IANA), default `UTC`
- [x] Policy engine evaluates windows in that timezone
- [x] API “today” usage queries use family calendar date
- [x] Settings UI to view/change timezone (+ browser detect)
- [x] Sign-up captures browser timezone
- [x] Agent receives timezone and evaluates windows in it
- [x] Shared tests cover UTC vs Asia/Manila style offset

## Progress

- Schema: `Family.timezone` pushed to DB
- Shared: `timezone.ts` helpers + policy engine `timeZone` arg
- API: `family.updateTimezone`; getEvaluation/overview/heartbeat/getPolicy use family TZ
- Web: Settings Family card timezone select; sign-up sends browser TZ
- Agent: `PolicyData.Timezone`; Evaluate/day rollover use family TZ
- Validation: shared tests PASS; typecheck shared/api/web PASS; `dotnet build` PASS

## Next for user

1. Open **Settings → Family → Time zone**
2. Set to `Asia/Manila` (or click “Use Asia/Manila”)
3. Save — badge should flip to Active during Thu 06:00–12:00 local

## Release

- Bumped to **v0.5.9** (web/shared/agent)

## Archive when

User confirms dashboard status matches local wall clock after setting timezone.
