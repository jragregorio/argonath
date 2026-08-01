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

.PARAMETER ExePath
  Optional path to Warden.Tray.exe (defaults to Program Files install).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $UserId,

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

if (-not (Test-IsElevated)) {
    Write-Host 'ERROR: Repair-WardenStartup.ps1 must run in an elevated (Administrator) PowerShell.'
    Write-Host 'Right-click PowerShell -> Run as administrator, then re-run this script.'
    exit 1
}

$registerScript = Join-Path $PSScriptRoot 'Register-WardenStartup.ps1'
if (-not (Test-Path -LiteralPath $registerScript)) {
    # When run from the repo instead of Program Files:
    $alt = Join-Path $PSScriptRoot 'Register-WardenStartup.ps1'
    if (-not (Test-Path -LiteralPath $alt)) {
        Write-Host "ERROR: Register-WardenStartup.ps1 not found next to this script ($PSScriptRoot)."
        exit 1
    }
    $registerScript = $alt
}

if (-not (Test-Path -LiteralPath $ExePath)) {
    Write-Host ("ERROR: Warden executable not found: {0}" -f $ExePath)
    exit 1
}

Write-StartupLog ('Repair starting. UserId={0} ExePath={1} TaskName={2}' -f $UserId, $ExePath, $TaskName)

try {
    & $registerScript -ExePath $ExePath -UserId $UserId -TaskName $TaskName

    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
        [Microsoft.Win32.RegistryHive]::LocalMachine,
        [Microsoft.Win32.RegistryView]::Registry64
    )
    $key = $base.CreateSubKey('SOFTWARE\Warden')
    $key.SetValue('ChildUser', $UserId, [Microsoft.Win32.RegistryValueKind]::String)
    $key.Close()
    $base.Close()
    Write-StartupLog ('Persisted HKLM\SOFTWARE\Warden\ChildUser={0}' -f $UserId)
    Write-StartupLog 'Repair completed successfully. Have the child sign out and back in (or Restart) to verify autostart.'
    exit 0
}
catch {
    Write-StartupLog ('ERROR: {0}' -f $_.Exception.Message)
    exit 1
}
