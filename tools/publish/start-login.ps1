#Requires -Version 5.1
<#
  Step 1 of the GitHub device-flow login: request a one-time code.

  Then open https://github.com/login/device, enter the printed code, approve the
  `repo` scope, and run poller.ps1 (or let it run in another window) until it
  prints AUTH_OK. The token lands in %USERPROFILE%\.ironcrown-secrets\token.json.

  ASCII-only by design.
#>
param([string]$ClientId = '178c6fc778ccc68e1d6a')

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$r = Invoke-RestMethod -Method Post -Uri 'https://github.com/login/device/code' `
  -Headers @{ Accept = 'application/json'; 'User-Agent' = 'iron-crown-publisher' } `
  -Body @{ client_id = $ClientId; scope = 'repo' } -TimeoutSec 30

$dir = Join-Path $env:USERPROFILE '.ironcrown-secrets'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@{ device_code = $r.device_code; interval = $r.interval; expires_at = (Get-Date).AddSeconds($r.expires_in).ToString('o') } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dir 'device.json') -Encoding UTF8

Write-Host ""
Write-Host "  1. open  $($r.verification_uri)"
Write-Host "  2. enter $($r.user_code)"
Write-Host "  3. approve the 'repo' scope"
Write-Host ""
Write-Host "  code expires at $((Get-Date).AddSeconds($r.expires_in).ToString('HH:mm:ss'))"
Write-Host "  now run: powershell -File tools\publish\poller.ps1"
