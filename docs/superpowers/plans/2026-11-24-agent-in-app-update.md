# Agent In-App Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The child presses **Update** in the Warden tray; a SYSTEM scheduled task downloads the newer MSI from GitHub Releases, verifies it, installs it silently, and restarts the tray.

**Architecture:** Server keeps `AgentRelease` as the source of truth but stores a GitHub asset URL instead of a Supabase key. A new on-demand SYSTEM task `Warden\WardenUpdater` runs a new `Warden.Updater.exe`, which trusts only the server's public "latest release" endpoint (never input from the tray). The tray reads the existing heartbeat `update` hint to show a banner and starts the task.

**Tech Stack:** Next.js 15 / tRPC / Prisma / vitest (web), .NET 8 WPF + console, xUnit (new), WiX 6 + DTF custom actions, `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-11-24-agent-in-app-update-design.md`

## Global Constraints

- Release repo: `jragregorio/argonath` (public). Tag `agent-v<version>`. Asset `Warden-<version>-x64.msi`.
- Download URL format: `https://github.com/jragregorio/argonath/releases/download/agent-v<version>/Warden-<version>-x64.msi`.
- Updater task name `Warden\WardenUpdater`; runs as `SYSTEM`, `HighestAvailable`, no triggers, `IgnoreNew`, `ExecutionTimeLimit` `PT15M`; Users may run it but not modify it.
- Tray logon tasks: `Warden\WardenTray` and `Warden\WardenTray-<sam>` (existing; do not rename).
- Updater files: `C:\ProgramData\Warden\updates\` (SYSTEM + Administrators only), status `C:\ProgramData\Warden\update-status.json`, logs `C:\ProgramData\Warden\logs\updater-*.log`.
- UpgradeCode never changes. Install dir `C:\Program Files\Warden\`.
- Versions: agent `0.6.28` → `0.6.29` (`apps/agent/Directory.Build.props` only). Web `0.8.27` → `0.8.28` (`apps/web/package.json`, `packages/shared/package.json`, `APP_VERSION` in `packages/shared/src/types.ts`).
- Dependency rules: `apps/web` must not import `@warden/db`; `Warden.Core` stays a leaf; `Warden.Updater` references nothing in the solution.
- Never commit `.env*`; never print secrets.

## Review Focus

1. **Child not signed in, or several Warden users signed in, when the updater relaunches** → updater runs `/Run` on every `Warden\WardenTray*` task; per-task failures are logged, not fatal (Task 6 test `TrayRelauncher_RunsEveryWardenTrayTask_IgnoresFailures`).
2. **Download fails or hash/size mismatch** → no msiexec, tray never closed, status `failed`, file deleted (Task 6 tests `Verify_*` and `Runner_HashMismatch_DoesNotInstall`).
3. **Update pressed repeatedly / task already running** → second run exits immediately (mutex) and task `IgnoreNew` (Task 6 test `Runner_SecondInstance_ExitsWithoutWork`; Task 7 XML assertion).
4. **msiexec returns failure** → tray still relaunched, status `failed` with exit code, banner shows "Update failed — try again" (Task 6 test `Runner_MsiFails_StillRelaunchesAndRecordsFailure`; Task 8 manual check).
5. **Silent upgrade keeps CHILDUSER / startup mode** from persisted HKLM with `/qn` → verified on the test PC in Task 9.

---

### Task 1: Shared release URL helpers

**Files:**
- Modify: `packages/shared/src/agent-version.ts`
- Test: `packages/shared/src/agent-version.test.ts`

**Interfaces:**
- Produces: `AGENT_RELEASE_REPO = "jragregorio/argonath"`, `agentReleaseTag(version: string): string`, `agentReleaseAssetName(version: string): string`, `buildAgentReleaseDownloadUrl(version: string): string` — exported from `@warden/shared`.

- [ ] **Step 1: Write failing tests**

```ts
describe("agent release urls", () => {
  it("builds tag and asset name", () => {
    expect(agentReleaseTag("0.6.29")).toBe("agent-v0.6.29");
    expect(agentReleaseAssetName("0.6.29")).toBe("Warden-0.6.29-x64.msi");
  });
  it("builds direct download url", () => {
    expect(buildAgentReleaseDownloadUrl("0.6.29")).toBe(
      "https://github.com/jragregorio/argonath/releases/download/agent-v0.6.29/Warden-0.6.29-x64.msi"
    );
  });
  it("rejects non-semver input", () => {
    expect(() => buildAgentReleaseDownloadUrl("0.6.29/../x")).toThrow();
  });
});
```

- [ ] **Step 2:** `npm run test -w @warden/shared` → FAIL (not exported).
- [ ] **Step 3:** Implement in `agent-version.ts`; validate with `/^\d+\.\d+\.\d+$/`; re-export from `index.ts` if not already wildcard-exported.
- [ ] **Step 4:** `npm run test -w @warden/shared` → PASS.
- [ ] **Step 5: Commit** `feat(shared): agent release GitHub URL helpers`

### Task 2: DB + API serve GitHub URLs; public latest endpoint

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `AgentRelease`)
- Modify: `packages/api/src/routers/index.ts:181-273` (release helpers), `:3048-3122` (`agentReleaseRouter`)
- Create: `apps/web/src/app/api/agent/release/latest/route.ts`

**Interfaces:**
- Consumes: `buildAgentReleaseDownloadUrl` (Task 1).
- Produces:
  - `AgentRelease.downloadUrl String?`; `storageKey String?` (was required).
  - `agentRelease.publicLatest` (`publicProcedure`, input `{ channel?: "stable" | "test" }`) → `{ version, sha256, sizeBytes, downloadUrl } | null`.
  - `GET /api/agent/release/latest?channel=stable` → 200 JSON `{ version, sha256, sizeBytes, downloadUrl }`, 404 `{ error: "not_found" }`, `Cache-Control: no-store`.
  - Heartbeat `update` and `agentRelease.latest` unchanged in shape; `downloadUrl` = `row.downloadUrl ?? buildAgentReleaseDownloadUrl(row.version)`.

- [ ] **Step 1:** Edit schema; run `npm run db:validate` → exit 0; `npm run db:push` → exit 0 (adds nullable column; existing rows keep `storageKey`).
- [ ] **Step 2:** Replace `createAgentReleaseSignedUrl` usage with a `resolveAgentReleaseDownloadUrl(row)` helper; remove the `isSupabaseConfigured()` gate from `getHeartbeatUpdateHint` and `latest`; delete `AGENT_RELEASES_BUCKET` and the signed-URL helper once unused. Add `publicLatest`.
- [ ] **Step 3:** Create the route; it calls `appRouter.createCaller(await createContext({}))` → `agentRelease.publicLatest`, validates `channel` (`stable` default; anything else → 400).
- [ ] **Step 4:** `npm run typecheck` → exit 0; `npm run check:boundaries` → exit 0.
- [ ] **Step 5:** With `npm run dev` running: `curl -i "http://localhost:3000/api/agent/release/latest"` → 200 with the 0.6.x row or 404 if none; `curl -i "...?channel=bogus"` → 400.
- [ ] **Step 6: Commit** `feat(api): serve agent releases from GitHub + public latest endpoint`

### Task 3: Publish script → GitHub Releases

**Files:**
- Modify: `scripts/publish-agent-release.mjs`
- Modify: `docs/operations/deployment.md` (publish section; locate the existing `publish:agent` text)

**Interfaces:**
- Consumes: Task 1 helpers (import from `../packages/shared/src/agent-version.ts` is not possible from `.mjs` — duplicate the three constants inline with a comment pointing to the shared source), Task 2 schema.
- Produces: CLI `node scripts/publish-agent-release.mjs --msi <path> [--channel stable|test] [--mandatory] [--version x.y.z] [--dry-run]`.

- [ ] **Step 1:** Remove Supabase upload. Steps become: hash + size → `gh release view agent-v<v> --repo jragregorio/argonath` (create with `gh release create agent-v<v> <msi> --repo … --title "Warden agent <v>" --notes "SHA-256: <hash>"` if missing; else `gh release upload … --clobber`) → Prisma upsert on `(channel, version)` setting `downloadUrl`, `sha256`, `sizeBytes`, `mandatory`, `storageKey: null`. Asset file name must equal `Warden-<v>-x64.msi` (copy/rename to a temp path if the input differs). `--dry-run` prints the plan and hash, runs nothing.
- [ ] **Step 2:** `node scripts/publish-agent-release.mjs --help` → exit 0; `--msi apps/agent/artifacts/Warden-0.6.28-x64.msi --dry-run` → prints tag `agent-v0.6.28`, the exact URL, and SHA-256; exit 0.
- [ ] **Step 3:** Update `deployment.md` publish instructions (needs `gh auth login`; Supabase no longer needed for releases).
- [ ] **Step 4: Commit** `feat(scripts): publish agent MSI to GitHub Releases`

### Task 4: Dashboard download button + web version bump

**Files:**
- Modify: `apps/web/src/app/dashboard/children/[id]/child-devices-section.tsx:63` and the button around `:730-770`
- Modify: `apps/web/package.json`, `packages/shared/package.json`, `packages/shared/src/types.ts:168`

**Interfaces:**
- Consumes: `agentRelease.latest` (Task 2).

- [ ] **Step 1:** Set `INSTALLER_DOWNLOAD_ENABLED = true`. Button is a plain `<a href={downloadUrl}>` (no `target=_blank`, no `download` attr needed — GitHub serves `Content-Disposition: attachment`). Keep the existing "Temporarily unavailable" text only for the case where `latest` returns null.
- [ ] **Step 2:** Bump web to `0.8.28` in the three places.
- [ ] **Step 3:** `npm run verify` → exit 0.
- [ ] **Step 4:** Preview the child detail page (preview_start web); confirm the button is enabled when a release row exists and its `href` is the GitHub URL (read_page).
- [ ] **Step 5: Commit** `feat(web): enable Windows installer download from GitHub Releases (v0.8.28)`

### Task 5: Core reads the heartbeat update hint (+ test project)

**Files:**
- Create: `apps/agent/Warden.Tests/Warden.Tests.csproj` (xUnit, `net8.0-windows`, refs `Warden.Core`; add to `Warden.sln`)
- Modify: `apps/agent/Warden.Core/Models/AgentModels.cs`
- Modify: `apps/agent/Warden.Core/Services/WardenApiClient.cs:125-155`
- Modify: `apps/agent/Warden.Core/EnforcementEngine.cs:1053-1064`
- Test: `apps/agent/Warden.Tests/HeartbeatResponseTests.cs`

**Interfaces:**
- Produces:
  - `public sealed class AgentUpdateInfo { string Version; string Sha256; long SizeBytes; bool Mandatory; string DownloadUrl; }`
  - `public sealed class HeartbeatResponse { bool Ok; AgentUpdateInfo? Update; }`
  - `WardenApiClient.LastUpdateHint : AgentUpdateInfo?` (set after each successful heartbeat; `null` when absent). `SendHeartbeatAsync` keeps returning `bool`.
  - `EnforcementEngine.AvailableUpdate : AgentUpdateInfo?` and `event Action<AgentUpdateInfo?>? UpdateAvailabilityChanged` (raised only when the version changes, including to null).

- [ ] **Step 1: Failing tests**

```csharp
[Fact] public void Parses_update_hint() {
  var json = """{"ok":true,"update":{"version":"0.6.29","sha256":"ab","sizeBytes":88713542,"mandatory":false,"downloadUrl":"https://github.com/x"}}""";
  var r = WardenApiClient.ParseHeartbeatResponse(json);
  Assert.Equal("0.6.29", r!.Update!.Version);
  Assert.Equal(88713542, r.Update.SizeBytes);
}
[Fact] public void Missing_update_is_null() =>
  Assert.Null(WardenApiClient.ParseHeartbeatResponse("""{"ok":true}""")!.Update);
