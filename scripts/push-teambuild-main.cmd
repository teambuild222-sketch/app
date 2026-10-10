@echo off
cd /d "%~dp0.."
echo Current branch:
git branch --show-current
echo.
echo Latest commit:
git log -1 --oneline
echo.
echo Pushing to https://github.com/teambuild222-sketch/app.git (main)
echo Sign in as GitHub user teambuild222-sketch when prompted.
echo.
git push origin main --force-with-lease
if %ERRORLEVEL% EQU 0 (
  echo.
  echo OK: https://github.com/teambuild222-sketch/app/tree/main/backend/render.yaml
) else (
  echo.
  echo Push failed. Remove saved GitHub credentials for Aditya-skar in Windows Credential Manager, then retry.
)
pause
