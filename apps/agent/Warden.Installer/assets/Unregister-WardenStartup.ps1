#Requires -Version 5.1
param(
    [Parameter(Mandatory = $true)]
    [string] $TaskName
)

$ErrorActionPreference = 'Continue'

& schtasks.exe /Delete /TN $TaskName /F
exit 0