[Fact] public void Garbage_body_returns_null() =>
  Assert.Null(WardenApiClient.ParseHeartbeatResponse("<html>"));
```

- [ ] **Step 2:** `dotnet test apps/agent/Warden.Tests` → FAIL (missing members).
- [ ] **Step 3:** Add `internal static HeartbeatResponse? ParseHeartbeatResponse(string body)` using the client's `JsonOptions`; never throws. `InternalsVisibleTo("Warden.Tests")` on Core. Wire `LastUpdateHint` and the engine event.
- [ ] **Step 4:** `dotnet test apps/agent/Warden.Tests` → PASS; `dotnet build apps/agent/Warden.sln` → exit 0.
- [ ] **Step 5: Commit** `feat(agent): read heartbeat update hint`

### Task 6: `Warden.Updater` executable

**Files:**
- Create: `apps/agent/Warden.Updater/Warden.Updater.csproj` (`WinExe`, `net8.0-windows`, no project refs; add to `Warden.sln`)
- Create: `apps/agent/Warden.Updater/Program.cs`, `ReleaseInfo.cs`, `UpdateDecision.cs`, `ReleaseUrlPolicy.cs`, `FileVerifier.cs`, `UpdateStatusStore.cs`, `TrayRelauncher.cs`, `UpdaterRunner.cs`, `IUpdaterEnvironment.cs`
- Modify: `apps/agent/Warden.Tests/Warden.Tests.csproj` (ref `Warden.Updater`)
- Test: `apps/agent/Warden.Tests/UpdaterTests.cs`

**Interfaces:**
- Produces:
  - `record ReleaseInfo(string Version, string Sha256, long SizeBytes, string DownloadUrl)`
  - `static bool UpdateDecision.IsNewer(string installed, string candidate)` — `System.Version` compare of `x.y.z`; unparsable → false.
  - `static bool ReleaseUrlPolicy.IsAllowed(Uri url)` — `https` and host exactly `github.com`, path starts with `/jragregorio/argonath/releases/download/`.
  - `static bool FileVerifier.Verify(string path, string sha256Hex, long size)` — case-insensitive hex.
  - `record UpdateStatus(string Result, string FromVersion, string? ToVersion, DateTimeOffset At, int? MsiExitCode, string? Message)`; `Result` ∈ `"succeeded" | "failed" | "up_to_date"`. `UpdateStatusStore.Write/Read(string path)`.
  - `interface IUpdaterEnvironment { string InstalledVersion(); Task<ReleaseInfo?> FetchLatestAsync(); Task DownloadAsync(string url, string dest); int RunMsiexec(string msiPath, string logPath); IReadOnlyList<string> QueryTrayTaskNames(); int RunTask(string name); void Log(string line); }`
  - `UpdaterRunner(IUpdaterEnvironment env, string statusPath, string updatesDir).RunAsync() -> Task<UpdateStatus>`
  - `TrayRelauncher.RelaunchAll(IUpdaterEnvironment env)` — runs every name starting with `Warden\WardenTray`.
  - Exit: `Program` holds mutex `Global\WardenUpdater`; second instance exits 0 immediately. Reads `apiBaseUrl` from `warden.json` next to the exe; installed version from `Warden.Tray.exe` `FileVersionInfo` in the same folder.

- [ ] **Step 1: Failing tests** (fake `IUpdaterEnvironment`):
  - `IsNewer("0.6.28","0.6.29")` true; `("0.6.29","0.6.29")` false; `("0.6.29","0.6.10")` false; `("0.6.28","junk")` false.
  - `IsAllowed` true for the Global Constraints URL; false for `http://github.com/...`, `https://evil.com/jragregorio/argonath/...`, `https://github.com/other/repo/releases/download/...`.
  - `Verify_MatchingHashAndSize_True`, `Verify_WrongHash_False`, `Verify_WrongSize_False`.
  - `Runner_UpToDate_NoDownloadNoMsiNoRelaunch` → status `up_to_date`.
  - `Runner_HashMismatch_DoesNotInstall` → no msiexec call, file deleted, no relaunch, status `failed`.
  - `Runner_DisallowedUrl_DoesNotDownload` → status `failed`.
  - `Runner_MsiFails_StillRelaunchesAndRecordsFailure` (msiexec returns 1603) → relaunch called, status `failed`, `MsiExitCode` 1603.
  - `Runner_MsiSucceeds_RelaunchesAndRecordsSuccess` (0 and 3010 both success).
  - `TrayRelauncher_RunsEveryWardenTrayTask_IgnoresFailures` (names `Warden\WardenTray`, `Warden\WardenTray-kid`, `Warden\WardenUpdater`; first returns 1) → both tray tasks run, updater task not run.
  - `Runner_SecondInstance_ExitsWithoutWork` — test the mutex helper `SingleRun.TryAcquire(string name, out IDisposable handle)` returns false when already held.
