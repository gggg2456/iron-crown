#Requires -Version 5.1
<#
  Publish this repository to GitHub through the REST API - no git, no gh CLI.

  Why a REST publisher: the build machine has neither git nor GitHub CLI, but the
  batch API can still create the repo, push every file as a blob/tree/commit and
  attach the standalone zip to a Release.

  Auth: a GitHub OAuth token with `repo` scope, stored at
        %USERPROFILE%\.ironcrown-secrets\token.json  (created by poller.ps1)

  Usage (from the repository root):
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish\push.ps1 -SkipRelease
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\publish\push.ps1

  ASCII-only on purpose: Windows PowerShell reads BOM-less scripts as ANSI, so
  every non-ASCII string (repo description, commit message, release notes) lives
  in meta.json and is read as UTF-8 at runtime.
#>
param(
  [string]$Staging  = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
  [string]$RepoName = 'iron-crown',
  [string]$Owner,
  [string]$ZipPath  = '',
  [string]$Tag      = '',
  [string]$MetaPath = (Join-Path $PSScriptRoot 'meta.json'),
  [switch]$SkipRelease
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[Net.ServicePointManager]::DefaultConnectionLimit = 8

$sec = Join-Path $env:USERPROFILE '.ironcrown-secrets\token.json'
if (-not (Test-Path -LiteralPath $sec)) { throw "Missing token: $sec (run poller.ps1 first)" }
$token = (Get-Content -LiteralPath $sec -Raw | ConvertFrom-Json).access_token
if (-not $token) { throw "Empty token in $sec" }

$meta = [IO.File]::ReadAllText($MetaPath, [Text.UTF8Encoding]::new($false)) | ConvertFrom-Json

# Tag and asset name follow package.json, so a version bump is enough to cut a release.
$pkgPath = Join-Path $Staging 'package.json'
$version = if (Test-Path -LiteralPath $pkgPath) { (Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8 | ConvertFrom-Json).version } else { '1.0.0' }
if (-not $ZipPath) { $ZipPath = Join-Path $Staging "dist\IronCrown-$version-win64.zip" }
if (-not $Tag) { $Tag = "v$version" }
Write-Host "==> version $version (tag $Tag)"

$H  = @{ Authorization = "Bearer $token"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
$UA = @{ 'User-Agent' = 'iron-crown-publisher' }

function Api {
  param([string]$Method, [string]$Path, $Body, [switch]$AllowStatus)
  $uri = if ($Path -match '^https?://') { $Path } else { "https://api.github.com$Path" }
  $req = @{ Method = $Method; Uri = $uri; Headers = ($H + $UA); ErrorAction = 'Stop'; TimeoutSec = 120 }
  if ($null -ne $Body) {
    $json = ($Body | ConvertTo-Json -Depth 20 -Compress)
    $req.Body = [Text.Encoding]::UTF8.GetBytes($json)
    $req.ContentType = 'application/json; charset=utf-8'
  }
  $lastErr = $null
  for ($i = 1; $i -le 3; $i++) {
    try { return Invoke-RestMethod @req }
    catch {
      $code = $_.Exception.Response.StatusCode.value__
      $detail = $_.ErrorDetails.Message
      if ($AllowStatus -and $code) { return [pscustomobject]@{ __status = $code; __error = $detail } }
      if ($AllowStatus -and -not $code) { return [pscustomobject]@{ __status = 0; __error = $_.Exception.Message } }
      $lastErr = "API $Method $Path failed ($code): $detail $($_.Exception.Message)"
      Start-Sleep -Seconds (2 * $i)
    }
  }
  throw $lastErr
}

# 1) identity
$me = Api GET '/user'
$login = if ($Owner) { $Owner } else { $me.login }
Write-Host "==> account: $login"

# 2) repository
$repo = Api GET "/repos/$login/$RepoName" -AllowStatus
if ($repo.__status -eq 404) {
  Write-Host "==> creating public repo $login/$RepoName"
  $repo = Api POST '/user/repos' @{
    name         = $RepoName
    description  = $meta.description
    homepage     = ''
    private      = $false
    has_issues   = $true
    has_wiki     = $false
    has_projects = $false
    auto_init    = $false
  }
} elseif ($repo.__status) {
  throw "Repo lookup failed: $($repo.__error)"
} else {
  Write-Host "==> repo exists: $($repo.full_name) (default branch: $($repo.default_branch))"
}

# 3) parent commit, if any
$parentSha = $null
foreach ($br in @('main', 'master')) {
  $r = Api GET "/repos/$login/$RepoName/git/ref/heads/$br" -AllowStatus
  if (-not $r.__status) { $parentSha = $r.object.sha; Write-Host "==> parent commit on ${br}: $($parentSha.Substring(0,7))"; break }
}

# 4) blobs - skip build output and VCS internals
$skip = '\\(dist|node_modules|\.git|\.work)\\|\.zip$|\.png$'
$files = @(Get-ChildItem -LiteralPath $Staging -Recurse -File -Force |
  Where-Object { $_.FullName.Substring($Staging.Length) -notmatch $skip } |
  Sort-Object FullName)
Write-Host "==> uploading $($files.Count) files"
$entries = New-Object System.Collections.ArrayList
foreach ($f in $files) {
  $rel   = $f.FullName.Substring($Staging.Length + 1).Replace('\', '/')
  $bytes = [IO.File]::ReadAllBytes($f.FullName)
  $blob  = Api POST "/repos/$login/$RepoName/git/blobs" @{ content = [Convert]::ToBase64String($bytes); encoding = 'base64' }
  [void]$entries.Add([ordered]@{ path = $rel; mode = '100644'; type = 'blob'; sha = $blob.sha })
  Write-Host ("    + {0} ({1:N0} KB)" -f $rel, ($bytes.Length / 1KB))
}

# 5) tree + commit
$tree = Api POST "/repos/$login/$RepoName/git/trees" @{ tree = $entries.ToArray() }
$commitBody = [ordered]@{ message = $meta.commitMessage; tree = $tree.sha }
if ($parentSha) { $commitBody.parents = @($parentSha) }
$commit = Api POST "/repos/$login/$RepoName/git/commits" $commitBody

# 6) point main at the new commit
if ($parentSha) {
  Api PATCH "/repos/$login/$RepoName/git/refs/heads/main" @{ sha = $commit.sha; force = $true } | Out-Null
} else {
  Api POST "/repos/$login/$RepoName/git/refs" @{ ref = 'refs/heads/main'; sha = $commit.sha } | Out-Null
}
Write-Host "==> commit: $($commit.sha)"

# 7) release asset
if (-not $SkipRelease) {
  $rel = Api GET "/repos/$login/$RepoName/releases/tags/$Tag" -AllowStatus
  if (-not $rel.__status) {
    Write-Host "==> release $Tag already exists (id $($rel.id))"
  } else {
    Write-Host "==> creating release $Tag"
    $rel = Api POST "/repos/$login/$RepoName/releases" @{ tag_name = $Tag; name = $meta.releaseName; body = $meta.releaseBody; draft = $false; prerelease = $false }
  }

  $assets = Api GET "/repos/$login/$RepoName/releases/$($rel.id)/assets" -AllowStatus
  $dup = if (-not $assets.__status) { $assets | Where-Object { $_.name -eq (Split-Path -Leaf $ZipPath) } | Select-Object -First 1 }
  if ($dup) {
    Write-Host "==> asset already present: $($dup.browser_download_url)"
  } else {
    if (-not (Test-Path -LiteralPath $ZipPath)) { throw "Missing zip: $ZipPath (run: npm run dist)" }
    $zip  = Get-Item -LiteralPath $ZipPath
    $hash = (Get-FileHash -LiteralPath $ZipPath -Algorithm SHA256).Hash
    $body = $meta.releaseBody.Replace('{SIZE_MB}', ([math]::Round($zip.Length / 1MB, 1)).ToString()).Replace('{SHA256}', $hash).Replace('{LOGIN}', $login).Replace('{REPO}', $RepoName)
    $upd  = Api PATCH "/repos/$login/$RepoName/releases/$($rel.id)" @{ body = $body } -AllowStatus
    Write-Host ("==> uploading {0} ({1:N1} MB)" -f $zip.Name, ($zip.Length / 1MB))
    $uploadUrl = "https://uploads.github.com/repos/$login/$RepoName/releases/$($rel.id)/assets?name=$([uri]::EscapeDataString($zip.Name))"
    $resp = Invoke-RestMethod -Method Post -Uri $uploadUrl -Headers ($H + $UA + @{ 'Content-Type' = 'application/zip' }) -InFile $zip.FullName -TimeoutSec 3600
    Write-Host "==> asset uploaded: $($resp.browser_download_url)"
  }
}

Write-Host "==> repo: https://github.com/$login/$RepoName"
