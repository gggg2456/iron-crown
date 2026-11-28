#Requires -Version 5.1
<#
  Iron & Crown - build the Windows standalone and zip it.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -SkipInstall

  Output:
    dist\IronCrown-win32-x64\            runnable folder (double-click IronCrown.exe)
    dist\IronCrown-<version>-win64.zip   release archive

  ASCII-only by design: Windows PowerShell reads BOM-less scripts as ANSI,
  which breaks Chinese literals. Version comes from package.json (UTF-8).
#>
param([switch]$SkipInstall)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$version = (Get-Content package.json -Raw -Encoding UTF8 | ConvertFrom-Json).version
Write-Host "==> version $version" -ForegroundColor Cyan

if (-not $SkipInstall) {
  Write-Host '==> npm install' -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed (exit $LASTEXITCODE)" }
}

Write-Host '==> electron-packager' -ForegroundColor Cyan
npx electron-packager . IronCrown --platform=win32 --arch=x64 --out=dist --overwrite --prune --icon=web/iron-crown.ico --app-version=$version --ignore="^/(start-local-test\.cmd|tools/dev|docs|node_modules|\.github)"
if ($LASTEXITCODE -ne 0) { throw "electron-packager failed (exit $LASTEXITCODE)" }

$appDir = Join-Path $root 'dist\IronCrown-win32-x64'
if (-not (Test-Path -LiteralPath $appDir)) { throw "build folder missing: $appDir" }

$zip = Join-Path $root "dist\IronCrown-$version-win64.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

Write-Host "==> compress to $zip" -ForegroundColor Cyan
# Do NOT use `tar -a -c -f` here: it prefixes every entry with "./", and Windows
# Explorer's extractor then shows the archive as empty (0 items). ZipFile writes
# plain relative entries, which Explorer, Expand-Archive and 7-Zip all read.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory(
  $appDir, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)

$mb = [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 1)
Write-Host "==> done: $zip ($mb MB)" -ForegroundColor Green
