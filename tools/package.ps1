#Requires -Version 5.1
<#
  铁与王冠 · Iron & Crown —— 一键构建 Windows 独立版

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/package.ps1 -SkipInstall

  产出：
    dist\IronCrown-win32-x64\          可运行目录（双击 IronCrown.exe）
    dist\IronCrown-<version>-win64.zip 发布用压缩包
#>
param([switch]$SkipInstall)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $SkipInstall) {
  Write-Host '==> 安装依赖 (npm install)' -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install 失败（exit $LASTEXITCODE）" }
}

Write-Host '==> 打包 Electron 应用 (electron-packager)' -ForegroundColor Cyan
npx electron-packager . IronCrown --platform=win32 --arch=x64 --out=dist --overwrite --prune --icon=web/iron-crown.ico --app-version=1.0.0
if ($LASTEXITCODE -ne 0) { throw "electron-packager 失败（exit $LASTEXITCODE）" }

$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$appDir  = Join-Path $root 'dist\IronCrown-win32-x64'
if (-not (Test-Path -LiteralPath $appDir)) { throw "未找到构建目录：$appDir" }

$zip = Join-Path $root "dist\IronCrown-$version-win64.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

Write-Host "==> 压缩为 $zip" -ForegroundColor Cyan
$tar = Get-Command tar.exe -ErrorAction SilentlyContinue
if ($tar) {
  Push-Location $appDir
  try { & $tar.Source -a -c -f $zip . } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "压缩失败（exit $LASTEXITCODE）" }
} else {
  Compress-Archive -Path (Join-Path $appDir '*') -DestinationPath $zip -CompressionLevel Optimal
}

$mb = [math]::Round((Get-Item -LiteralPath $zip).Length / 1MB, 1)
Write-Host "==> 完成：$zip（$mb MB）" -ForegroundColor Green
