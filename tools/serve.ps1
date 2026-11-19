#Requires -Version 5.1
<#
  Iron & Crown - local test server (private, loopback only).

  GitHub Pages is disabled on purpose: this game is a private test build.
  Run start-test.cmd in the repository root, or:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1

  Serves ./web on http://127.0.0.1:8765 (falls back to 8766..8770 if busy)
  and opens the prologue page. Ctrl+C stops it.

  ASCII-only by design.
#>
param(
  [int]$Port = 8765,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Join-Path (Split-Path -Parent $PSScriptRoot) 'web'
if (-not (Test-Path -LiteralPath $root)) { throw "web folder not found: $root" }

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.ico'  = 'image/x-icon'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.wav'  = 'audio/wav'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = $null
for ($p = $Port; $p -lt $Port + 6; $p++) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p)
    $l.Start()
    $listener = $l
    $Port = $p
    break
  } catch { }
}
if (-not $listener) { throw "no free port in $($Port)..$($Port+5)" }

$url = "http://127.0.0.1:$Port/story.html"
Write-Host ""
Write-Host "  Iron & Crown - local test server" -ForegroundColor Cyan
Write-Host "  root : $root"
Write-Host "  url  : $url" -ForegroundColor Green
Write-Host "  stop : Ctrl+C"
Write-Host ""
if (-not $NoBrowser) { Start-Process $url | Out-Null }

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 5000
    $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII)
    $requestLine = $reader.ReadLine()
    $guard = 0
    while ($true) {
      $line = $reader.ReadLine()
      if ($null -eq $line -or $line -eq '') { break }
      $guard++
      if ($guard -gt 100) { break }
    }
    if (-not $requestLine) { continue }

    $parts = $requestLine.Split(' ')
    $target = if ($parts.Length -ge 2) { $parts[1] } else { '/' }
    $path = [Uri]::UnescapeDataString(($target.Split('?')[0]))
    if ($path -eq '/' -or $path -eq '') { $path = '/story.html' }

    $file = Join-Path $root $path.TrimStart('/')
    $status = '200 OK'
    if ((Test-Path -LiteralPath $file) -and -not (Test-Path -LiteralPath $file -PathType Container)) {
      $body = [IO.File]::ReadAllBytes($file)
    } else {
      $status = '404 Not Found'
      $body = [Text.Encoding]::UTF8.GetBytes("404 - $path not found")
    }
    $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
    $ct = $mime[$ext]
    if (-not $ct) { $ct = 'application/octet-stream' }

    $head = "HTTP/1.1 $status`r`nContent-Type: $ct`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $hb = [Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    $stream.Write($body, 0, $body.Length)
    $stream.Flush()
  } catch {
  } finally {
    $client.Close()
  }
}
