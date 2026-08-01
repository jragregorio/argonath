#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only diagnosis of Warden Windows agent autostart (logon task + Run key).

.DESCRIPTION
  Run elevated on the child PC. Prints a sectioned report and never mutates the system.
  Use -OutFile to also write the report for sharing with support.

.PARAMETER OutFile
  Optional path to write the full report (UTF-8).
#>
[CmdletBinding()]
param(
    [string] $OutFile
)

$ErrorActionPreference = 'Continue'
$script:ReportLines = New-Object System.Collections.Generic.List[string]

function Write-Report {
    param([string] $Text = '')
    $script:ReportLines.Add($Text)
    Write-Host $Text
}

function Write-Section {
    param([string] $Title)
    Write-Report ''
    Write-Report ('=' * 72)
    Write-Report "  $Title"
    Write-Report ('=' * 72)
}

function Try-Do {
    param([scriptblock] $Action, [string] $FailMessage = '  (unavailable)')
    try {
        & $Action
    }
    catch {
        Write-Report $FailMessage
        Write-Report ('  Error: ' + $_.Exception.Message)
    }
}

function Test-IsElevated {
    try {
        $id = [Security.Principal.WindowsIdentity]::GetCurrent()
        $principal = New-Object Security.Principal.WindowsPrincipal($id)
        return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch {
        return $false
    }
}

function Resolve-AccountSid {
    param([string] $Account)
    if ([string]::IsNullOrWhiteSpace($Account)) { return $null }
    try {
        $nt = New-Object System.Security.Principal.NTAccount($Account.Trim())
        return $nt.Translate([type]'System.Security.Principal.SecurityIdentifier').Value
    }
    catch {
        return $null
    }
}

function Get-CurrentUserSid {
    try {
        return [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    }
    catch {
        return $null
    }
}

function Select-TaskUserIds {
    param([xml] $TaskXml)
    $ns = New-Object System.Xml.XmlNamespaceManager($TaskXml.NameTable)
    $ns.AddNamespace('t', 'http://schemas.microsoft.com/windows/2004/02/mit/task')

    $triggerUser = $null
    $principalUser = $null

    $triggerNode = $TaskXml.SelectSingleNode('//t:LogonTrigger/t:UserId', $ns)
    if ($triggerNode) { $triggerUser = $triggerNode.InnerText.Trim() }

    $principalNode = $TaskXml.SelectSingleNode('//t:Principal/t:UserId', $ns)
    if ($principalNode) { $principalUser = $principalNode.InnerText.Trim() }

    if (-not $triggerUser) {
        $n = $TaskXml.SelectSingleNode('//*[local-name()="LogonTrigger"]/*[local-name()="UserId"]')
        if ($n) { $triggerUser = $n.InnerText.Trim() }
    }
    if (-not $principalUser) {
        $n = $TaskXml.SelectSingleNode('//*[local-name()="Principal"]/*[local-name()="UserId"]')
        if ($n) { $principalUser = $n.InnerText.Trim() }
    }

    return @{
        TriggerUserId   = $triggerUser
        PrincipalUserId = $principalUser
    }
}

$script:TaskPresent = $false
$script:TaskEnabled = $null
$script:TaskTriggerUser = $null
$script:TaskPrincipalUser = $null
$script:TaskUserMismatch = $false
$script:TaskMissing = $false
$script:ChildUserReg = $null
$script:HkcuRun = $null
$script:ExeExists = $false
$script:ProcessRunning = $false
$script:ConfigExists = $false
$script:Hiberboot = $null

Write-Report 'Warden startup diagnostic report'
Write-Report ('Generated: {0:yyyy-MM-dd HH:mm:ss} local / {1:yyyy-MM-ddTHH:mm:ss.fffZ} UTC' -f (Get-Date), (Get-Date).ToUniversalTime())
Write-Report 'Script: diagnose-warden-startup.ps1 (read-only; no mutations)'

# =============================================================================
Write-Section '1. Current user / session'
# =============================================================================
Try-Do {
    $who = & whoami 2>&1 | Out-String
    Write-Report ('whoami: {0}' -f $who.Trim())
}
Try-Do {
    $whoUser = & whoami /user 2>&1 | Out-String
    Write-Report 'whoami /user:'
    foreach ($line in ($whoUser -split "`r?`n")) {
        if ($line.Trim()) { Write-Report ('  {0}' -f $line.TrimEnd()) }
    }
}
Write-Report ('Elevated (admin token): {0}' -f (Test-IsElevated))
Write-Report ('COMPUTERNAME: {0}' -f $env:COMPUTERNAME)
Write-Report ('USERNAME: {0}' -f $env:USERNAME)
Write-Report ('USERDOMAIN: {0}' -f $env:USERDOMAIN)
$currentSid = Get-CurrentUserSid
if ($currentSid) {
    Write-Report ('Current user SID: {0}' -f $currentSid)
}
else {
    Write-Report 'Current user SID: (unavailable)'
}

# =============================================================================
Write-Section '2. Scheduled task Warden\WardenTray'
# =============================================================================
$taskXmlRaw = $null
Try-Do {
    $out = & schtasks.exe /Query /TN 'Warden\WardenTray' /XML 2>&1
    if ($LASTEXITCODE -ne 0) {
        $script:TaskMissing = $true
        Write-Report ('Task NOT FOUND (schtasks /Query exit {0}).' -f $LASTEXITCODE)
        Write-Report ('  Output: {0}' -f (($out | Out-String).Trim()))
    }
    else {
        $script:TaskPresent = $true
        $taskXmlRaw = ($out | Out-String)
        Write-Report '--- Full task XML ---'
        Write-Report $taskXmlRaw.TrimEnd()
        Write-Report '--- End task XML ---'
    }
} -FailMessage '  schtasks /Query failed'

if ($script:TaskPresent -and $taskXmlRaw) {
    Try-Do {
        [xml] $taskXml = $taskXmlRaw
        $ids = Select-TaskUserIds -TaskXml $taskXml
        $script:TaskTriggerUser = $ids.TriggerUserId
        $script:TaskPrincipalUser = $ids.PrincipalUserId
        Write-Report ''
        if ($script:TaskTriggerUser) {
            Write-Report ('Parsed LogonTrigger UserId : {0}' -f $script:TaskTriggerUser)
        }
        else {
            Write-Report 'Parsed LogonTrigger UserId : (missing)'
        }
        if ($script:TaskPrincipalUser) {
            Write-Report ('Parsed Principal UserId    : {0}' -f $script:TaskPrincipalUser)
        }
        else {
            Write-Report 'Parsed Principal UserId    : (missing)'
        }

        $bindUser = $null
        if ($script:TaskTriggerUser) { $bindUser = $script:TaskTriggerUser }
        elseif ($script:TaskPrincipalUser) { $bindUser = $script:TaskPrincipalUser }

        $bindSid = Resolve-AccountSid $bindUser
        $meName = ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME)
        $meSid = $currentSid

        if ($bindSid) {
            Write-Report ('Resolved task user SID     : {0}' -f $bindSid)
        }
        else {
            Write-Report 'Resolved task user SID     : (could not resolve)'
        }
        Write-Report ('Current user               : {0}' -f $meName)
        if ($meSid) {
            Write-Report ('Current user SID           : {0}' -f $meSid)
        }
        else {
            Write-Report 'Current user SID           : (unavailable)'
        }

        $match = $false
        if ($bindSid -and $meSid -and ($bindSid -eq $meSid)) {
            $match = $true
        }
        elseif ($bindUser) {
            $bareBind = ($bindUser -split '\\')[-1]
            $bareMe = $env:USERNAME
            if ($bindUser.Equals($meName, [StringComparison]::OrdinalIgnoreCase) -or
                $bareBind.Equals($bareMe, [StringComparison]::OrdinalIgnoreCase)) {
                $match = $true
            }
        }

        if (-not $bindUser) {
            Write-Report 'VERDICT: task XML has no LogonTrigger/Principal UserId - cannot determine who it fires for.'
            $script:TaskUserMismatch = $true
        }
        elseif ($match) {
            Write-Report ("VERDICT: task is bound to '{0}' and you are '{1}' -> task SHOULD fire at this user's logon." -f $bindUser, $meName)
        }
        else {
            $script:TaskUserMismatch = $true
            Write-Report ("VERDICT: task is bound to '{0}' but you are '{1}' -> the task will NEVER fire at this user's logon." -f $bindUser, $meName)
        }
    } -FailMessage '  Failed to parse task XML'
}

Try-Do {
    $info = Get-ScheduledTaskInfo -TaskPath '\Warden\' -TaskName 'WardenTray' -ErrorAction Stop
    Write-Report ''
    Write-Report 'Get-ScheduledTaskInfo:'
    Write-Report ('  LastRunTime       : {0}' -f $info.LastRunTime)
    Write-Report ('  LastTaskResult    : {0}' -f $info.LastTaskResult)
    Write-Report ('  NextRunTime       : {0}' -f $info.NextRunTime)
    Write-Report ('  NumberOfMissedRuns: {0}' -f $info.NumberOfMissedRuns)
    Write-Report '  Notes:'
    Write-Report '    - Stale/never LastRunTime with a correct user binding often means the trigger never fired'
    Write-Report '      (wrong UserId, task disabled, or user has not logged on since registration).'
    Write-Report '    - Non-zero LastTaskResult means the task ran but the action failed (exe missing,'
    Write-Report '      access denied, crash). 0 = success. 267011 / 0x8004130B often means never run.'
} -FailMessage '  Get-ScheduledTaskInfo unavailable (task missing or cmdlet failed)'

Try-Do {
    $task = Get-ScheduledTask -TaskPath '\Warden\' -TaskName 'WardenTray' -ErrorAction Stop
    $script:TaskEnabled = ($task.State -ne 'Disabled')
    Write-Report ('Task State (Enabled?): {0}' -f $task.State)
} -FailMessage '  Get-ScheduledTask State unavailable'

# =============================================================================
Write-Section '3. Persisted CHILDUSER (HKLM)'
# =============================================================================
Try-Do {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::LocalMachine,
        [Microsoft.Win32.RegistryView]::Registry64
    )
    $key = $base.OpenSubKey('SOFTWARE\Warden')
    if ($null -eq $key) {
        Write-Report 'HKLM\SOFTWARE\Warden (64bit view): not present'
    }
    else {
        $val = $key.GetValue('ChildUser')
        $script:ChildUserReg = $val
        if ($null -ne $val) {
            Write-Report ('HKLM\SOFTWARE\Warden\ChildUser (64bit view): {0}' -f $val)
        }
        else {
            Write-Report 'HKLM\SOFTWARE\Warden\ChildUser (64bit view): (value missing)'
        }
        $key.Close()
    }
    $base.Close()
} -FailMessage '  Could not read HKLM\SOFTWARE\Warden'

