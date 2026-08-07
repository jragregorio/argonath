#Requires -Version 5.1
<#
.SYNOPSIS
  Re-register the Warden logon task for a specific child Windows account.

.DESCRIPTION
  Must run elevated. Updates the Task Scheduler logon task Warden\WardenTray and
  persists CHILDUSER to HKLM\SOFTWARE\Warden\ChildUser. Logs to
  C:\ProgramData\Warden\logs\install-startup.log.

.PARAMETER UserId
  Target account, e.g. COMPUTER\ChildAccount or DOMAIN\ChildAccount.
  Not used when -AllStandard is specified.

.PARAMETER AllStandard
  Register logon tasks for every local standard (non-admin) account
  (Warden\WardenTray-<Sam> per user). Administrators are skipped.

.PARAMETER ExePath
  Optional path to Warden.Tray.exe (defaults to Program Files install).
#>
[CmdletBinding(DefaultParameterSetName = 'Single')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Single')]
    [string] $UserId,

    [Parameter(Mandatory = $true, ParameterSetName = 'AllStandard')]
    [switch] $AllStandard,

    [string] $ExePath = 'C:\Program Files\Warden\Warden.Tray.exe',

    [string] $TaskName = 'Warden\WardenTray'
)

$ErrorActionPreference = 'Stop'

function Write-StartupLog {
    param([string] $Message)
    try {
        $dir = 'C:\ProgramData\Warden\logs'
        if (-not (Test-Path -LiteralPath $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
        $line = '{0:yyyy-MM-ddTHH:mm:ss.fffZ} [Repair] {1}' -f (Get-Date).ToUniversalTime(), $Message
        Add-Content -LiteralPath (Join-Path $dir 'install-startup.log') -Value $line -Encoding UTF8
        Write-Host $line
    }
    catch {
        Write-Host $Message
    }
}

function Test-IsElevated {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($id)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-SanitizedSamForTaskName([string] $Sam) {
    if ([string]::IsNullOrWhiteSpace($Sam)) { return '_' }
    $chars = $Sam.ToCharArray() | ForEach-Object {
        if ($_ -match '[A-Za-z0-9._-]') { $_ } else { '_' }
    }
    $result = -join $chars
    if ([string]::IsNullOrEmpty($result)) { return '_' }
    return $result
}

function Get-LocalNonAdminUsers {
    $machine = $env:COMPUTERNAME
    $adminSids = @{}
    try {
        $wql = "ASSOCIATORS OF {Win32_Group.Domain='$machine',Name='Administrators'} WHERE AssocClass=Win32_GroupUser ResultClass=Win32_UserAccount"
        Get-CimInstance -Query $wql | ForEach-Object {
            if ($_.SID) { $adminSids[$_.SID] = $true }
        }
    }
    catch {
        Write-StartupLog ('Admin SID lookup failed: {0}' -f $_.Exception.Message)
    }

    $users = @()
    Get-CimInstance -ClassName Win32_UserAccount -Filter 'LocalAccount=True' | ForEach-Object {
        if ($_.Disabled) { return }
        if ($adminSids.ContainsKey($_.SID)) { return }
        $users += [PSCustomObject]@{
            UserId = '{0}\{1}' -f $machine, $_.Name
            Sam    = $_.Name
        }
    }
    return $users
}

function Remove-AllWardenTasks {
    $tasks = @()
    try {
        schtasks /Query /FO CSV /NH 2>$null | ForEach-Object {
            $line = $_.Trim().Trim('"')
            if ($line -match '\\Warden\\' -or $line -match '^Warden\\') {
                $tasks += $line
            }
        }
    }
    catch {
        # ignore
    }
    foreach ($t in ($tasks | Select-Object -Unique)) {
        schtasks /Delete /TN $t /F 2>$null | Out-Null
        Write-StartupLog ('Deleted task {0}' -f $t)
    }
    schtasks /Delete /TN 'Warden\WardenTray' /F 2>$null | Out-Null
}

if (-not (Test-IsElevated)) {
    Write-Host 'ERROR: Repair-WardenStartup.ps1 must run in an elevated (Administrator) PowerShell.'
    Write-Host 'Right-click PowerShell -> Run as administrator, then re-run this script.'
    exit 1
}

$registerScript = Join-Path $PSScriptRoot 'Register-WardenStartup.ps1'
if (-not (Test-Path -LiteralPath $registerScript)) {
    Write-Host "ERROR: Register-WardenStartup.ps1 not found next to this script ($PSScriptRoot)."
    exit 1
}

if (-not (Test-Path -LiteralPath $ExePath)) {
    Write-Host ("ERROR: Warden executable not found: {0}" -f $ExePath)
    exit 1
}

try {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::LocalMachine,
        [Microsoft.Win32.RegistryView]::Registry64
    )
    $key = $base.CreateSubKey('SOFTWARE\Warden')

    if ($AllStandard) {
        Write-StartupLog ('Repair AllStandard starting. ExePath={0}' -f $ExePath)
        Remove-AllWardenTasks
        $users = Get-LocalNonAdminUsers
        if ($users.Count -eq 0) {
            throw 'No standard (non-admin) local Windows accounts were found.'
        }
        foreach ($u in $users) {
            $perTask = 'Warden\WardenTray-{0}' -f (Get-SanitizedSamForTaskName $u.Sam)
            & $registerScript -ExePath $ExePath -UserId $u.UserId -TaskName $perTask
            Write-StartupLog ('Registered {0} for {1}' -f $perTask, $u.UserId)
        }
        $key.SetValue('ChildUser', '__ALL_STANDARD__', [Microsoft.Win32.RegistryValueKind]::String)
        $key.SetValue('StartupMode', 'AllStandard', [Microsoft.Win32.RegistryValueKind]::String)
        Write-StartupLog 'Persisted StartupMode=AllStandard; ChildUser=__ALL_STANDARD__'
    }
    else {
        Write-StartupLog ('Repair starting. UserId={0} ExePath={1} TaskName={2}' -f $UserId, $ExePath, $TaskName)
        Remove-AllWardenTasks
        & $registerScript -ExePath $ExePath -UserId $UserId -TaskName $TaskName
        $key.SetValue('ChildUser', $UserId, [Microsoft.Win32.RegistryValueKind]::String)
        $key.SetValue('StartupMode', 'Single', [Microsoft.Win32.RegistryValueKind]::String)
        Write-StartupLog ('Persisted HKLM\SOFTWARE\Warden\ChildUser={0}; StartupMode=Single' -f $UserId)
    }

    $key.Close()
    $base.Close()
    Write-StartupLog 'Repair completed successfully. Have supervised users sign out and back in (or Restart) to verify autostart.'
    exit 0
}
catch {
    Write-StartupLog ('ERROR: {0}' -f $_.Exception.Message)
    exit 1
}