- [ ] **Step 2:** `dotnet test apps/agent/Warden.Tests` → FAIL.
- [ ] **Step 3:** Implement. Runner order: fetch → decide → url policy → ensure `updatesDir` with ACL (SYSTEM, Administrators full; inheritance off) → download → verify → msiexec `/i "<msi>" /qn /norestart /l*v "<log>"` → finally relaunch (only if msiexec was started) → write status → delete MSI. Real env: `HttpClient` 10-min timeout; `schtasks /Query /FO CSV /NH` filtered to `\Warden\WardenTray*`; logs to `C:\ProgramData\Warden\logs\updater-yyyyMMdd.log`.
- [ ] **Step 4:** `dotnet test apps/agent/Warden.Tests` → PASS; `dotnet build apps/agent/Warden.sln` → exit 0.
- [ ] **Step 5: Commit** `feat(agent): add SYSTEM updater executable`

### Task 7: Installer ships updater + registers `Warden\WardenUpdater`

**Files:**
- Modify: `apps/agent/build-installer.ps1:75-81` (also publish updater)
- Create: `apps/agent/Warden.Installer.CA/UpdaterTaskActions.cs`
- Modify: `apps/agent/Warden.Installer/Package.wxs` (CA definitions + `InstallExecuteSequence`, after line ~310)