# =============================================================================
Write-Section '4. HKCU / HKEY_USERS Run\Warden'
# =============================================================================
Try-Do {
    $runPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    if (Test-Path $runPath) {
        $val = (Get-ItemProperty -Path $runPath -Name 'Warden' -ErrorAction SilentlyContinue).Warden
        $script:HkcuRun = $val
        if ($null -ne $val) {
            Write-Report ('HKCU Run\Warden: {0}' -f $val)
        }
        else {
            Write-Report 'HKCU Run\Warden: (not set)'
        }
    }
    else {
        Write-Report 'HKCU Run key missing'
    }
} -FailMessage '  Could not read HKCU Run'

Try-Do {
    Write-Report 'HKEY_USERS\*\...\Run\Warden (loaded hives):'
    $hu = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::Users,
        [Microsoft.Win32.RegistryView]::Registry64
    )
    $foundAny = $false
    foreach ($sub in $hu.GetSubKeyNames()) {
        if ($sub -match '_Classes$') { continue }
        try {
            $rk = $hu.OpenSubKey("$sub\Software\Microsoft\Windows\CurrentVersion\Run")
            if ($null -eq $rk) { continue }
            $val = $rk.GetValue('Warden')
            if ($null -ne $val) {
                $foundAny = $true
                Write-Report ('  {0}: {1}' -f $sub, $val)
            }
            $rk.Close()
        }
        catch { }
    }
    if (-not $foundAny) {
        Write-Report '  (none found in loaded hives)'
    }
    $hu.Close()
} -FailMessage '  Could not enumerate HKEY_USERS Run'

