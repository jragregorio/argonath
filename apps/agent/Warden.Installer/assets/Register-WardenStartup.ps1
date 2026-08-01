#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string] $ExePath,

    [Parameter(Mandatory = $true)]
    [string] $UserId,

    [Parameter(Mandatory = $true)]
    [string] $TaskName
)

$ErrorActionPreference = 'Stop'

function Write-StartupLog {
    param([string] $Message)
    try {
        $dir = 'C:\ProgramData\Warden\logs'
        if (-not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        $line = '{0:yyyy-MM-ddTHH:mm:ss.fffZ} {1}' -f (Get-Date).ToUniversalTime(), $Message
        Add-Content -LiteralPath (Join-Path $dir 'install-startup.log') -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    }
    catch {
        # Logging must never fail the custom action.
    }
}

function Test-IsSystemOrMachineAccount([string] $account) {
    $normalized = $account.Trim()
    $bare = ($normalized -split '\\')[-1]
    $machine = $env:COMPUTERNAME

    $bannedExact = @(
        'SYSTEM',
        'LOCAL SYSTEM',
        'LOCALSYSTEM',
        'NT AUTHORITY\SYSTEM'
    )
    foreach ($b in $bannedExact) {
        if ($normalized.Equals($b, [StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }

    if ($bare.Equals('SYSTEM', [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    # Machine account: COMPUTER$ or DOMAIN\COMPUTER$
    if ($bare.EndsWith('$') -and $bare.TrimEnd('$').Equals($machine, [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    return $false
}

function Test-IsLocalAdministrator([string] $account) {
    try {
        $members = Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop
        $bare = ($account -split '\\')[-1]
        foreach ($m in $members) {
            if ($m.Name.Equals($account, [StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
            $mBare = ($m.Name -split '\\')[-1]
            if ($mBare.Equals($bare, [StringComparison]::OrdinalIgnoreCase)) {
                return $true
            }
        }
    }
    catch {
        Write-StartupLog ("WARN: could not enumerate Administrators group: {0}" -f $_.Exception.Message)
    }
    return $false
}

try {
    Write-StartupLog ('Register-WardenStartup starting. ExePath={0} UserId={1} TaskName={2}' -f $ExePath, $UserId, $TaskName)

    if (-not (Test-Path -LiteralPath $ExePath)) {
        throw "Warden executable not found: $ExePath"
    }

    if ([string]::IsNullOrWhiteSpace($UserId)) {
        throw 'UserId (CHILDUSER) is empty. Pass CHILDUSER="COMPUTER\ChildAccount" to msiexec.'
    }

    if (Test-IsSystemOrMachineAccount $UserId) {
        throw @"
CHILDUSER='$UserId' is a system/machine account and cannot own the Warden logon task.
Pass CHILDUSER=""COMPUTER\ChildAccount"" on the msiexec command line (required on first install).
Unattended upgrades read the persisted value from HKLM\SOFTWARE\Warden\ChildUser.
"@
    }

    $resolvedSid = $null
    try {
        $resolvedSid = ([System.Security.Principal.NTAccount]$UserId).Translate(
            [System.Security.Principal.SecurityIdentifier]
        ).Value
        Write-StartupLog ('Resolved UserId SID={0}' -f $resolvedSid)
    }
    catch {
        throw ("CHILDUSER='$UserId' does not resolve to an existing local/domain account. Pass CHILDUSER=`"COMPUTER\ChildAccount`" (exact Windows account name). Translate error: {0}" -f $_.Exception.Message)
    }

    $isAdmin = Test-IsLocalAdministrator $UserId
    Write-StartupLog ('Account exists=True IsLocalAdministrator={0}' -f $isAdmin)
    if ($isAdmin) {
        Write-StartupLog ('WARNING: CHILDUSER={0} is a member of local Administrators. This is often the installing parent account rather than the child. If autostart fails for the child, reinstall with msiexec /i Warden-x.y.z-x64.msi CHILDUSER="COMPUTER\ChildAccount" or run Repair-WardenStartup.ps1 -UserId "COMPUTER\ChildAccount".' -f $UserId)
    }

    $installDir = [System.IO.Path]::GetDirectoryName($ExePath)
    if ([string]::IsNullOrWhiteSpace($installDir)) {
        throw "Could not determine install directory from ExePath='$ExePath'."
    }

    # Best-effort removal of legacy per-user Run key (StartupHelper). Works when the
    # target profile hive is loaded; ignored otherwise.
    try {
        $sid = $resolvedSid
        $runPath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Run"
        if (Test-Path -LiteralPath $runPath) {
            Remove-ItemProperty -LiteralPath $runPath -Name 'Warden' -ErrorAction SilentlyContinue
            Write-StartupLog ('Removed HKU\{0} Run\Warden if present' -f $sid)
        }
    } catch {
        Write-StartupLog ('Best-effort HKU Run cleanup skipped: {0}' -f $_.Exception.Message)
    }

    try {
        Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Warden' -ErrorAction SilentlyContinue
    } catch { }

    $exeAttr = [System.Security.SecurityElement]::Escape($ExePath)
    $userAttr = [System.Security.SecurityElement]::Escape($UserId)
    $cwdAttr = [System.Security.SecurityElement]::Escape($installDir)

    # RestartOnFailure: Task Scheduler rejects Interval < PT1M and Count > 65535
    # (uint16). Values above 65535 may appear to succeed but wrap (e.g. 99999->34463).
    # This is a stopgap watchdog until Phase 3's real updater service.

    $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Starts Warden Tray at logon for the child Windows account, and relaunches about every minute while logged on if the process is missing.</Description>
    <URI>\$TaskName</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Repetition>
        <Interval>PT1M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <Enabled>true</Enabled>
      <UserId>$userAttr</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$userAttr</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>65535</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$exeAttr</Command>
      <WorkingDirectory>$cwdAttr</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

    $tempXml = Join-Path $env:TEMP ("WardenLogonTask-" + [guid]::NewGuid().ToString('N') + '.xml')
    try {
        [System.IO.File]::WriteAllText($tempXml, $xml, [System.Text.Encoding]::Unicode)
        $createOut = & schtasks.exe /Create /TN $TaskName /XML $tempXml /F 2>&1 | Out-String
        Write-StartupLog ('schtasks /Create exit={0} output={1}' -f $LASTEXITCODE, $createOut.Trim())
        if ($LASTEXITCODE -ne 0) {
            throw "schtasks /Create failed with exit code $LASTEXITCODE : $createOut"
        }
        Write-StartupLog 'Register-WardenStartup completed successfully'
    }
    finally {
        Remove-Item -LiteralPath $tempXml -Force -ErrorAction SilentlyContinue
    }
}
catch {
    try { Write-StartupLog ('ERROR: {0}' -f $_.Exception.Message) } catch { }
    throw
}