**Interfaces:**
- Consumes: `LogonTaskRegistrar` `RunSchtasks`/`Unregister` patterns (`LogonTaskActions.cs:376-535`).
- Produces: `[CustomAction] CreateWardenUpdaterTask(Session)` (deferred, `Impersonate="no"`, `CustomActionData` `ExePath=[INSTALLFOLDER]Warden.Updater.exe`), `[CustomAction] DeleteWardenUpdaterTask(Session)`; `public static string UpdaterTaskRegistrar.BuildTaskXml(string exePath)`.

- [ ] **Step 1:** `build-installer.ps1`: after the tray publish, `dotnet publish Warden.Updater -c $Configuration -r win-x64 --self-contained true -o $publishDir`; assert `Warden.Updater.exe` exists. (Harvest `$(PublishDir)**` picks it up; no `.wxs` file entry needed.)
- [ ] **Step 2:** `BuildTaskXml`: principal `<UserId>S-1-5-18</UserId>` `<RunLevel>HighestAvailable</RunLevel>`, no `<Triggers>`, `IgnoreNew`, `<ExecutionTimeLimit>PT15M</ExecutionTimeLimit>`, `<AllowStartOnDemand>true</AllowStartOnDemand>`, `<Hidden>true</Hidden>`, and in `RegistrationInfo` `<SecurityDescriptor>D:(A;;FA;;;SY)(A;;FA;;;BA)(A;;GRGX;;;BU)</SecurityDescriptor>`. Register via `schtasks /Create /XML <tmp> /TN Warden\WardenUpdater /F`.
- [ ] **Step 3:** Wire CAs: create `After="CreateWardenTask" Condition="NOT REMOVE"`, delete `Before="RemoveFiles" Condition='REMOVE~="ALL"'`, `Return="ignore"` on delete only.
- [ ] **Step 4:** `.\apps\agent\build-installer.ps1` → exit 0, prints MSI path (ICE61 warning expected).
- [ ] **Step 5:** On the test PC (admin): install the MSI; `schtasks /Query /TN Warden\WardenUpdater /XML` shows SYSTEM principal and the SDDL; from the **child** account `schtasks /Run /TN Warden\WardenUpdater` → "SUCCESS"; `schtasks /Change /TN Warden\WardenUpdater /DISABLE` → "Access is denied".
- [ ] **Step 6: Commit** `feat(installer): ship updater and register SYSTEM update task`