# =============================================================================
Write-Section '5. Installed files / MSI products'
# =============================================================================
$exePath = 'C:\Program Files\Warden\Warden.Tray.exe'
Try-Do {
    if (Test-Path -LiteralPath $exePath) {
        $script:ExeExists = $true
        $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($exePath)
        Write-Report ('Exe present: {0}' -f $exePath)
        Write-Report ('  FileVersion   : {0}' -f $vi.FileVersion)
        Write-Report ('  ProductVersion: {0}' -f $vi.ProductVersion)
        Write-Report ('  LastWriteTime : {0}' -f (Get-Item -LiteralPath $exePath).LastWriteTime)
    }
    else {
        Write-Report ('Exe NOT found: {0}' -f $exePath)
    }
} -FailMessage '  Could not inspect Program Files exe'

Try-Do {
    Write-Report 'Installed Warden products (Uninstall registry):'
    $roots = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
    )
    $found = $false
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
                $dn = $p.DisplayName
                if ($dn -and ($dn -match 'Warden')) {
                    $found = $true
                    Write-Report ('  {0} | Version={1} | Publisher={2} | UninstallString={3}' -f `
                        $dn, $p.DisplayVersion, $p.Publisher, $p.UninstallString)
                }
            }
            catch { }
        }
    }
    if (-not $found) {
        Write-Report '  (no Warden entries found)'
    }
} -FailMessage '  Could not enumerate Uninstall keys'

# =============================================================================
Write-Section '6. Running process'
# =============================================================================
Try-Do {
    $procs = @(Get-Process -Name 'Warden.Tray' -ErrorAction SilentlyContinue)
    if ($procs.Count -eq 0) {
        Write-Report 'Warden.Tray.exe is NOT running'
    }
    else {
        $script:ProcessRunning = $true
        foreach ($p in $procs) {
            $pathText = '?'
            try { $pathText = $p.Path } catch { }
            Write-Report ('PID {0} StartTime={1} Path={2}' -f $p.Id, $p.StartTime, $pathText)
        }
    }
} -FailMessage '  Get-Process failed'

# =============================================================================
Write-Section '7. Local users / Administrators'
# =============================================================================
Try-Do {
    Write-Report 'Local users (Get-LocalUser):'
    Get-LocalUser -ErrorAction Stop | ForEach-Object {
        Write-Report ('  {0} Enabled={1} Description={2}' -f $_.Name, $_.Enabled, $_.Description)
    }
} -FailMessage '  Get-LocalUser unavailable (needs admin module / elevation)'

Try-Do {
    Write-Report 'Local Administrators group members:'
    $group = Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop
    foreach ($m in $group) {
        Write-Report ('  {0} ({1})' -f $m.Name, $m.ObjectClass)
    }
} -FailMessage '  Get-LocalGroupMember Administrators unavailable'

# =============================================================================
Write-Section '8. Fast Startup / last boot'
# =============================================================================
Try-Do {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::LocalMachine,
        [Microsoft.Win32.RegistryView]::Registry64
    )
    $key = $base.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\Power')
    if ($key) {
        $hb = $key.GetValue('HiberbootEnabled')
        $script:Hiberboot = $hb
        Write-Report ('HiberbootEnabled (Fast Startup): {0}  [1=on, 0=off, null=unset]' -f $hb)
        $key.Close()
    }
    else {
        Write-Report 'Power key not found'
    }
    $base.Close()
} -FailMessage '  Could not read Fast Startup registry'

Try-Do {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    Write-Report ('LastBootUpTime: {0}' -f $os.LastBootUpTime)
} -FailMessage '  Could not read LastBootUpTime'

# =============================================================================
Write-Section '9. Event logs (last 14 days)'
# =============================================================================
$since = (Get-Date).AddDays(-14)

Try-Do {
    $logName = 'Microsoft-Windows-TaskScheduler/Operational'
    $enabled = $null
    try {
        $cfg = wevtutil.exe gl $logName 2>&1 | Out-String
        if ($cfg -match 'enabled:\s*true') { $enabled = $true }
        elseif ($cfg -match 'enabled:\s*false') { $enabled = $false }
        if ($null -eq $enabled) {
            Write-Report 'TaskScheduler/Operational enabled: unknown'
        }
        else {
            Write-Report ('TaskScheduler/Operational enabled: {0}' -f $enabled)
        }
        if ($enabled -eq $false) {
            Write-Report '  This log is DISABLED. Enable with (elevated):'
            Write-Report '    wevtutil sl Microsoft-Windows-TaskScheduler/Operational /e:true'
        }
    }
    catch {
        Write-Report '  Could not query TaskScheduler log status via wevtutil'
    }

    if ($enabled -ne $false) {
        $events = @(Get-WinEvent -FilterHashtable @{
            LogName   = $logName
            StartTime = $since
        } -ErrorAction SilentlyContinue | Where-Object {
            $_.Message -match 'Warden' -or $_.Message -match 'WardenTray'
        } | Select-Object -First 40)

        if ($events.Count -eq 0) {
            Write-Report '  No TaskScheduler Operational events mentioning Warden in last 14 days'
        }
        else {
            Write-Report ('  Found {0} matching event(s) (showing up to 40):' -f $events.Count)
            foreach ($e in $events) {
                $msg = ($e.Message -replace '\s+', ' ').Trim()
                if ($msg.Length -gt 200) { $msg = $msg.Substring(0, 200) + '...' }
                Write-Report ('  [{0:u}] Id={1} Level={2} {3}' -f $e.TimeCreated, $e.Id, $e.LevelDisplayName, $msg)
            }
        }
    }
} -FailMessage '  TaskScheduler Operational query failed'

Try-Do {
    Write-Report '.NET Runtime Event ID 1026 / Application Error 1000 for Warden.Tray.exe:'
    $appEvents = @(Get-WinEvent -FilterHashtable @{
        LogName   = 'Application'
        StartTime = $since
        Id        = 1026, 1000
    } -ErrorAction SilentlyContinue | Where-Object {
        $_.Message -match 'Warden\.Tray'
    } | Select-Object -First 30)

    if ($appEvents.Count -eq 0) {
        Write-Report '  (none in last 14 days)'
    }
    else {
        foreach ($e in $appEvents) {
            $msg = ($e.Message -replace '\s+', ' ').Trim()
            if ($msg.Length -gt 240) { $msg = $msg.Substring(0, 240) + '...' }
            Write-Report ('  [{0:u}] Provider={1} Id={2} {3}' -f $e.TimeCreated, $e.ProviderName, $e.Id, $msg)
        }
    }
} -FailMessage '  Application log query failed'

# =============================================================================
Write-Section '10. Config shape (NO secrets)'
# =============================================================================
Try-Do {
    $cfgPath = Join-Path $env:LOCALAPPDATA 'Warden\config.json'
    if (-not (Test-Path -LiteralPath $cfgPath)) {
        Write-Report ('config.json NOT found: {0}' -f $cfgPath)
    }
    else {
        $script:ConfigExists = $true
        $item = Get-Item -LiteralPath $cfgPath
        Write-Report ('Path : {0}' -f $cfgPath)
        Write-Report ('Size : {0} bytes' -f $item.Length)
        Write-Report ('mtime: {0}' -f $item.LastWriteTime)

        $raw = Get-Content -LiteralPath $cfgPath -Raw -ErrorAction Stop
        $json = $raw | ConvertFrom-Json -ErrorAction Stop
        $keys = @($json.PSObject.Properties.Name)
        Write-Report ('Top-level keys present: {0}' -f (($keys | Sort-Object) -join ', '))
        foreach ($interesting in @(
            'ApiBaseUrl', 'DeviceId', 'DeviceToken',
            'SupabaseUrl', 'SupabaseAnonKey',
            'ChildName', 'ParentPin'
        )) {
            $has = $false
            foreach ($k in $keys) {
                if ($k.Equals($interesting, [StringComparison]::Ordinal)) { $has = $true; break }
            }
            Write-Report ('  has {0}: {1}' -f $interesting, $has)
            if ($has) {
                Write-Report '    (value NOT printed)'
            }
        }
        Write-Report '  NOTE: token/secret values are intentionally omitted.'
    }
} -FailMessage '  Could not inspect config.json (parse error or access denied)'

# =============================================================================
Write-Section '11. Log folders'
# =============================================================================
Try-Do {
    $userLogs = Join-Path $env:LOCALAPPDATA 'Warden\logs'
    Write-Report ('User logs: {0}' -f $userLogs)
    if (Test-Path -LiteralPath $userLogs) {
        Get-ChildItem -LiteralPath $userLogs -Force -ErrorAction SilentlyContinue |
            Sort-Object Name |
            ForEach-Object {
                Write-Report ('  {0}  {1} bytes  mtime={2}' -f $_.Name, $_.Length, $_.LastWriteTime)
            }
    }
    else {
        Write-Report '  (folder not present)'
    }
} -FailMessage '  Could not list user logs'

Try-Do {
    $pdLogs = 'C:\ProgramData\Warden\logs'
    Write-Report ('ProgramData logs: {0}' -f $pdLogs)
    if (Test-Path -LiteralPath $pdLogs) {
        Get-ChildItem -LiteralPath $pdLogs -Force -ErrorAction SilentlyContinue |
            Sort-Object Name |
            ForEach-Object {
                Write-Report ('  {0}  {1} bytes  mtime={2}' -f $_.Name, $_.Length, $_.LastWriteTime)
            }
    }
    else {
        Write-Report '  (folder not present)'
    }
} -FailMessage '  Could not list ProgramData logs'

# =============================================================================
Write-Section 'LIKELY CAUSE'
# =============================================================================
$causes = New-Object System.Collections.Generic.List[string]

if ($script:TaskMissing -or -not $script:TaskPresent) {
    $causes.Add('Scheduled task Warden\WardenTray is missing - installer custom action may have failed, or task was deleted.')
}
elseif ($script:TaskUserMismatch) {
    $causes.Add(('PRIMARY SUSPECT: logon task is bound to a different Windows account than the current user. The installer likely used [LogonUser] (elevating admin) instead of CHILDUSER="COMPUTER\ChildAccount". Persisted HKLM ChildUser=''{0}'' may have locked in the wrong account for upgrades.' -f $script:ChildUserReg))
}
elseif ($script:TaskEnabled -eq $false) {
    $causes.Add('Task exists for this user but is Disabled.')
}

if ($script:ChildUserReg -and $script:TaskTriggerUser) {
    $regBare = ($script:ChildUserReg -split '\\')[-1]
    $trigBare = ($script:TaskTriggerUser -split '\\')[-1]
    if (-not $regBare.Equals($trigBare, [StringComparison]::OrdinalIgnoreCase) -and
        -not $script:ChildUserReg.Equals($script:TaskTriggerUser, [StringComparison]::OrdinalIgnoreCase)) {
        $causes.Add(('HKLM ChildUser (''{0}'') does not match task trigger user (''{1}'').' -f $script:ChildUserReg, $script:TaskTriggerUser))
    }
}

if (-not $script:HkcuRun -and $script:TaskUserMismatch) {
    $causes.Add('No HKCU Run\Warden fallback for this user - nothing will start Warden at this account logon.')
}
elseif ($script:HkcuRun) {
    $causes.Add(('HKCU Run\Warden is set ({0}) - manual/dev fallback may start the app even if the task is wrong.' -f $script:HkcuRun))
}

if (-not $script:ExeExists) {
    $causes.Add('Warden.Tray.exe not found under Program Files - install may be incomplete or custom path.')
}

if (-not $script:ProcessRunning -and $script:TaskPresent -and -not $script:TaskUserMismatch -and ($script:TaskEnabled -ne $false)) {
    $causes.Add('Task looks correctly bound but process is not running - check LastTaskResult, Application crash events, pairing dismissal, or Fast Startup quirks.')
}

if ($script:Hiberboot -eq 1) {
    $causes.Add('Fast Startup (HiberbootEnabled=1) is on - logon triggers can be skipped on shutdown/reboot hybrids; test with a full Restart.')
}

if (-not $script:ConfigExists) {
    $causes.Add('No config.json for this user - if the tray did start, pairing was never completed (or runs under another profile).')
}

if ($causes.Count -eq 0) {
    Write-Report 'No strong mismatch detected from static checks. Review task LastRunTime/LastTaskResult and event logs above.'
    Write-Report 'If the tray still does not autostart, collect %LOCALAPPDATA%\Warden\logs\ after installing v0.5.14+.'
}
else {
    $i = 1
    foreach ($c in $causes) {
        Write-Report ('{0}. {1}' -f $i, $c)
        $i++
    }
}

Write-Report ''
Write-Report 'Remediation (after confirming CHILDUSER):'
Write-Report '  Elevated repair (v0.5.14+ MSI ships this script under Program Files\Warden):'
Write-Report '    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Program Files\Warden\Repair-WardenStartup.ps1" -UserId "COMPUTER\ChildAccount"'
Write-Report '  Or reinstall with:'
Write-Report '    msiexec /i Warden-x.y.z-x64.msi CHILDUSER="COMPUTER\ChildAccount"'
Write-Report ''
Write-Report 'End of report.'

if ($OutFile) {
    try {
        $dir = Split-Path -Parent $OutFile
        if ($dir -and -not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllLines($OutFile, $script:ReportLines.ToArray(), $utf8NoBom)
        Write-Host ''
        Write-Host ('Report also written to: {0}' -f $OutFile)
    }
    catch {
        Write-Host ('WARNING: failed to write -OutFile: {0}' -f $_.Exception.Message)
    }
}

exit 0
