[CmdletBinding()]
param(
  [string]$BrowserScript = "test:e2e",
  [switch]$AllowMissingBrowserScript
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Check([string]$Label, [scriptblock]$Command) {
  Write-Host "`n=== $Label ===" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$Label failed (exit $LASTEXITCODE)." }
}
if (-not (Test-Path "package.json")) { throw "Run this script from the project root." }

Invoke-Check "Unit tests" { npm.cmd test }
Invoke-Check "Lint" { npm.cmd run lint }
# Build before TypeScript: the build regenerates Next's route types, so a deleted page can't leave
# stale generated types that make tsc fail on a clean tree.
Invoke-Check "Production build" { npm.cmd run build }
Invoke-Check "TypeScript" { npx.cmd tsc --noEmit }

Write-Host "`n=== Diff whitespace check ===" -ForegroundColor Cyan
git diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed." }

$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$scripts = $pkg.scripts
if ($scripts -and $scripts.PSObject.Properties.Name -contains $BrowserScript) {
  Invoke-Check "Browser E2E ($BrowserScript)" { npm.cmd run $BrowserScript }
} elseif ($AllowMissingBrowserScript) {
  Write-Warning "Browser E2E '$BrowserScript' is not configured. Browser QA NOT RUN."
} else {
  throw "Browser E2E '$BrowserScript' is not configured. Configure isolated E2E tests before automatic commit."
}
Write-Host "`nALL CONFIGURED QUALITY GATES PASSED." -ForegroundColor Green
