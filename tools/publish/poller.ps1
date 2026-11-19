#Requires -Version 5.1
<#
  GitHub device-flow login helper (no gh CLI required).

  Prints nothing by itself: run start-login.ps1 first to obtain the one-time
  code, then this script polls until the code is approved and writes
  %USERPROFILE%\.ironcrown-secrets\token.json.

  ASCII-only by design.
#>
param([string]$ClientId = '178c6fc778ccc68e1d6a')

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dir = Join-Path $env:USERPROFILE '.ironcrown-secrets'
$stPath = Join-Path $dir 'device.json'
if (-not (Test-Path -LiteralPath $stPath)) { Write-Host 'NO_DEVICE_STATE (run start-login.ps1 first)'; exit 2 }
$st = Get-Content -LiteralPath $stPath -Raw | ConvertFrom-Json
$expires = [datetime]::Parse($st.expires_at)
$interval = [int]$st.interval
if ($interval -lt 10) { $interval = 10 }

$tokenPath = Join-Path $dir 'token.json'
$ok = $false
while ((Get-Date) -lt $expires) {
  Start-Sleep -Seconds $interval
  $body = $null
  try {
    $body = Invoke-RestMethod -Method Post -Uri 'https://github.com/login/oauth/access_token' `
      -Headers @{ Accept = 'application/json'; 'User-Agent' = 'iron-crown-publisher' } `
      -Body @{ client_id = $ClientId; device_code = $st.device_code; grant_type = 'urn:ietf:params:oauth:grant-type:device_code' } `
      -TimeoutSec 25
  }
  catch {
    Write-Host ("{0} net-error" -f (Get-Date -Format HH:mm:ss))
    continue
  }

  if ($body.access_token) {
    @{ access_token = $body.access_token; token_type = $body.token_type; scope = $body.scope; obtained = (Get-Date).ToString('o') } |
      ConvertTo-Json | Set-Content -LiteralPath $tokenPath -Encoding UTF8
    Write-Host ("AUTH_OK scope={0}" -f $body.scope)
    $ok = $true
    break
  }

  Write-Host ("{0} {1}" -f (Get-Date -Format HH:mm:ss), $body.error)
  if ($body.error -eq 'slow_down') { $interval += 5; continue }
  if ($body.error -ne 'authorization_pending') { Write-Host ("AUTH_FAIL {0}" -f $body.error); break }
}

if (-not $ok) { Write-Host 'POLL_END no token' }
