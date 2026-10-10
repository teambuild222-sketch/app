# Push local main to the canonical GitHub repo: teambuild222-sketch/app
# Run from repo root in PowerShell while signed in as teambuild222-sketch (or use a PAT).
#
# Why --force-with-lease: GitHub still has an old "initial commit" tree (SIMSOR/backend stub).
# Your local main has the full backend + backend/render.yaml.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $repoRoot "..")

$remote = "https://github.com/teambuild222-sketch/app.git"

Write-Host "Repo root: $(Get-Location)"
Write-Host "Target:    $remote (branch main)"
Write-Host ""
Write-Host "You must authenticate as GitHub user teambuild222-sketch."
Write-Host "If push fails with 403, create a PAT: GitHub -> Settings -> Developer settings ->"
Write-Host "Fine-grained token -> repo teambuild222-sketch/app -> Contents: Read and write."
Write-Host ""

$branch = git branch --show-current
if ($branch -ne "main") {
  Write-Warning "Current branch is '$branch', not main. Switch with: git checkout main"
  exit 1
}

git log -1 --oneline
Write-Host ""
$confirm = Read-Host "Push this commit to teambuild222-sketch/app main? (y/N)"
if ($confirm -notmatch '^[yY]') {
  Write-Host "Cancelled."
  exit 0
}

git push $remote main --force-with-lease
if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Done. Verify: https://github.com/teambuild222-sketch/app/tree/main/backend/render.yaml"
  Write-Host "Then Render Blueprint -> teambuild222-sketch/app"
} else {
  Write-Host ""
  Write-Host "Push failed. Common fixes:"
  Write-Host "  - Sign out of Git Credential Manager for github.com and retry (use teambuild222-sketch)."
  Write-Host "  - Or: git push https://<PAT>@github.com/teambuild222-sketch/app.git main --force-with-lease"
  exit $LASTEXITCODE
}
