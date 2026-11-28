#Requires -Version 5.1
<#
  Build the GitHub Pages site into .\docs from .\web.

  The Electron build opens web/story.html as the entry point, but GitHub Pages
  can only serve a branch subfolder as the site root and always maps the root to
  index.html. So the story page becomes docs/index.html (site entry) and the
  game page moves to docs/game.html; every "index.html?autostart=1" link is
  rewritten accordingly.

  ASCII-only by design (Windows PowerShell reads BOM-less scripts as ANSI).
#>
param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$web  = Join-Path $root 'web'
$docs = Join-Path $root 'docs'
$utf8 = [Text.UTF8Encoding]::new($false)

if (-not (Test-Path -LiteralPath (Join-Path $web 'story.html'))) { throw "web/story.html not found under $root" }
if (Test-Path -LiteralPath $docs) {
  # antivirus / indexers occasionally hold a handle for a moment: retry instead of failing
  for ($i = 0; $i -lt 6; $i++) {
    try { Remove-Item -LiteralPath $docs -Recurse -Force -ErrorAction Stop; break }
    catch { Start-Sleep -Milliseconds 600 }
  }
  if (Test-Path -LiteralPath $docs) { throw "cannot clear $docs (file locked)" }
}
New-Item -ItemType Directory -Path $docs | Out-Null

foreach ($f in @('game.js', 'style.css', 'iron-crown.ico', 'intro.html', 'manual.html')) {
  Copy-Item -LiteralPath (Join-Path $web $f) -Destination $docs
}
Copy-Item -LiteralPath (Join-Path $web 'audio') -Destination (Join-Path $docs 'audio') -Recurse

# game page -> game.html
$game = [IO.File]::ReadAllText((Join-Path $web 'index.html'), $utf8)
[IO.File]::WriteAllText((Join-Path $docs 'game.html'), $game, $utf8)

# story page -> site root index.html, with entry links pointing at game.html
$story = [IO.File]::ReadAllText((Join-Path $web 'story.html'), $utf8)
$story = $story.Replace('index.html?autostart=1', 'game.html?autostart=1')
# the prologue CTA is a plain href="index.html"; on the site root that file is this
# very page, so it has to be rewritten too or the button reloads the prologue.
$story = $story.Replace('href="index.html"', 'href="game.html"')
[IO.File]::WriteAllText((Join-Path $docs 'index.html'), $story, $utf8)

# keep Jekyll away
[IO.File]::WriteAllText((Join-Path $docs '.nojekyll'), '', $utf8)

$count = (Get-ChildItem -LiteralPath $docs -Recurse -File -Force).Count
$bytes = (Get-ChildItem -LiteralPath $docs -Recurse -File -Force | Measure-Object Length -Sum).Sum
if (-not $Quiet) {
  Write-Host ("pages site built: {0} files, {1:N0} bytes -> {2}" -f $count, $bytes, $docs)
}
