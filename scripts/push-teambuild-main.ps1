# Push local main to https://github.com/teambuild222-sketch/app
# Run from repo root. Sign in as GitHub user teambuild222-sketch (or use a PAT).

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

if ((git branch --show-current) -ne "main") {
  Write-Error "Switch to main first: git checkout main"
}

git log -1 --oneline
Write-Host "Target: origin -> teambuild222-sketch/app (main)"
Write-Host ""

git push origin main --force-with-lease
if ($LASTEXITCODE -eq 0) {
  Write-Host "OK: https://github.com/teambuild222-sketch/app/tree/main/backend/render.yaml"
}
