#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string] $TaskName
)

$ErrorActionPreference = 'Continue'

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
    catch { }
}

Write-StartupLog ('Unregister-WardenStartup starting. TaskName={0}' -f $TaskName)
$out = & schtasks.exe /Delete /TN $TaskName /F 2>&1 | Out-String
Write-StartupLog ('schtasks /Delete exit={0} output={1}' -f $LASTEXITCODE, $out.Trim())
Write-StartupLog 'Unregister-WardenStartup finished'
exit 0