### Task 8: Tray banner + Update trigger + agent version bump

**Files:**
- Create: `apps/agent/Warden.Tray/UpdateBanner.cs`, `apps/agent/Warden.Tray/UpdaterLauncher.cs`
- Modify: `apps/agent/Warden.Tray/MainWindow.cs:82-101` (insert banner as first child of `root`), `apps/agent/Warden.Tray/Program.cs` (subscribe to `UpdateAvailabilityChanged`)
- Modify: `apps/agent/Directory.Build.props` → `0.6.29`

**Interfaces:**
- Consumes: `EnforcementEngine.AvailableUpdate` / `UpdateAvailabilityChanged` (Task 5); `UpdateStatus` JSON shape (Task 6) — read with a local DTO, no project ref.
- Produces: `UpdaterLauncher.TryStart() -> bool` (`schtasks /Run /TN "Warden\WardenUpdater"`, 5 s timeout, exit 0 = true).

- [ ] **Step 1:** `UpdateBanner` states and exact copy:
  - Available: `Update available (v{version})` + gold button `Update`.
  - Starting: `Updating… Warden will restart.` (button hidden).
  - Start failed (`TryStart` false): `Couldn't start the update. Try again.` + `Update`.
  - Last run failed (status file `failed` and still on `FromVersion`, read on startup): `Update failed — try again` + `Update`.
  - Hidden when no newer version and no failure, and while the engine is locked.
