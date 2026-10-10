@echo off
cd /d "%~dp0..\frontend"
echo Starting SIMSOR dev server (uses npm.cmd — no PowerShell script policy needed)
echo Open the URL Vite prints, usually http://localhost:5173
echo.
call npm.cmd run dev
