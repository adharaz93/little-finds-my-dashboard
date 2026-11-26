<#
.SYNOPSIS
  Commits and pushes an exact allowlist of task files for Little Finds MY. Nothing else is staged.

.DESCRIPTION
  Without -AutoApprove this is a dry run: it validates the allowlist and shows what would be
  committed, and changes nothing. With -AutoApprove it stages each listed file explicitly, verifies
  the staged set equals the allowlist, checks whitespace, commits and pushes (never force-pushes).
  It never resets, restores, stashes, cleans or deletes anything. If a check fails it stops and
  reports; it does not retry or amend.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\Commit-LfmTask.ps1 -Files src\lib\a.ts,tests\a.test.ts -Message "Do a thing"
  (dry run)

.EXAMPLE
  ... -Files src\lib\a.ts,tests\a.test.ts -MessageFile msg.txt -AutoApprove
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string[]]$Files,
  [string]$Message,
  [string]$MessageFile,
  [switch]$AutoApprove,
  [string]$Branch = "taste-experiment",
  [string]$Remote = "origin"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Files that must never be committed by this script.
$Protected = @("next.config.ts", "audit-data-model.txt", "audit-integrations.txt", "README-SETUP.txt")
$ForbiddenPrefixes = @(".next/", "node_modules/", "test-results/", "playwright-report/", "blob-report/", "playwright/.cache/", ".git/")

function Fail([string]$Text) { Write-Host "STOPPED: $Text" -ForegroundColor Red; exit 1 }
function Git-Lines([string[]]$GitArgs) {
  # stdout only; git's warnings on stderr go to the console and never become errors here.
  $out = & git @GitArgs
  if ($LASTEXITCODE -ne 0) { Fail "git $($GitArgs -join ' ') failed (exit $LASTEXITCODE)." }
  # Callers wrap the result in @(...): PowerShell 5.1 unwraps one-item arrays on return.
  return @($out | Where-Object { $_ -ne $null -and $_ -ne "" })
}

if (-not (Test-Path "package.json") -or -not (Test-Path ".git")) { Fail "Run this script from the project root." }
if (($Message -and $MessageFile) -or (-not $Message -and -not $MessageFile)) { Fail "Give exactly one of -Message or -MessageFile." }
if ($MessageFile -and -not (Test-Path $MessageFile)) { Fail "Message file not found: $MessageFile" }

# 1. Branch
$current = (Git-Lines @("branch", "--show-current")) -join ""
if ($current -ne $Branch) { Fail "On branch '$current', expected '$Branch'." }

# 2. Nothing may be staged before we start (it would be committed by accident).
$preStaged = @(Git-Lines @("diff", "--cached", "--name-only"))
if ($preStaged.Count -gt 0) { Fail "Files are already staged: $($preStaged -join ', '). Unstage them yourself, then rerun." }

# 3. Validate the allowlist.
$allow = @()
foreach ($raw in $Files) {
  foreach ($part in ($raw -split ",")) {
    $f = $part.Trim() -replace "\\", "/"
    if ($f -eq "") { continue }
    if ($f -match '[\*\?\[\]]' -or $f -in @(".", "..", "-A", "--all") -or $f.StartsWith("-") -or $f.StartsWith("/") -or $f -match '^[A-Za-z]:' -or $f.Contains("..")) {
      Fail "Not an exact relative file path: '$f'. Broad or absolute paths are not allowed."
    }
    if ($Protected -contains $f) { Fail "'$f' is protected and is never committed by this script." }
    $leaf = Split-Path $f -Leaf
    if ($leaf -like ".env*") { Fail "'$f' looks like an environment/secrets file." }
    foreach ($p in $ForbiddenPrefixes) { if ($f.StartsWith($p)) { Fail "'$f' is generated output or local data." } }
    if (Test-Path $f -PathType Container) { Fail "'$f' is a folder. List each file explicitly." }
    # Windows PowerShell 5.1 turns redirected native stderr into a terminating error under "Stop".
    $ErrorActionPreference = "Continue"
    & git ls-files --error-unmatch -- $f 2>$null | Out-Null; $isTracked = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = "Stop"
    if (-not (Test-Path $f) -and -not $isTracked) { Fail "'$f' does not exist." }
    $status = @(Git-Lines @("status", "--porcelain", "--", $f))
    if ($status.Count -eq 0) { Fail "'$f' has no changes to commit." }
    if ($allow -notcontains $f) { $allow += $f }
  }
}
if ($allow.Count -eq 0) { Fail "The allowlist is empty." }

Write-Host "`nAllowlist ($($allow.Count) files):" -ForegroundColor Cyan
$allow | ForEach-Object { Write-Host "  $_" }
Write-Host "`nCurrent status of these files:" -ForegroundColor Cyan
& git status --short -- @allow

if (-not $AutoApprove) {
  Write-Host "`nDRY RUN: nothing was staged, committed or pushed. Rerun with -AutoApprove after all quality gates pass." -ForegroundColor Yellow
  exit 0
}

# 4. Stage exactly these files, one by one.
foreach ($f in $allow) {
  & git add -- $f
  if ($LASTEXITCODE -ne 0) { Fail "git add failed for '$f'. Some files may be staged; nothing was committed." }
}

# 5. The staged set must equal the allowlist, with no protected file.
$staged = @(Git-Lines @("diff", "--cached", "--name-only") | ForEach-Object { $_ -replace "\\", "/" })
$extra = @($staged | Where-Object { $allow -notcontains $_ })
$missing = @($allow | Where-Object { $staged -notcontains $_ })
if ($extra.Count -gt 0 -or $missing.Count -gt 0) {
  Fail "Staged files differ from the allowlist. Extra: [$($extra -join ', ')] Missing: [$($missing -join ', ')]. Nothing was committed; review the index yourself."
}
foreach ($p in $Protected) { if ($staged -contains $p) { Fail "Protected file '$p' is staged. Nothing was committed." } }

# 6. Whitespace check on exactly what will be committed (includes new files).
& git diff --cached --check
if ($LASTEXITCODE -ne 0) { Fail "git diff --cached --check found whitespace problems. Nothing was committed." }

Write-Host "`nStaged for commit:" -ForegroundColor Cyan
& git diff --cached --name-status

# 7. Commit (message from a UTF-8 file, so multi-line messages and trailers are kept exactly).
$tmp = $null
try {
  if ($Message) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $Message, (New-Object System.Text.UTF8Encoding($false)))
    $msgPath = $tmp
  } else { $msgPath = (Resolve-Path $MessageFile).Path }
  & git commit -F $msgPath
  if ($LASTEXITCODE -ne 0) { Fail "git commit failed (exit $LASTEXITCODE). Files remain staged." }
} finally {
  if ($tmp -and (Test-Path $tmp)) { Remove-Item $tmp -Force }
}
$hash = (Git-Lines @("rev-parse", "--short", "HEAD")) -join ""
Write-Host "`nCommitted $hash." -ForegroundColor Green

# 8. Push. Never force; on failure report and stop (no retry, no amend).
& git push $Remote $Branch
if ($LASTEXITCODE -ne 0) {
  Write-Host "PUSH FAILED (exit $LASTEXITCODE). Commit $hash exists locally only. Investigate before retrying." -ForegroundColor Red
  exit 2
}
Write-Host "Pushed $hash to $Remote/$Branch." -ForegroundColor Green