- [ ] **Step 2:** Bump agent to `0.6.29`. `dotnet build apps/agent/Warden.sln` → exit 0; `dotnet test apps/agent/Warden.Tests` → PASS.
- [ ] **Step 3:** `dotnet run --project apps/agent/Warden.Tray` against local web with a `0.6.30` row in `AgentRelease` → banner shows `Update available (v0.6.30)`; with no row → banner hidden. Screenshot both.
- [ ] **Step 4: Commit** `feat(agent): in-app update banner (v0.6.29)`

### Task 9: End-to-end on the test PC + docs

**Files:**
- Modify: `docs/work/active/agent-installer-autoupdate.md` (Phase 3 section), `docs/decisions/0003-per-machine-wix-msi-logon-task.md` (consequence: updater task)

- [ ] **Step 1:** Build and publish 0.6.29: `build-installer.ps1`, then `node scripts/publish-agent-release.mjs --msi apps/agent/artifacts/Warden-0.6.29-x64.msi --channel stable`. Manually install on TESTPC (one-time bootstrap).
- [ ] **Step 2:** Bump to `0.6.30` (no other change), build, publish to stable.
- [ ] **Step 3:** On TESTPC as the child: banner appears within one heartbeat; press **Update** → "Updating…"; tray closes and reopens within ~2 min; footer shows `v0.6.30`; dashboard device card shows `Agent v0.6.30`; `update-status.json` says `succeeded`; `HKLM\SOFTWARE\Warden\ChildUser` and startup mode unchanged; logon task still targets the child.
- [ ] **Step 4:** Failure path: temporarily set the 0.6.30 row's `sha256` wrong in the DB on a 0.6.29 PC, press Update → tray never closes, status `failed`, banner shows `Update failed — try again`. Restore the hash.
- [ ] **Step 5:** Update the docs; `npm run verify` and `dotnet build apps/agent/Warden.sln` → exit 0.
- [ ] **Step 6: Commit** `docs: agent in-app update (Phase 3) runbook`
