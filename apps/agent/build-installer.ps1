#Requires -Version 5.1
<#
.SYNOPSIS
  Publishes Warden.Tray (self-contained win-x64) and builds the WiX MSI.

.PARAMETER ApiBaseUrl
  Optional staging override for the dashboard URL baked into install-time
  warden.json. When omitted, reads apiBaseUrl from apps/agent/Warden.Tray/warden.json
  (the single source of truth).

.PARAMETER Configuration
  Build configuration (default Release).

.EXAMPLE
  .\build-installer.ps1
.EXAMPLE
  .\build-installer.ps1 -ApiBaseUrl https://staging.example
#>
[CmdletBinding()]
param(
    [string] $ApiBaseUrl = '',

    [string] $Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-ExitCode([string] $step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$step failed with exit code $LASTEXITCODE"
    }
}

function Read-RepoApiBaseUrl([string] $wardenJsonPath) {
    if (-not (Test-Path -LiteralPath $wardenJsonPath)) {
        throw "Missing $wardenJsonPath (expected single source of truth for apiBaseUrl)."
    }
    $json = Get-Content -LiteralPath $wardenJsonPath -Raw | ConvertFrom-Json
    return [string]$json.apiBaseUrl
}

function Assert-ValidApiBaseUrl([string] $url) {
    if ([string]::IsNullOrWhiteSpace($url)) {
        throw 'apiBaseUrl is empty. Set it in Warden.Tray/warden.json or pass -ApiBaseUrl.'
    }
    if ($url -match 'WARDEN_API_BASE_URL_NOT_SET') {
        throw 'apiBaseUrl looks like the installer placeholder. Set the real dashboard URL in Warden.Tray/warden.json.'
    }
    $uri = $null
    if (-not [Uri]::TryCreate($url, [UriKind]::Absolute, [ref]$uri)) {
        throw "apiBaseUrl is not an absolute URI: '$url'"
    }
    if ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https') {
        throw "apiBaseUrl must be http or https: '$url'"
    }
}

$agentRoot = $PSScriptRoot
$trayProject = Join-Path $agentRoot 'Warden.Tray\Warden.Tray.csproj'
$wardenJsonPath = Join-Path $agentRoot 'Warden.Tray\warden.json'
$installerProject = Join-Path $agentRoot 'Warden.Installer\Warden.Installer.wixproj'
$publishDir = Join-Path $agentRoot 'Warden.Tray\bin\Release\net8.0-windows\win-x64\publish'
$artifactsDir = Join-Path $agentRoot 'artifacts'

if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
    $ApiBaseUrl = Read-RepoApiBaseUrl $wardenJsonPath
    Write-Host "==> ApiBaseUrl from warden.json: $ApiBaseUrl"
} else {
    Write-Host "==> ApiBaseUrl override: $ApiBaseUrl"
}

Assert-ValidApiBaseUrl $ApiBaseUrl

Write-Host "==> Publishing Warden.Tray ($Configuration, win-x64, self-contained)"
dotnet publish $trayProject -c $Configuration -r win-x64 --self-contained true
Assert-ExitCode 'dotnet publish'

if (-not (Test-Path -LiteralPath (Join-Path $publishDir 'Warden.Tray.exe'))) {
    throw "Publish output missing Warden.Tray.exe under $publishDir"
}

$publishDirFull = [System.IO.Path]::GetFullPath($publishDir)
if (-not $publishDirFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $publishDirFull += [System.IO.Path]::DirectorySeparatorChar
}

Write-Host "==> Building MSI (Warden.Installer)"
dotnet build $installerProject -c $Configuration -p:PublishDir=$publishDirFull -p:WardenApiBaseUrl=$ApiBaseUrl
Assert-ExitCode 'dotnet build Warden.Installer'

$msiBuilt = Get-ChildItem -Path (Join-Path $agentRoot 'Warden.Installer\bin') -Filter 'Warden.msi' -Recurse |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $msiBuilt) {
    throw 'Warden.msi was not produced under Warden.Installer\bin'
}

# Read version from Directory.Build.props (single source of truth).
$propsPath = Join-Path $agentRoot 'Directory.Build.props'
$propsXml = [xml](Get-Content -LiteralPath $propsPath -Raw)
$version = $propsXml.Project.PropertyGroup.Version
if (-not $version) {
    throw "Could not read <Version> from $propsPath"
}

New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null
$outName = "Warden-$version-x64.msi"
$outPath = Join-Path $artifactsDir $outName
Copy-Item -LiteralPath $msiBuilt.FullName -Destination $outPath -Force

$hash = (Get-FileHash -LiteralPath $outPath -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item -LiteralPath $outPath).Length

Write-Host ""
Write-Host "MSI:      $outPath"
Write-Host "Size:     $size bytes"
Write-Host "SHA-256:  $hash"
Write-Host ""
Write-Host "Install example (on child PC, elevated):"
Write-Host "  msiexec /i `"$outName`" CHILDUSER=`"CHILDPC\ChildAccount`""
