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

if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Warden executable not found: $ExePath"
}

if ([string]::IsNullOrWhiteSpace($UserId)) {
    throw 'UserId (CHILDUSER) is empty. Pass CHILDUSER="COMPUTER\ChildAccount" to msiexec.'
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

if (Test-IsSystemOrMachineAccount $UserId) {
    throw @"
CHILDUSER='$UserId' is a system/machine account and cannot own the Warden logon task.
Pass CHILDUSER=""COMPUTER\ChildAccount"" on the msiexec command line (required on first install).
Unattended upgrades read the persisted value from HKLM\SOFTWARE\Warden\ChildUser.
"@
}

$installDir = [System.IO.Path]::GetDirectoryName($ExePath)
if ([string]::IsNullOrWhiteSpace($installDir)) {
    throw "Could not determine install directory from ExePath='$ExePath'."
}

# Best-effort removal of legacy per-user Run key (StartupHelper). Works when the
# target profile hive is loaded; ignored otherwise.
try {
    $sid = ([System.Security.Principal.NTAccount]$UserId).Translate(
        [System.Security.Principal.SecurityIdentifier]
    ).Value
    $runPath = "Registry::HKEY_USERS\$sid\Software\Microsoft\Windows\CurrentVersion\Run"
    if (Test-Path -LiteralPath $runPath) {
        Remove-ItemProperty -LiteralPath $runPath -Name 'Warden' -ErrorAction SilentlyContinue
    }
} catch {
    # Child hive may not be loaded; also try the elevating user's HKCU.
}

try {
    Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Warden' -ErrorAction SilentlyContinue
} catch { }

$exeAttr = [System.Security.SecurityElement]::Escape($ExePath)
$userAttr = [System.Security.SecurityElement]::Escape($UserId)
$cwdAttr = [System.Security.SecurityElement]::Escape($installDir)

# RestartOnFailure: Task Scheduler rejects Interval < PT1M and Count > 65535
# (uint16). Values above 65535 may appear to succeed but wrap (e.g. 99999→34463).
# This is a stopgap watchdog until Phase 3's real updater service.

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Starts Warden Tray at logon for the child Windows account.</Description>
    <URI>\$TaskName</URI>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
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
    & schtasks.exe /Create /TN $TaskName /XML $tempXml /F
    if ($LASTEXITCODE -ne 0) {
        throw "schtasks /Create failed with exit code $LASTEXITCODE"
    }
}
finally {
    Remove-Item -LiteralPath $tempXml -Force -ErrorAction SilentlyContinue
}
